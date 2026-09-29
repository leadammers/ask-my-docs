import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RETENTION_BATCH_SIZE, RETENTION_DAYS, RETENTION_RETRY_AFTER } from '@/lib/config';
import { retentionCutoff, selectUsersToDelete, type RetentionCandidate } from '@/lib/retention';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/types';

// The retention cleanup (T08b). Runs with the service-role client: the user
// ids come from the database query, never from the request (security.md §3).

type AdminClient = SupabaseClient<Database>;

const BUCKETS = ['sources', 'audio'] as const;
const LIST_PAGE_SIZE = 1000;

/** The steps that can fail for one user, named for the log line. */
type RetentionOperation = 'claim' | 'remove_objects' | 'delete_user';

/** A code short and plain enough to be a log field rather than free text. */
const PLAIN_CODE = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * Why a user could not be deleted, as a bounded code: the upstream's own code
 * (on the error, or on the one it wraps) when it is a plain token. Never the
 * error message — provider text is unbounded and not ours (security.md §12).
 */
function failureCode(error: unknown): string {
  for (const candidate of [error, error instanceof Error ? error.cause : undefined] as unknown[]) {
    const code = (candidate as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && PLAIN_CODE.test(code)) return code;
  }
  return 'unknown';
}

export type RetentionResult = {
  usersDeleted: number;
  /** Claimed, but a later step failed; the next run retries them. */
  usersFailed: number;
  /** No longer eligible, or claimed by an overlapping run. Left untouched. */
  usersSkipped: number;
  objectsRemoved: number;
  durationMs: number;
};

async function listObjectPaths(
  client: AdminClient,
  bucket: string,
  folder: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(folder, { limit: LIST_PAGE_SIZE, offset });
    if (error) throw new Error('Failed to list storage objects', { cause: error });
    for (const entry of data) {
      const path = `${folder}/${entry.name}`;
      // Entries without an id are folders; storage paths are flat today, but
      // recursing keeps the cleanup complete if that ever changes.
      if (entry.id === null) paths.push(...(await listObjectPaths(client, bucket, path)));
      else paths.push(path);
    }
    if (data.length < LIST_PAGE_SIZE) return paths;
  }
}

/** Removes every object under `{userId}/` in both buckets; returns how many. */
export async function removeUserObjects(client: AdminClient, userId: string): Promise<number> {
  let removed = 0;
  for (const bucket of BUCKETS) {
    const paths = await listObjectPaths(client, bucket, userId);
    if (paths.length === 0) continue;
    const { error } = await client.storage.from(bucket).remove(paths);
    if (error) throw new Error('Failed to remove storage objects', { cause: error });
    removed += paths.length;
  }
  return removed;
}

async function loadCandidates(
  client: AdminClient,
  inactiveBefore: string,
): Promise<RetentionCandidate[]> {
  const { data, error } = await client.rpc('list_retention_candidates', {
    p_inactive_before: inactiveBefore,
    p_limit: RETENTION_BATCH_SIZE,
  });
  if (error) throw new Error('Failed to list retention candidates', { cause: error });
  return data.map((row) => ({
    userId: row.user_id,
    isAnonymous: row.is_anonymous,
    lastActiveAt: new Date(row.last_active_at),
  }));
}

/**
 * Takes exclusive ownership of one user's deletion, or refuses. The database
 * settles both questions in one statement (migration 20260929091941): still
 * stale and anonymous, and not already claimed by an overlapping run.
 */
export async function claimRetentionUser(
  client: AdminClient,
  userId: string,
  inactiveBefore: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('claim_retention_user', {
    p_user_id: userId,
    p_inactive_before: inactiveBefore,
    p_retry_after: RETENTION_RETRY_AFTER,
  });
  if (error) throw new Error('Failed to claim retention user', { cause: error });
  return data;
}

async function loadDemoOwnerId(client: AdminClient): Promise<string | null> {
  const { data, error } = await client.from('app_settings').select('demo_owner_id').maybeSingle();
  if (error) throw new Error('Failed to read app settings', { cause: error });
  return data?.demo_owner_id ?? null;
}

type Deps = {
  client?: AdminClient;
  now?: Date;
  claimUser?: (client: AdminClient, userId: string, inactiveBefore: string) => Promise<boolean>;
  removeObjects?: (client: AdminClient, userId: string) => Promise<number>;
};

/**
 * Deletes anonymous users inactive for more than RETENTION_DAYS: their storage
 * objects first, then the auth user (the FK cascade removes their rows). Each
 * user is claimed before anything is touched, so a visit that arrived since the
 * candidate query saves them. If a user's objects can't be removed, the user is
 * counted as failed and stays eligible — the next run retries, so rows never
 * outlive files.
 */
export async function runRetention({
  client = createAdminClient(),
  now = new Date(),
  claimUser = claimRetentionUser,
  removeObjects = removeUserObjects,
}: Deps = {}): Promise<RetentionResult> {
  const startedAt = Date.now();
  // One cutoff for the whole run: the candidate query and every claim judge
  // against the same instant, so "listed but refused" means the user moved, not
  // that the clock ticked over mid-run.
  const inactiveBefore = retentionCutoff(now, RETENTION_DAYS).toISOString();
  const [candidates, demoOwnerId] = await Promise.all([
    loadCandidates(client, inactiveBefore),
    loadDemoOwnerId(client),
  ]);
  const userIds = selectUsersToDelete(candidates, {
    now,
    retentionDays: RETENTION_DAYS,
    demoOwnerId,
  });

  const result = { usersDeleted: 0, usersFailed: 0, usersSkipped: 0, objectsRemoved: 0 };
  for (const userId of userIds) {
    // Tracked so the log line says which half of the pair has to be redone:
    // leftovers from a failed `remove_objects` are what the next run finds.
    let operation: RetentionOperation = 'claim';
    try {
      // A refused claim is not a failure: the user visited since the query, or
      // another run owns them. Either way, nothing of theirs is touched.
      if (!(await claimUser(client, userId, inactiveBefore))) {
        result.usersSkipped += 1;
        continue;
      }
      operation = 'remove_objects';
      result.objectsRemoved += await removeObjects(client, userId);
      operation = 'delete_user';
      const { error } = await client.auth.admin.deleteUser(userId);
      if (error) throw new Error('Failed to delete user', { cause: error });
      result.usersDeleted += 1;
    } catch (error: unknown) {
      result.usersFailed += 1;
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'retention_user_failed',
          userId,
          operation,
          code: failureCode(error),
        }),
      );
    }
  }

  return { ...result, durationMs: Date.now() - startedAt };
}
