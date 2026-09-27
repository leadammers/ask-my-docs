import 'server-only';
import { AI_USAGE_KINDS, type AiUsageKind } from '@/lib/config';
import { env } from '@/lib/env';
import { DailyCapReachedError, RateLimitError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';

// Usage is counted in `usage_events`. Users may only read their own rows (RLS),
// and the global cap must count everyone's, so both reads and the insert run
// with the service-role client. Its inputs are the session's user id and a
// fixed kind — never request data — which keeps it within security.md §3.
// A SQL function callable by `authenticated` was rejected: anyone could call
// it directly and burn the global cap without ever reaching the model.
//
// Count-then-insert is not atomic: parallel requests can overshoot a limit by
// a few calls. Accepted for the demo — the limits bound cost, they aren't a
// security boundary, and the global cap still caps the total.

export type UsageStore = {
  countForUser(userId: string, kind: AiUsageKind, since: Date): Promise<number>;
  countAll(kinds: readonly AiUsageKind[], since: Date): Promise<number>;
  record(userId: string, kind: AiUsageKind): Promise<void>;
};

export function windowStart(now: Date, windowSeconds: number): Date {
  return new Date(now.getTime() - windowSeconds * 1000);
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function createUsageStore(client = createAdminClient()): UsageStore {
  return {
    async countForUser(userId, kind, since) {
      const { count, error } = await client
        .from('usage_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('kind', kind)
        .gte('created_at', since.toISOString());
      if (error) throw new Error('Failed to count usage events', { cause: error });
      return count ?? 0;
    },
    async countAll(kinds, since) {
      const { count, error } = await client
        .from('usage_events')
        .select('id', { count: 'exact', head: true })
        .in('kind', [...kinds])
        .gte('created_at', since.toISOString());
      if (error) throw new Error('Failed to count usage events', { cause: error });
      return count ?? 0;
    },
    async record(userId, kind) {
      const { error } = await client.from('usage_events').insert({ user_id: userId, kind });
      if (error) throw new Error('Failed to record usage event', { cause: error });
    },
  };
}

type Deps = { store?: UsageStore; now?: Date };

/**
 * Throws RateLimitError if the user already used `kind` `limit` times within
 * the window; otherwise records this use. Call before the model call.
 */
export async function assertWithinLimit(
  userId: string,
  kind: AiUsageKind,
  limit: number,
  windowSeconds: number,
  { store = createUsageStore(), now = new Date() }: Deps = {},
): Promise<void> {
  const used = await store.countForUser(userId, kind, windowStart(now, windowSeconds));
  if (used >= limit) throw new RateLimitError();
  await store.record(userId, kind);
}

/**
 * Throws DailyCapReachedError once all users together made AI_GLOBAL_DAILY_CAP
 * AI calls since midnight UTC. Call before assertWithinLimit, so a refused
 * call isn't recorded.
 */
export async function assertGlobalDailyCap(
  { store = createUsageStore(), now = new Date() }: Deps = {},
  cap: number = env.AI_GLOBAL_DAILY_CAP,
): Promise<void> {
  const used = await store.countAll(AI_USAGE_KINDS, startOfUtcDay(now));
  if (used >= cap) throw new DailyCapReachedError();
}

/**
 * The check every AI-calling route runs before the model call: the global
 * daily cap first (so a refused call isn't recorded), then the per-user limit,
 * which records this use.
 */
export async function assertAiAllowed(
  userId: string,
  kind: AiUsageKind,
  limit: number,
  windowSeconds: number,
  { store = createUsageStore(), now = new Date(), cap }: Deps & { cap?: number } = {},
): Promise<void> {
  await assertGlobalDailyCap({ store, now }, cap);
  await assertWithinLimit(userId, kind, limit, windowSeconds, { store, now });
}
