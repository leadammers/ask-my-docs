import { describe, expect, it } from 'vitest';
import { DEMO_SESSION_DURATION_MS } from '@/lib/demo-gate';
import {
  demoCodeInputSchema,
  formatDemoCode,
  generateDemoCode,
  hashDemoCode,
  normalizeDemoCode,
  summarizeDemoCodes,
  type DemoCodeRow,
  type DemoEntitlementRow,
} from '@/lib/demo-codes';

const PEPPER = 'p'.repeat(32);

describe('generateDemoCode', () => {
  it('encodes 128 bits as AMD- plus 26 Crockford base32 characters in groups of four', () => {
    expect(generateDemoCode(new Uint8Array(16))).toBe('AMD-0000-0000-0000-0000-0000-0000-00');
  });

  it('pads the last 3 bits when every bit is set', () => {
    expect(generateDemoCode(new Uint8Array(16).fill(255))).toBe(
      'AMD-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZW',
    );
  });

  it('draws fresh randomness by default', () => {
    const codes = new Set<string>();
    for (let index = 0; index < 50; index++) codes.add(generateDemoCode());
    expect(codes.size).toBe(50);
    for (const code of codes)
      expect(code).toMatch(/^AMD-([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{2}$/);
  });
});

describe('normalizeDemoCode', () => {
  it('maps case, spaces, hyphens and surrounding whitespace to one value', () => {
    const canonical = 'AMD' + 'A'.repeat(26);
    expect(normalizeDemoCode('AMD-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA')).toBe(canonical);
    expect(normalizeDemoCode('  amd aaaa aaaa aaaa aaaa aaaa aaaa aa \n')).toBe(canonical);
    expect(normalizeDemoCode('amd' + 'a'.repeat(26))).toBe(canonical);
  });
});

describe('look-alike characters', () => {
  it('never generates I, L, O or U', () => {
    for (let index = 0; index < 200; index++) {
      expect(generateDemoCode().slice('AMD-'.length)).not.toMatch(/[ILOU]/);
    }
  });

  it('folds a misread O, I or L to the digit it stands for', () => {
    expect(normalizeDemoCode('AMD-0O1I-1L00')).toBe('AMD00111100');
    expect(normalizeDemoCode('amd-oili')).toBe('AMD0111');
  });
});

describe('formatDemoCode', () => {
  it('regroups a normalised code', () => {
    expect(formatDemoCode('AMD' + 'A'.repeat(26))).toBe('AMD-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA');
  });
});

describe('hashDemoCode', () => {
  it('is deterministic and independent of how the code was typed', async () => {
    const typed = await hashDemoCode(PEPPER, 'amd aaaa aaaa aaaa aaaa aaaa aaaa aa');
    const pasted = await hashDemoCode(PEPPER, 'AMD-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA');
    expect(typed).toBe(pasted);
    expect(typed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('depends on the pepper and never echoes the code', async () => {
    const code = 'AMD-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA';
    const hash = await hashDemoCode(PEPPER, code);
    expect(await hashDemoCode('q'.repeat(32), code)).not.toBe(hash);
    expect(hash.toUpperCase()).not.toContain('AMD');
  });
});

describe('demoCodeInputSchema', () => {
  it('trims and accepts a normal code', () => {
    expect(demoCodeInputSchema.parse('  AMD-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA  ')).toBe(
      'AMD-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA',
    );
  });

  it('rejects empty, too-short and oversized input', () => {
    expect(demoCodeInputSchema.safeParse('').success).toBe(false);
    expect(demoCodeInputSchema.safeParse('   ').success).toBe(false);
    expect(demoCodeInputSchema.safeParse('short').success).toBe(false);
    expect(demoCodeInputSchema.safeParse('A'.repeat(65)).success).toBe(false);
  });
});

describe('summarizeDemoCodes', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');
  const hour = 60 * 60 * 1000;
  const baseCode: DemoCodeRow = {
    id: 'code-1',
    label: 'Alice',
    expires_at: '2026-10-20T00:00:00.000Z',
    revoked_at: null,
    max_sessions: 3,
  };

  it('counts only live entitlements as seats and derives last use from the newest expiry', () => {
    const entitlements: DemoEntitlementRow[] = [
      { code_id: 'code-1', expires_at: new Date(now.getTime() + 2 * hour).toISOString() },
      { code_id: 'code-1', expires_at: new Date(now.getTime() - 1 * hour).toISOString() },
      { code_id: 'other', expires_at: new Date(now.getTime() + 2 * hour).toISOString() },
    ];
    const summary = summarizeDemoCodes([baseCode], entitlements, now)[0];
    expect(summary?.seatsInUse).toBe(1);
    expect(summary?.maxSessions).toBe(3);
    expect(summary?.status).toBe('active');
    expect(summary?.lastUsedAt).toBe(
      new Date(now.getTime() + 2 * hour - DEMO_SESSION_DURATION_MS).toISOString(),
    );
  });

  it('reports no last use for a code nobody has claimed', () => {
    const summary = summarizeDemoCodes([baseCode], [], now)[0];
    expect(summary?.lastUsedAt).toBeNull();
    expect(summary?.seatsInUse).toBe(0);
  });

  it('prefers revoked over expired, and expired over active', () => {
    const revoked: DemoCodeRow = {
      ...baseCode,
      id: 'r',
      revoked_at: '2026-10-09T00:00:00.000Z',
      expires_at: '2026-10-01T00:00:00.000Z',
    };
    const expired: DemoCodeRow = { ...baseCode, id: 'e', expires_at: '2026-10-01T00:00:00.000Z' };
    const statuses = summarizeDemoCodes([revoked, expired, baseCode], [], now).map(
      (summary) => summary.status,
    );
    expect(statuses).toEqual(['revoked', 'expired', 'active']);
  });
});
