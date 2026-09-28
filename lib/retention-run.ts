import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RETENTION_BATCH_SIZE, RETENTION_DAYS } from '@/lib/config';
import { retentionCutoff, selectUsersToDelete, type RetentionCandidate } from '@/lib/retention';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/types';

// The retention cleanup (T08b). Runs with the service-role client: the user
// ids come from the database query, never from the request (security.md §3).

type AdminClient = SupabaseClient<Database>;

const BUCKETS = ['sources', 'audio'] as const;
const LIST_PAGE_SIZE = 1000;

export type RetentionResult = {
  usersDeleted: number;
  usersFailed: number;
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

async function loadCandidates(client: AdminClient, now: Date): Promise<RetentionCandidate[]> {
  const { data, error } = await client.rpc('list_retention_candidates', {
    p_inactive_before: retentionCutoff(now, RETENTION_DAYS).toISOString(),
    p_limit: RETENTION_BATCH_SIZE,
  });
  if (error) throw new Error('Failed to list retention candidates', { cause: error });
  return data.map((row) => ({
    userId: row.user_id,
    isAnonymous: row.is_anonymous,
    lastActiveAt: new Date(row.last_active_at),
  }));
}

async function loadDemoOwnerId(client: AdminClient): Promise<string | null> {
  const { data, error } = await client.from('app_settings').select('demo_owner_id').maybeSingle();
  if (error) throw new Error('Failed to read app settings', { cause: error });
  return data?.demo_owner_id ?? null;
}

type Deps = {
  client?: AdminClient;
  now?: Date;
  removeObjects?: (client: AdminClient, userId: string) => Promise<number>;
};

/**
 * Deletes anonymous users inactive for more than RETENTION_DAYS: their storage
 * objects first, then the auth user (the FK cascade removes their rows). If a
 * user's objects can't be removed, the user is skipped and counted as failed —
 * they stay eligible and the next run retries, so rows never outlive files.
 */
export async function runRetention({
  client = createAdminClient(),
  now = new Date(),
  removeObjects = removeUserObjects,
}: Deps = {}): Promise<RetentionResult> {
  const startedAt = Date.now();
  const [candidates, demoOwnerId] = await Promise.all([
    loadCandidates(client, now),
    loadDemoOwnerId(client),
  ]);
  const userIds = selectUsersToDelete(candidates, {
    now,
    retentionDays: RETENTION_DAYS,
    demoOwnerId,
  });

  const result = { usersDeleted: 0, usersFailed: 0, objectsRemoved: 0 };
  for (const userId of userIds) {
    try {
      result.objectsRemoved += await removeObjects(client, userId);
      const { error } = await client.auth.admin.deleteUser(userId);
      if (error) throw new Error('Failed to delete user', { cause: error });
      result.usersDeleted += 1;
    } catch {
      result.usersFailed += 1;
    }
  }

  return { ...result, durationMs: Date.now() - startedAt };
}
