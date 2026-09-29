import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RETENTION_DAYS } from '@/lib/config';
import {
  claimRetentionUser,
  removeUserObjects,
  runRetention,
  type RetentionResult,
} from '@/lib/retention-run';
import type { Database } from '@/lib/supabase/types';

// Runs against the local Supabase stack (see vitest.integration.config.ts).
// Instead of backdating timestamps, `now` is chosen so that users created
// before a boundary are older than RETENTION_DAYS and users created after it
// are not.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin: SupabaseClient<Database> = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type TestUser = { id: string; createdAt: Date; client: SupabaseClient<Database> };

async function signInAnonymously(): Promise<TestUser> {
  const client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error('no user');
  return { id: data.user.id, createdAt: new Date(data.user.created_at), client };
}

async function addDataFor(user: TestUser): Promise<void> {
  const { error: notebookError } = await user.client.from('notebooks').insert({ title: 'Mine' });
  if (notebookError) throw notebookError;
  const pdf = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
  const wav = new Blob(['RIFF test'], { type: 'audio/wav' });
  const uploads = await Promise.all([
    admin.storage
      .from('sources')
      .upload(`${user.id}/source.pdf`, pdf, { contentType: 'application/pdf' }),
    admin.storage
      .from('audio')
      .upload(`${user.id}/overview.wav`, wav, { contentType: 'audio/wav' }),
  ]);
  for (const { error } of uploads) if (error) throw error;
}

async function userExists(id: string): Promise<boolean> {
  const { data } = await admin.auth.admin.getUserById(id);
  return Boolean(data.user);
}

async function notebookCount(id: string): Promise<number> {
  const { count } = await admin
    .from('notebooks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', id);
  return count ?? 0;
}

async function objectCount(id: string): Promise<number> {
  const lists = await Promise.all(
    ['sources', 'audio'].map((bucket: string) => admin.storage.from(bucket).list(id)),
  );
  return lists.reduce((sum: number, { data }) => sum + (data?.length ?? 0), 0);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('retention cleanup against the local stack', () => {
  let stale: TestUser;
  let failing: TestUser;
  let demoOwner: TestUser;
  let active: TestUser;
  let result: RetentionResult;
  let previousDemoOwner: string | null = null;

  beforeAll(async (): Promise<void> => {
    stale = await signInAnonymously();
    failing = await signInAnonymously();
    demoOwner = await signInAnonymously();
    await sleep(50);
    active = await signInAnonymously();
    await Promise.all([stale, failing, demoOwner, active].map(addDataFor));

    const { data: settings } = await admin
      .from('app_settings')
      .select('demo_owner_id')
      .maybeSingle();
    previousDemoOwner = settings?.demo_owner_id ?? null;
    const { error } = await admin
      .from('app_settings')
      .upsert({ id: true, demo_owner_id: demoOwner.id });
    if (error) throw error;

    // Everyone created before the boundary is RETENTION_DAYS + a bit old at `now`.
    const boundary = new Date((demoOwner.createdAt.getTime() + active.createdAt.getTime()) / 2);
    const now = new Date(boundary.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

    result = await runRetention({
      client: admin,
      now,
      removeObjects: async (client, userId: string): Promise<number> => {
        if (userId === failing.id) throw new Error('simulated storage failure');
        return removeUserObjects(client, userId);
      },
    });
  });

  afterAll(async (): Promise<void> => {
    // Put back what was there. `maybeSingle()` returning null means there was no
    // row at all, so upserting one would leave app_settings populated forever —
    // which breaks rls.test.sql, whose own `insert into app_settings` then trips
    // the primary key on every later `pnpm db:test`.
    if (previousDemoOwner === null) {
      const { error } = await admin.from('app_settings').delete().eq('id', true);
      if (error) throw error;
      return;
    }
    await admin.from('app_settings').upsert({ id: true, demo_owner_id: previousDemoOwner });
  });

  it('deletes a stale user with all rows and storage objects', async (): Promise<void> => {
    expect(await userExists(stale.id)).toBe(false);
    expect(await notebookCount(stale.id)).toBe(0);
    expect(await objectCount(stale.id)).toBe(0);
  });

  it('keeps an active user', async (): Promise<void> => {
    expect(await userExists(active.id)).toBe(true);
    expect(await notebookCount(active.id)).toBe(1);
    expect(await objectCount(active.id)).toBe(2);
  });

  it('never deletes the demo owner', async (): Promise<void> => {
    expect(await userExists(demoOwner.id)).toBe(true);
    expect(await objectCount(demoOwner.id)).toBe(2);
  });

  it('keeps the user and rows when their storage cleanup fails', async (): Promise<void> => {
    expect(await userExists(failing.id)).toBe(true);
    expect(await notebookCount(failing.id)).toBe(1);
    expect(result.usersFailed).toBeGreaterThanOrEqual(1);
  });

  it('reports counts', (): void => {
    expect(result.usersDeleted).toBeGreaterThanOrEqual(1);
    expect(result.objectsRemoved).toBeGreaterThanOrEqual(2);
  });
});

describe('touch_last_seen against the local stack', () => {
  it('records a visit and does not write again within a day', async (): Promise<void> => {
    const user = await signInAnonymously();

    await user.client.rpc('touch_last_seen');
    const first = await admin
      .from('user_activity')
      .select('last_seen_at')
      .eq('user_id', user.id)
      .single();
    expect(first.error).toBeNull();

    await sleep(20);
    await user.client.rpc('touch_last_seen');
    const second = await admin
      .from('user_activity')
      .select('last_seen_at')
      .eq('user_id', user.id)
      .single();

    expect(second.data?.last_seen_at).toBe(first.data?.last_seen_at);
  });

  it('cannot be read or written by the user directly', async (): Promise<void> => {
    const user = await signInAnonymously();
    const { error } = await user.client
      .from('user_activity')
      .insert({ user_id: user.id, last_seen_at: new Date(Date.now() + 1e10).toISOString() });
    expect(error?.code).toBe('42501');
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;

describe('the retention claim against the local stack', () => {
  // The cutoff sits a moment after sign-in: the user counts as stale, and
  // anything they do from then on is more recent than it. The pause makes that
  // ordering real rather than a race — `touch_last_seen` writes `now()`.
  const STALE_AFTER_MS = 500;
  const VISIT_DELAY_MS = 1500;

  async function staleUser(): Promise<{ user: TestUser; cutoff: string }> {
    const user = await signInAnonymously();
    const cutoff = new Date(user.createdAt.getTime() + STALE_AFTER_MS).toISOString();
    await sleep(VISIT_DELAY_MS);
    return { user, cutoff };
  }

  it('grants the claim once, then refuses a second run', async (): Promise<void> => {
    const { user, cutoff } = await staleUser();

    expect(await claimRetentionUser(admin, user.id, cutoff)).toBe(true);
    // Inside RETENTION_RETRY_AFTER the claim is not refreshed, so an
    // overlapping or retried run cannot work on the same user.
    expect(await claimRetentionUser(admin, user.id, cutoff)).toBe(false);
  });

  it('refuses a user who visited after the candidate query', async (): Promise<void> => {
    const { user, cutoff } = await staleUser();

    await user.client.rpc('touch_last_seen');

    expect(await claimRetentionUser(admin, user.id, cutoff)).toBe(false);
  });
});

describe('a visit that lands between selection and the claim', () => {
  it('skips the user and leaves their files and rows alone', async (): Promise<void> => {
    const returning = await signInAnonymously();
    await addDataFor(returning);

    // `returning` is a candidate at this cutoff and stopped being one at the
    // visiting moment inside the run below.
    const now = new Date(returning.createdAt.getTime() + RETENTION_DAYS * DAY_MS + 1000);
    await sleep(1500);

    const attempted: string[] = [];
    const result = await runRetention({
      client: admin,
      now,
      claimUser: async (client, userId, inactiveBefore): Promise<boolean> => {
        attempted.push(userId);
        // The visit is the real one; only its timing is arranged. The claim
        // below therefore has to refuse on the strength of its own re-check.
        if (userId === returning.id) await returning.client.rpc('touch_last_seen');
        return claimRetentionUser(client, userId, inactiveBefore);
      },
    });

    // Without this the test could pass because the user was never a candidate
    // in the first place — a batch is only RETENTION_BATCH_SIZE wide.
    expect(attempted).toContain(returning.id);
    expect(result.usersSkipped).toBeGreaterThanOrEqual(1);
    expect(await userExists(returning.id)).toBe(true);
    expect(await notebookCount(returning.id)).toBe(1);
    expect(await objectCount(returning.id)).toBe(2);
  });
});
