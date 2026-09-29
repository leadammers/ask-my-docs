// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isValidBearer } from '@/lib/bearer';

const secret = 'a-cron-secret-of-sufficient-length';

describe('isValidBearer', () => {
  it('accepts the exact bearer token', (): void => {
    expect(isValidBearer(`Bearer ${secret}`, secret)).toBe(true);
  });

  it('rejects a wrong token, a missing header and other schemes', (): void => {
    expect(isValidBearer(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isValidBearer(null, secret)).toBe(false);
    expect(isValidBearer(`Basic ${secret}`, secret)).toBe(false);
  });

  it('never authorizes when no secret is configured', (): void => {
    expect(isValidBearer('Bearer ', undefined)).toBe(false);
    expect(isValidBearer('Bearer ', '')).toBe(false);
  });
});
