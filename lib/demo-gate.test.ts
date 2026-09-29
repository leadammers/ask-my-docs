import { describe, expect, it } from 'vitest';
import { createDemoToken, verifyDemoPassword, verifyDemoToken } from '@/lib/demo-gate';

const SECRET = 'a'.repeat(32);

describe('createDemoToken / verifyDemoToken', () => {
  it('accepts a freshly created token', async () => {
    const now = Date.now();
    const token = await createDemoToken(SECRET, now);
    expect(await verifyDemoToken(SECRET, token, now)).toBe(true);
  });

  it('rejects an expired token', async () => {
    const now = Date.now();
    const token = await createDemoToken(SECRET, now);
    const wayLater = now + 9 * 60 * 60 * 1000;
    expect(await verifyDemoToken(SECRET, token, wayLater)).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const now = Date.now();
    const token = await createDemoToken(SECRET, now);
    const [expiresAt, signature] = token.split('.');
    if (!signature) throw new Error('expected a signature');
    const tampered = `${expiresAt}.${signature.slice(0, -1)}${signature.at(-1) === '0' ? '1' : '0'}`;
    expect(await verifyDemoToken(SECRET, tampered, now)).toBe(false);
  });

  it('rejects a token signed with a different secret', async () => {
    const now = Date.now();
    const token = await createDemoToken(SECRET, now);
    expect(await verifyDemoToken('b'.repeat(32), token, now)).toBe(false);
  });

  it('rejects malformed tokens', async () => {
    const now = Date.now();
    expect(await verifyDemoToken(SECRET, undefined, now)).toBe(false);
    expect(await verifyDemoToken(SECRET, 'not-a-token', now)).toBe(false);
    expect(await verifyDemoToken(SECRET, '', now)).toBe(false);
  });
});

describe('verifyDemoPassword', () => {
  it('accepts the correct password', async () => {
    expect(await verifyDemoPassword(SECRET, 'correct-horse', 'correct-horse')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    expect(await verifyDemoPassword(SECRET, 'wrong', 'correct-horse')).toBe(false);
  });

  it('rejects a password differing only in length', async () => {
    expect(await verifyDemoPassword(SECRET, 'correct-horse-extra', 'correct-horse')).toBe(false);
  });
});
