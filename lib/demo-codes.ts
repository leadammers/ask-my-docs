import { z } from 'zod';
import { DEMO_SESSION_DURATION_MS, hmacHex } from '@/lib/demo-gate';

// Per-person demo access codes (D-24). Pure: no env, no I/O — the pepper is a
// parameter, randomness is injectable.

const CODE_PREFIX = 'AMD';
// Crockford base32: no I, L, O or U, so a hand-typed code has no look-alike pairs.
const BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_RANDOM_BYTES = 16; // 128 bits
const DISPLAY_GROUP_SIZE = 4;

function base32Encode(bytes: Uint8Array): string {
  let bitCount = 0;
  let buffer = 0;
  let encoded = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      encoded += BASE32_ALPHABET[(buffer >>> (bitCount - 5)) & 31];
      bitCount -= 5;
      buffer &= (1 << bitCount) - 1;
    }
  }
  if (bitCount > 0) {
    encoded += BASE32_ALPHABET[(buffer << (5 - bitCount)) & 31];
  }
  return encoded;
}

/**
 * Strips everything but letters and digits, uppercases and folds the look-alikes the
 * alphabet leaves out (O to 0, I and L to 1), so typing style and misreading never matter.
 */
export function normalizeDemoCode(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** `AMD-XXXX-XXXX-…` from a normalised code. */
export function formatDemoCode(normalized: string): string {
  const body = normalized.slice(CODE_PREFIX.length);
  const groups: string[] = [];
  for (let start = 0; start < body.length; start += DISPLAY_GROUP_SIZE) {
    groups.push(body.slice(start, start + DISPLAY_GROUP_SIZE));
  }
  return [CODE_PREFIX, ...groups].join('-');
}

export function generateDemoCode(
  randomBytes: Uint8Array = crypto.getRandomValues(new Uint8Array(CODE_RANDOM_BYTES)),
): string {
  return formatDemoCode(`${CODE_PREFIX}${base32Encode(randomBytes)}`);
}

export async function hashDemoCode(pepper: string, rawCode: string): Promise<string> {
  return hmacHex(pepper, normalizeDemoCode(rawCode));
}

export const demoCodeInputSchema = z.string().trim().min(8).max(64);

export type DemoCodeRow = {
  id: string;
  label: string;
  expires_at: string;
  revoked_at: string | null;
  max_sessions: number;
};

export type DemoEntitlementRow = { code_id: string; expires_at: string };

export type DemoCodeStatus = 'active' | 'revoked' | 'expired';

export type DemoCodeSummary = {
  id: string;
  label: string;
  status: DemoCodeStatus;
  expiresAt: string;
  seatsInUse: number;
  maxSessions: number;
  lastUsedAt: string | null;
};

export function summarizeDemoCodes(
  codes: DemoCodeRow[],
  entitlements: DemoEntitlementRow[],
  now: Date,
): DemoCodeSummary[] {
  return codes.map((code: DemoCodeRow): DemoCodeSummary => {
    const own = entitlements.filter(
      (entitlement: DemoEntitlementRow): boolean => entitlement.code_id === code.id,
    );
    const seatsInUse = own.filter(
      (entitlement: DemoEntitlementRow): boolean => new Date(entitlement.expires_at) > now,
    ).length;

    let latestExpiry: number | null = null;
    for (const entitlement of own) {
      const expiry = new Date(entitlement.expires_at).getTime();
      if (latestExpiry === null || expiry > latestExpiry) latestExpiry = expiry;
    }
    // An entitlement is written with expiry = claim time + 8 h.
    let lastUsedAt: string | null = null;
    if (latestExpiry !== null) {
      lastUsedAt = new Date(latestExpiry - DEMO_SESSION_DURATION_MS).toISOString();
    }

    let status: DemoCodeStatus = 'active';
    if (code.revoked_at !== null) {
      status = 'revoked';
    } else if (new Date(code.expires_at) <= now) {
      status = 'expired';
    }

    return {
      id: code.id,
      label: code.label,
      status,
      expiresAt: code.expires_at,
      seatsInUse,
      maxSessions: code.max_sessions,
      lastUsedAt,
    };
  });
}
