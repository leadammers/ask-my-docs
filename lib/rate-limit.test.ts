import { describe, expect, it } from 'vitest';
import type { AiUsageKind } from '@/lib/config';
import { DailyCapReachedError, RateLimitError } from '@/lib/errors';
import {
  assertAiAllowed,
  assertGlobalDailyCap,
  assertWithinLimit,
  startOfUtcDay,
  windowStart,
  type UsageStore,
} from '@/lib/rate-limit';

type Event = { userId: string; kind: AiUsageKind; at: Date };

function fakeStore(initial: Event[] = []): UsageStore & { events: Event[] } {
  const events = [...initial];
  return {
    events,
    async countForUser(userId, kind, since) {
      return events.filter(
        (event: Event) => event.userId === userId && event.kind === kind && event.at >= since,
      ).length;
    },
    async countAll(kinds, since) {
      return events.filter((event: Event) => kinds.includes(event.kind) && event.at >= since)
        .length;
    },
    async record(userId, kind) {
      events.push({ userId, kind, at: new Date() });
    },
  };
}

describe('windowStart', () => {
  it('subtracts the window in seconds from now', () => {
    const now = new Date('2026-01-01T00:00:30.000Z');
    expect(windowStart(now, 20)).toEqual(new Date('2026-01-01T00:00:10.000Z'));
  });

  it('returns now when the window is zero', () => {
    const now = new Date('2026-01-01T00:00:30.000Z');
    expect(windowStart(now, 0)).toEqual(now);
  });
});

describe('startOfUtcDay', () => {
  it('returns UTC midnight for a UTC-midnight input', () => {
    const now = new Date('2026-03-05T00:00:00.000Z');
    expect(startOfUtcDay(now)).toEqual(new Date('2026-03-05T00:00:00.000Z'));
  });

  it('truncates a non-midnight time to UTC midnight of the same day', () => {
    const now = new Date('2026-03-05T23:59:59.999Z');
    expect(startOfUtcDay(now)).toEqual(new Date('2026-03-05T00:00:00.000Z'));
  });

  it('is unaffected by the local timezone offset (uses UTC fields)', () => {
    // 2026-03-05T01:30 UTC is still 2026-03-04 in some timezones, but
    // startOfUtcDay must use UTC fields, not local ones.
    const now = new Date('2026-03-05T01:30:00.000Z');
    expect(startOfUtcDay(now)).toEqual(new Date('2026-03-05T00:00:00.000Z'));
  });
});

describe('assertWithinLimit', () => {
  it('allows a use below the limit and records exactly one event', async () => {
    const store = fakeStore();
    const now = new Date('2026-01-01T00:00:00.000Z');

    await assertWithinLimit('user-1', 'chat', 3, 60, { store, now });

    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({ userId: 'user-1', kind: 'chat' });
  });

  it('throws RateLimitError at the limit and does not record', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const store = fakeStore([
      { userId: 'user-1', kind: 'chat', at: now },
      { userId: 'user-1', kind: 'chat', at: now },
    ]);

    await expect(assertWithinLimit('user-1', 'chat', 2, 60, { store, now })).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(store.events).toHaveLength(2);
  });

  it('only counts events of the same user and kind inside the window', async () => {
    const now = new Date('2026-01-01T00:01:00.000Z');
    const store = fakeStore([
      // Different user: does not count.
      { userId: 'other-user', kind: 'chat', at: now },
      // Same user, different kind: does not count.
      { userId: 'user-1', kind: 'ingest', at: now },
      // Same user and kind, but outside the window: does not count.
      { userId: 'user-1', kind: 'chat', at: new Date('2026-01-01T00:00:00.000Z') },
    ]);

    // Window is 30s, so only events at or after 00:00:30 count; none do.
    await assertWithinLimit('user-1', 'chat', 1, 30, { store, now });

    expect(store.events).toHaveLength(4);
    expect(store.events.at(-1)).toMatchObject({ userId: 'user-1', kind: 'chat' });
  });
});

describe('assertGlobalDailyCap', () => {
  it('passes when usage is below the cap', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const store = fakeStore([{ userId: 'user-1', kind: 'chat', at: now }]);

    await expect(assertGlobalDailyCap({ store, now }, 2)).resolves.toBeUndefined();
  });

  it('throws DailyCapReachedError once the cap is reached', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const store = fakeStore([
      { userId: 'user-1', kind: 'chat', at: now },
      { userId: 'user-2', kind: 'ingest', at: now },
    ]);

    await expect(assertGlobalDailyCap({ store, now }, 2)).rejects.toBeInstanceOf(
      DailyCapReachedError,
    );
  });

  it('only counts usage since UTC midnight of `now`', async () => {
    const now = new Date('2026-01-02T01:00:00.000Z');
    const store = fakeStore([
      // Yesterday (before today's UTC midnight): does not count.
      { userId: 'user-1', kind: 'chat', at: new Date('2026-01-01T23:59:59.000Z') },
      // Today: counts.
      { userId: 'user-1', kind: 'chat', at: new Date('2026-01-02T00:30:00.000Z') },
    ]);

    await expect(assertGlobalDailyCap({ store, now }, 1)).rejects.toBeInstanceOf(
      DailyCapReachedError,
    );
    await expect(assertGlobalDailyCap({ store, now }, 2)).resolves.toBeUndefined();
  });
});

describe('assertAiAllowed', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');

  it('records the use when both checks pass', async () => {
    const store = fakeStore();

    await expect(
      assertAiAllowed('user-1', 'chat', 1, 60, { store, now, cap: 10 }),
    ).resolves.toBeUndefined();
    expect(store.events).toHaveLength(1);
  });

  it('throws DailyCapReachedError without recording once the cap is reached', async () => {
    const store = fakeStore([{ userId: 'user-2', kind: 'ingest', at: now }]);

    await expect(
      assertAiAllowed('user-1', 'chat', 5, 60, { store, now, cap: 1 }),
    ).rejects.toBeInstanceOf(DailyCapReachedError);
    expect(store.events).toHaveLength(1);
  });

  it('throws RateLimitError when the per-user limit is reached', async () => {
    const store = fakeStore([{ userId: 'user-1', kind: 'chat', at: now }]);

    await expect(
      assertAiAllowed('user-1', 'chat', 1, 60, { store, now, cap: 10 }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });
});
