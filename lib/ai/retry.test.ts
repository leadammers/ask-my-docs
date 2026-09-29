import { APICallError, RetryError } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { backoffDelayMs, isRetryableAiError, withRetry } from '@/lib/ai/retry';
import { QuotaExceededError } from '@/lib/errors';

function apiError(statusCode: number): APICallError {
  return new APICallError({
    message: 'boom',
    url: 'https://x',
    requestBodyValues: {},
    statusCode,
  });
}

describe('isRetryableAiError', () => {
  it('is retryable for a 429 APICallError', () => {
    expect(isRetryableAiError(apiError(429))).toBe(true);
  });

  it('is retryable for a 503 APICallError', () => {
    expect(isRetryableAiError(apiError(503))).toBe(true);
  });

  it('is not retryable for a 400 APICallError', () => {
    expect(isRetryableAiError(apiError(400))).toBe(false);
  });

  it('is not retryable for a plain Error', () => {
    expect(isRetryableAiError(new Error('nope'))).toBe(false);
  });

  it('unwraps a RetryError to check its last error', () => {
    const retryError = new RetryError({
      message: 'retries exceeded',
      reason: 'maxRetriesExceeded',
      errors: [apiError(429)],
    });
    expect(isRetryableAiError(retryError)).toBe(true);
  });

  it('does not treat a RetryError wrapping a non-retryable error as retryable', () => {
    const retryError = new RetryError({
      message: 'retries exceeded',
      reason: 'maxRetriesExceeded',
      errors: [apiError(400)],
    });
    expect(isRetryableAiError(retryError)).toBe(false);
  });
});

describe('backoffDelayMs', () => {
  it('grows exponentially with the attempt number', () => {
    const random = () => 1;
    expect(backoffDelayMs(0, random, 500)).toBe(500);
    expect(backoffDelayMs(1, random, 500)).toBe(1000);
    expect(backoffDelayMs(2, random, 500)).toBe(2000);
  });

  it('scales with the random jitter factor', () => {
    expect(backoffDelayMs(0, () => 0.5, 500)).toBe(250);
  });
});

describe('withRetry', () => {
  it('returns the result on the first success without sleeping', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, { sleep, random: () => 1 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries on a retryable error and succeeds after transient failures', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(apiError(429))
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, { attempts: 5, sleep, random: () => 1, baseDelayMs: 10 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured attempts with QuotaExceededError', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const cause = apiError(429);
    const fn = vi.fn().mockRejectedValue(cause);

    await expect(
      withRetry(fn, { attempts: 3, sleep, random: () => 1, baseDelayMs: 10 }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
    expect(fn).toHaveBeenCalledTimes(3);
    // Only sleeps between attempts, not after the final failure.
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('rethrows a non-retryable error immediately without retrying', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const error = apiError(400);
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { sleep, random: () => 1 })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('rethrows a plain Error immediately without retrying', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const error = new Error('unexpected');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { sleep, random: () => 1 })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('never uses real timers (sleep is fully injected)', async () => {
    const delays: number[] = [];
    const sleep = vi.fn().mockImplementation(async (ms: number) => {
      delays.push(ms);
    });
    const fn = vi.fn().mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce('ok');

    await withRetry(fn, { attempts: 3, sleep, random: () => 1, baseDelayMs: 100 });

    expect(delays).toEqual([100]);
  });
});
