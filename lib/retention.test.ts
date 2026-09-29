import { describe, expect, it } from 'vitest';
import { retentionCutoff, selectUsersToDelete, type RetentionCandidate } from '@/lib/retention';

const now = new Date('2026-10-31T12:00:00.000Z');
const daysAgo = (days: number): Date => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

function candidate(userId: string, lastActiveAt: Date, isAnonymous = true): RetentionCandidate {
  return { userId, isAnonymous, lastActiveAt };
}

describe('retentionCutoff', () => {
  it('is exactly retentionDays before now', (): void => {
    expect(retentionCutoff(now, 30)).toEqual(new Date('2026-10-01T12:00:00.000Z'));
  });
});

describe('selectUsersToDelete', () => {
  const options = { now, retentionDays: 30, demoOwnerId: 'demo-owner' };

  it('selects anonymous users inactive for longer than the retention period', (): void => {
    const candidates = [candidate('stale', daysAgo(31)), candidate('active', daysAgo(2))];
    expect(selectUsersToDelete(candidates, options)).toEqual(['stale']);
  });

  it('keeps a user whose last activity is exactly at the cutoff', (): void => {
    expect(selectUsersToDelete([candidate('boundary', daysAgo(30))], options)).toEqual([]);
  });

  it('never selects the demo owner', (): void => {
    expect(selectUsersToDelete([candidate('demo-owner', daysAgo(365))], options)).toEqual([]);
  });

  it('never selects non-anonymous users', (): void => {
    expect(selectUsersToDelete([candidate('real', daysAgo(365), false)], options)).toEqual([]);
  });

  it('handles no candidates and a missing demo owner', (): void => {
    expect(selectUsersToDelete([], { ...options, demoOwnerId: null })).toEqual([]);
  });
});
