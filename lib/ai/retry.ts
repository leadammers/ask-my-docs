import { APICallError, RetryError } from 'ai';
import { AI_RETRY_ATTEMPTS, AI_RETRY_BASE_DELAY_MS, AI_RETRY_QUOTA_DELAY_MS } from '@/lib/config';
import { QuotaExceededError } from '@/lib/errors';

/** An exhausted quota: a per-minute budget, not a hiccup. */
const QUOTA_STATUS = 429;
/** The model was overloaded; the same request usually goes through moments later. */
const OVERLOADED_STATUS = 503;

const RETRYABLE_STATUS = new Set([QUOTA_STATUS, OVERLOADED_STATUS]);

/** The HTTP status an AI error carries, unwrapping the SDK's RetryError wrapper. */
function apiErrorStatus(error: unknown): number {
  if (RetryError.isInstance(error)) return apiErrorStatus(error.lastError);
  return APICallError.isInstance(error) ? (error.statusCode ?? 0) : 0;
}

export function isRetryableAiError(error: unknown): boolean {
  return RETRYABLE_STATUS.has(apiErrorStatus(error));
}

/** Full jitter: a random delay up to base · 2^attempt, so parallel callers spread out. */
export function backoffDelayMs(attempt: number, random: () => number, baseMs: number): number {
  return Math.round(random() * baseMs * 2 ** attempt);
}

type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  /**
   * Wait before retrying a quota error. Defaults to the whole window, since the
   * short backoff cannot outlast a per-minute budget; a caller that would rather
   * fail fast than hold the request open passes 0.
   */
  quotaDelayMs?: number;
  /**
   * Absolute epoch ms (`Date.now()` scale) past which no quota wait may start. A
   * wait that would cross it is not taken: inside an invocation with a fixed
   * budget, being killed mid-wait loses the chance to store a handled failure,
   * whereas failing now leaves the work retryable. Undefined = no deadline.
   */
  deadlineMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Clock for `deadlineMs`, injected so tests never touch real time. */
  now?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retries on quota/overload (HTTP 429/503) with exponential backoff and jitter.
 * After the last attempt it throws QuotaExceededError (user-facing message);
 * any other error is rethrown immediately. Call the AI SDK with `maxRetries: 0`
 * inside `fn` so retries don't multiply.
 *
 * Only errors thrown while `fn`'s promise settles are retried. `streamText`
 * reports provider errors inside the stream, so wrapping it here retries nothing.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = AI_RETRY_ATTEMPTS,
    baseDelayMs = AI_RETRY_BASE_DELAY_MS,
    quotaDelayMs = AI_RETRY_QUOTA_DELAY_MS,
    deadlineMs,
    sleep = defaultSleep,
    random = Math.random,
    now = Date.now,
  } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableAiError(error)) throw error;
      if (attempt + 1 >= attempts) throw new QuotaExceededError({ cause: error });
      const isQuota = apiErrorStatus(error) === QUOTA_STATUS;
      // A quota wait is a whole window long, so it is the one that can run an
      // invocation out of time. Past the deadline it is skipped outright: the
      // caller gets the failure now and can still persist it, instead of the
      // runtime killing the run mid-sleep with nothing written.
      if (isQuota && deadlineMs !== undefined && now() + quotaDelayMs > deadlineMs) {
        throw new QuotaExceededError({ cause: error });
      }
      const delayMs = isQuota ? quotaDelayMs : backoffDelayMs(attempt, random, baseDelayMs);
      await sleep(delayMs);
    }
  }
}
