import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RETENTION_RETRY_AFTER } from '@/lib/config';
import { runRetention } from '@/lib/retention-run';
import type { Database } from '@/lib/supabase/types';

// The Supabase client is the module's I/O boundary and is injected; the
// decision (who is stale, who may be claimed) and the failure handling are what
// these tests exercise. `lib/retention-run.integration.test.ts` covers the real
// client against the local stack.

const STALE_USER = '11111111-1111-4111-8111-111111111111';
const ANCIENT = '2020-01-01T00:00:00.000Z';

type UpstreamError = { code?: string; status?: number; message?: string };

type FakeOptions = {
  deleteUserError?: UpstreamError | null;
  /** Whether the claim is granted; false is a user who is no longer eligible. */
  claim?: boolean;
  /** An error from the claim call itself, as opposed to a refused claim. */
  claimError?: UpstreamError | null;
  onRpc?: (name: string, args: Record<string, unknown>) => void;
  onDeleteUser?: () => void;
};

function fakeClient({
  deleteUserError = null,
  claim = true,
  claimError = null,
  onRpc = (): void => {},
  onDeleteUser = (): void => {},
}: FakeOptions = {}): SupabaseClient<Database> {
  const client = {
    // The module makes two different rpc calls, so the fake has to answer by
    // name: returning the candidate array for the claim would be truthy and
    // would let a claim bug pass unnoticed.
    rpc: async (name: string, args: Record<string, unknown>) => {
      onRpc(name, args);
      if (name === 'claim_retention_user') {
        return { data: claimError ? null : claim, error: claimError };
      }
      return {
        data: [{ user_id: STALE_USER, is_anonymous: true, last_active_at: ANCIENT }],
        error: null,
      };
    },
    from: () => ({
      select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
    }),
    auth: {
      admin: {
        deleteUser: async () => {
          onDeleteUser();
          return {
            data: { user: deleteUserError ? null : { id: STALE_USER } },
            error: deleteUserError,
          };
        },
      },
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

function loggedFailure(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  expect(spy).toHaveBeenCalledTimes(1);
  return JSON.parse(String(spy.mock.calls[0][0])) as Record<string, unknown>;
}

const noObjects = async (): Promise<number> => 0;

describe('runRetention failure logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the failing step and the upstream code, never the message', async (): Promise<void> => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runRetention({
      client: fakeClient({
        deleteUserError: { code: 'unexpected_failure', message: 'boom\nsecret' },
      }),
      removeObjects: noObjects,
    });

    expect(result.usersFailed).toBe(1);
    const entry = loggedFailure(spy);
    expect(entry.event).toBe('retention_user_failed');
    expect(entry.userId).toBe(STALE_USER);
    expect(entry.operation).toBe('delete_user');
    expect(entry.code).toBe('unexpected_failure');
    expect(JSON.stringify(entry)).not.toContain('boom');
  });

  it('logs the storage step when the objects cannot be removed', async (): Promise<void> => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runRetention({
      client: fakeClient(),
      removeObjects: async (): Promise<number> => {
        throw new Error('Failed to remove storage objects', { cause: { code: 'NoSuchBucket' } });
      },
    });

    expect(result.usersFailed).toBe(1);
    const entry = loggedFailure(spy);
    expect(entry.operation).toBe('remove_objects');
    expect(entry.code).toBe('NoSuchBucket');
  });

  it('logs the claim step when the claim call fails', async (): Promise<void> => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runRetention({
      client: fakeClient({ claimError: { code: '08006', message: 'connection closed' } }),
      removeObjects: noObjects,
    });

    expect(result.usersFailed).toBe(1);
    expect(result.usersSkipped).toBe(0);
    const entry = loggedFailure(spy);
    expect(entry.operation).toBe('claim');
    expect(entry.code).toBe('08006');
  });

  it('falls back to an unknown code for anything that is not a plain code', async (): Promise<void> => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runRetention({
      client: fakeClient({ deleteUserError: { code: 'not a code, a sentence' } }),
      removeObjects: noObjects,
    });

    expect(loggedFailure(spy).code).toBe('unknown');
  });

  it('logs nothing when every user is deleted', async (): Promise<void> => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runRetention({
      client: fakeClient(),
      removeObjects: async (): Promise<number> => 3,
    });

    expect(result).toMatchObject({
      usersDeleted: 1,
      usersFailed: 0,
      usersSkipped: 0,
      objectsRemoved: 3,
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('runRetention claiming a user before acting on them', () => {
  it('claims before it removes anything', async (): Promise<void> => {
    const calls: string[] = [];
    await runRetention({
      client: fakeClient({ onRpc: (name: string): void => void calls.push(name) }),
      removeObjects: async (): Promise<number> => {
        calls.push('remove_objects');
        return 0;
      },
    });

    expect(calls).toEqual(['list_retention_candidates', 'claim_retention_user', 'remove_objects']);
  });

  it('skips a user whose claim is refused, without touching files or rows', async (): Promise<void> => {
    const removeObjects = vi.fn(async (): Promise<number> => 0);
    const onDeleteUser = vi.fn();
    const result = await runRetention({
      client: fakeClient({ claim: false, onDeleteUser }),
      removeObjects,
    });

    expect(result).toMatchObject({ usersSkipped: 1, usersDeleted: 0, objectsRemoved: 0 });
    expect(removeObjects).not.toHaveBeenCalled();
    expect(onDeleteUser).not.toHaveBeenCalled();
  });

  it('judges the claim and the candidate list against one cutoff', async (): Promise<void> => {
    const args = new Map<string, Record<string, unknown>>();
    await runRetention({
      client: fakeClient({
        onRpc: (name: string, call: Record<string, unknown>): void => void args.set(name, call),
      }),
      now: new Date('2026-09-29T12:00:00.000Z'),
      removeObjects: noObjects,
    });

    const listed = args.get('list_retention_candidates');
    const claimed = args.get('claim_retention_user');
    expect(claimed?.p_inactive_before).toBe(listed?.p_inactive_before);
    expect(claimed?.p_inactive_before).toBe('2026-08-30T12:00:00.000Z');
    expect(claimed?.p_user_id).toBe(STALE_USER);
    expect(claimed?.p_retry_after).toBe(RETENTION_RETRY_AFTER);
  });
});
