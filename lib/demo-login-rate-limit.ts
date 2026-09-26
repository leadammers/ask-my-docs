const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;

const attemptsByKey = new Map<string, number[]>();

// In-memory, per-instance only — same stopgap caveat as any single-instance
// limiter until T04's shared limiter exists (see conventions/security.md §7).
export function isRateLimited(key: string, now: number = Date.now()): boolean {
  const attempts = (attemptsByKey.get(key) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  attemptsByKey.set(key, attempts);
  return attempts.length >= MAX_ATTEMPTS;
}

export function recordAttempt(key: string, now: number = Date.now()): void {
  const attempts = attemptsByKey.get(key) ?? [];
  attempts.push(now);
  attemptsByKey.set(key, attempts);
}
