import 'server-only';
import { z } from 'zod';
import { type AiUsageKind } from '@/lib/config';
import { env } from '@/lib/env';
import { DailyCapReachedError, RateLimitError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';

// The global daily cap, the per-user limit and recording the use happen in one
// SQL function under a lock (record_ai_usage_if_allowed, see its migration), so
// parallel requests can't pass on the same remaining capacity. It runs with the
// service-role client: users may only read their own usage_events rows and must
// not be able to record usage themselves. Its inputs are the session's user id
// and a fixed kind — never request data — which keeps it within security.md §3.

const UsageDecision = z.enum(['ok', 'rate_limited', 'daily_cap_reached']);
export type UsageDecision = z.infer<typeof UsageDecision>;

export type UsageRequest = {
  userId: string;
  kind: AiUsageKind;
  limit: number;
  windowSeconds: number;
  dailyCap: number;
};

export type UsageStore = {
  recordIfAllowed(request: UsageRequest): Promise<UsageDecision>;
};

export function createUsageStore(client = createAdminClient()): UsageStore {
  return {
    async recordIfAllowed(request: UsageRequest): Promise<UsageDecision> {
      const { data, error } = await client.rpc('record_ai_usage_if_allowed', {
        p_user_id: request.userId,
        p_kind: request.kind,
        p_limit: request.limit,
        p_window_seconds: request.windowSeconds,
        p_daily_cap: request.dailyCap,
      });
      if (error) throw new Error('Failed to record AI usage', { cause: error });
      return UsageDecision.parse(data);
    },
  };
}

/**
 * The check every AI-calling route runs before the model call. Records this
 * use if allowed; throws DailyCapReachedError or RateLimitError otherwise
 * (a refused call is never recorded).
 */
export async function assertAiAllowed(
  userId: string,
  kind: AiUsageKind,
  limit: number,
  windowSeconds: number,
  {
    store = createUsageStore(),
    cap = env.AI_GLOBAL_DAILY_CAP,
  }: { store?: UsageStore; cap?: number } = {},
): Promise<void> {
  const decision = await store.recordIfAllowed({
    userId,
    kind,
    limit,
    windowSeconds,
    dailyCap: cap,
  });
  if (decision === 'daily_cap_reached') throw new DailyCapReachedError();
  if (decision === 'rate_limited') throw new RateLimitError();
}
