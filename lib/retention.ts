export type RetentionCandidate = {
  userId: string;
  isAnonymous: boolean;
  lastActiveAt: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Activity older than this is due for deletion. */
export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/**
 * Which users the retention cleanup deletes: anonymous users whose last
 * activity is older than `retentionDays`, never the demo owner. The SQL query
 * pre-filters the same way; this is the decision the cleanup acts on.
 */
export function selectUsersToDelete(
  candidates: readonly RetentionCandidate[],
  {
    now,
    retentionDays,
    demoOwnerId,
  }: { now: Date; retentionDays: number; demoOwnerId: string | null },
): string[] {
  const cutoff = retentionCutoff(now, retentionDays);
  return candidates
    .filter(
      (candidate: RetentionCandidate): boolean =>
        candidate.isAnonymous &&
        candidate.userId !== demoOwnerId &&
        candidate.lastActiveAt < cutoff,
    )
    .map((candidate: RetentionCandidate): string => candidate.userId);
}
