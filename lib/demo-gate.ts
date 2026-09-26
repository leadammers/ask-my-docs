export const DEMO_COOKIE_NAME = "demo_session";
export const DEMO_SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Fixed-length digests before comparing, so an early length mismatch never
// leaks how many characters of the secret/password were guessed correctly.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index++) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function createDemoToken(secret: string, now: number = Date.now()): Promise<string> {
  const expiresAt = now + DEMO_SESSION_DURATION_MS;
  const signature = await hmacHex(secret, String(expiresAt));
  return `${expiresAt}.${signature}`;
}

export async function verifyDemoToken(
  secret: string,
  token: string | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token) return false;

  const [expiresAtRaw, signature] = token.split(".");
  if (!expiresAtRaw || !signature) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;

  const expected = await hmacHex(secret, expiresAtRaw);
  return timingSafeEqualHex(expected, signature);
}

export async function verifyDemoPassword(secret: string, candidate: string, expected: string): Promise<boolean> {
  const [candidateHash, expectedHash] = await Promise.all([
    hmacHex(secret, candidate),
    hmacHex(secret, expected),
  ]);
  return timingSafeEqualHex(candidateHash, expectedHash);
}
