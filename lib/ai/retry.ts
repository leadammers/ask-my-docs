import { APICallError, RetryError } from 'ai';
import { AI_RETRY_ATTEMPTS, AI_RETRY_BASE_DELAY_MS } from '@/lib/config';
import { QuotaExceededError } from '@/lib/errors';

const RETRYABLE_STATUS = new Set([429, 503]);

export function isRetryableAiError(error: unknown): boolean {
  if (RetryError.isInstance(error)) return isRetryableAiError(error.lastError);
  return APICallError.isInstance(error) && RETRYABLE_STATUS.has(error.statusCode ?? 0);
}

/** Full jitter: a random delay up to base · 2^attempt, so parallel callers spread out. */
export function backoffDelayMs(attempt: number, random: () => number, baseMs: number): number {
  return Math.round(random() * baseMs * 2 ** attempt);
}

type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retries on quota/overload (HTTP 429/503) with exponential backoff and jitter.
 * After the last attempt it throws QuotaExceededError (user-facing message);
 * any other error is rethrown immediately. Call the AI SDK with `maxRetries: 0`
 * inside `fn` so retries don't multiply.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = AI_RETRY_ATTEMPTS,
    baseDelayMs = AI_RETRY_BASE_DELAY_MS,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableAiError(error)) throw error;
      if (attempt + 1 >= attempts) throw new QuotaExceededError({ cause: error });
      await sleep(backoffDelayMs(attempt, random, baseDelayMs));
    }
  }
}
