import { describe, expect, it } from 'vitest';
import {
  apiErrorMessage,
  AppError,
  DailyCapReachedError,
  QuotaExceededError,
  RateLimitError,
  toErrorResponse,
  userMessage,
} from '@/lib/errors';

describe('toErrorResponse', () => {
  it('maps RateLimitError to 429 rate_limited', (): void => {
    expect(toErrorResponse(new RateLimitError())).toEqual({
      status: 429,
      code: 'rate_limited',
      userMessage: userMessage('rate_limited'),
    });
  });

  it('maps DailyCapReachedError to 429 daily_cap_reached with the fixed message', (): void => {
    expect(toErrorResponse(new DailyCapReachedError())).toEqual({
      status: 429,
      code: 'daily_cap_reached',
      userMessage: 'The daily demo limit is reached — please try again tomorrow.',
    });
  });

  it('maps QuotaExceededError to 503', (): void => {
    expect(toErrorResponse(new QuotaExceededError())).toEqual({
      status: 503,
      code: 'quota_exceeded',
      userMessage: userMessage('quota_exceeded'),
    });
  });

  it('maps an unknown AppError-unrelated Error to 500 unexpected with a generic message', (): void => {
    const response = toErrorResponse(new Error('database connection to 10.0.0.5 failed'));

    expect(response.status).toBe(500);
    expect(response.code).toBe('unexpected');
    expect(response.userMessage).toBe('Something went wrong. Please try again.');
    expect(response.userMessage).not.toContain('10.0.0.5');
  });

  it('maps a thrown string to 500 unexpected without leaking it', (): void => {
    const response = toErrorResponse('raw provider error: sk-secret-key-123');

    expect(response.status).toBe(500);
    expect(response.code).toBe('unexpected');
    expect(response.userMessage).toBe('Something went wrong. Please try again.');
    expect(response.userMessage).not.toContain('sk-secret-key-123');
  });

  it('preserves the cause on an AppError without leaking it to the response', (): void => {
    const cause = new Error('upstream 503 from provider');
    const error = new QuotaExceededError({ cause });

    expect(error.cause).toBe(cause);
    const response = toErrorResponse(error);
    expect(JSON.stringify(response)).not.toContain('upstream 503');
  });

  it('does not treat a bare AppError subclass instance check by name alone', (): void => {
    // Guards against a future refactor keying off error.name instead of `instanceof AppError`.
    const fakeError = { name: 'RateLimitError', code: 'rate_limited' };
    expect(toErrorResponse(fakeError)).toEqual({
      status: 500,
      code: 'unexpected',
      userMessage: userMessage('unexpected'),
    });
  });
});

describe('AppError', () => {
  it('exposes the error code and readable name', (): void => {
    const error = new AppError('invalid_input');
    expect(error.code).toBe('invalid_input');
    expect(error.name).toBe('AppError');
  });
});

describe('apiErrorMessage', () => {
  // The AI SDK's transport surfaces a non-OK response body as the error's
  // `message` verbatim, so this is the shape the chat client actually receives.
  const transportError = (body: string): Error =>
    new Error(body, { cause: new Error('non-OK response') });

  it("recovers the route's user-facing message from the raw error body", (): void => {
    const body = JSON.stringify({
      error: { code: 'rate_limited', message: userMessage('rate_limited') },
    });
    expect(apiErrorMessage(transportError(body))).toBe(userMessage('rate_limited'));
  });

  it('returns null for a transport message that is not our error shape', (): void => {
    expect(apiErrorMessage(transportError('Failed to fetch the chat response.'))).toBeNull();
  });

  it('returns null for malformed JSON rather than throwing', (): void => {
    expect(apiErrorMessage(transportError('{"error":'))).toBeNull();
  });

  it('returns null when the body carries no message', (): void => {
    expect(
      apiErrorMessage(transportError(JSON.stringify({ error: { code: 'unexpected' } }))),
    ).toBeNull();
  });

  it('returns null for a non-Error value', (): void => {
    expect(apiErrorMessage('rate_limited')).toBeNull();
    expect(apiErrorMessage(undefined)).toBeNull();
  });
});
