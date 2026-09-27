import { describe, expect, it } from 'vitest';
import { DailyCapReachedError, RateLimitError } from '@/lib/errors';
import {
  assertAiAllowed,
  type UsageDecision,
  type UsageRequest,
  type UsageStore,
} from '@/lib/rate-limit';

// The limit logic itself lives in SQL and is covered by
// supabase/tests/record_ai_usage.test.sql; these tests cover the mapping.

function fakeStore(decision: UsageDecision): UsageStore & { requests: UsageRequest[] } {
  const requests: UsageRequest[] = [];
  return {
    requests,
    async recordIfAllowed(request: UsageRequest): Promise<UsageDecision> {
      requests.push(request);
      return decision;
    },
  };
}

describe('assertAiAllowed', () => {
  it('resolves when the store allows the call', async (): Promise<void> => {
    const store = fakeStore('ok');

    await expect(
      assertAiAllowed('user-1', 'chat', 10, 60, { store, cap: 500 }),
    ).resolves.toBeUndefined();
  });

  it('passes the user, kind, limit, window and cap to the store in one request', async (): Promise<void> => {
    const store = fakeStore('ok');

    await assertAiAllowed('user-1', 'ingest', 20, 3600, { store, cap: 500 });

    expect(store.requests).toEqual([
      { userId: 'user-1', kind: 'ingest', limit: 20, windowSeconds: 3600, dailyCap: 500 },
    ]);
  });

  it('throws RateLimitError when the per-user limit is reached', async (): Promise<void> => {
    const store = fakeStore('rate_limited');

    await expect(
      assertAiAllowed('user-1', 'chat', 10, 60, { store, cap: 500 }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('throws DailyCapReachedError when the global cap is reached', async (): Promise<void> => {
    const store = fakeStore('daily_cap_reached');

    await expect(
      assertAiAllowed('user-1', 'chat', 10, 60, { store, cap: 500 }),
    ).rejects.toBeInstanceOf(DailyCapReachedError);
  });
});
