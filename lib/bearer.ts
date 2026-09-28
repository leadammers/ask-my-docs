import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Checks an `Authorization: Bearer <secret>` header in constant time. Both
 * sides are hashed first so a length mismatch can't leak through an early
 * return. A missing secret never authorizes.
 */
export function isValidBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const given = createHash('sha256').update(header.slice('Bearer '.length)).digest();
  const expected = createHash('sha256').update(secret).digest();
  return timingSafeEqual(given, expected);
}
