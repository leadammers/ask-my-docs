# Per-reviewer demo access codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared demo password with per-reviewer, revocable access codes (max 3 concurrent sessions each), managed by a CLI script.

**Architecture:** A new `demo_codes` table (HMAC-hashed codes) and an atomic `claim_demo_session` SQL function replace the password check. `demo_entitlements` gains a `code_id`, and `is_demo_entitled()` also requires the code to be live, so revocation is immediate at the database level. The signed cookie stays a route gate only. Pure logic lives in `lib/demo-codes.ts`; the login action and the CLI stay thin.

**Tech Stack:** Next.js server actions, Supabase (Postgres, pgTAP, supabase-js), Zod, Vitest, Playwright, tsx.

**Spec:** `docs/superpowers/specs/2026-10-01-demo-access-codes-design.md`

## Global Constraints

- Code format: `AMD-` + 26 base32 characters (128 bits from a CSPRNG), displayed in groups of 4; normalisation = strip everything but letters and digits, uppercase.
- Stored only as `HMAC-SHA256(DEMO_CODE_PEPPER, normalisedCode)` hex. Plaintext is printed once, by `create`.
- `max_sessions` default 3 (check 1–10). Entitlement TTL stays `DEMO_SESSION_DURATION_MS` (8 h). `DEMO_CODE_PEPPER` min 32 chars. `DEMO_PASSWORD` is removed with no fallback. `DEMO_COOKIE_SECRET` stays.
- `demo_codes`: RLS on, no policies, `revoke all` from `anon, authenticated, service_role` first, then grant `service_role` only (hosted Supabase has no default grants — AGENTS.md repo note).
- `claim_demo_session`: `security definer`, `set search_path = ''`, fully qualified names, executable by `service_role` only (revoke from `public, anon, authenticated` explicitly). Returns `'ok' | 'invalid' | 'seats_full'`, never raises for bad input.
- One generic "invalid or expired code" message for unknown, revoked and expired codes; a distinct message for full seats, worded without a number.
- Cookie unchanged: HMAC, 8 h, no `code_id` in it.
- Never run anything against the hosted Supabase project; never push without the user's per-push approval; do not mark tasks `done`. `docs/decisions.md` may only be appended to, with status `proposed`.
- Code style: explicit parameter and return types (including lambdas), `if/else` over ternaries, descriptive names, single quotes, no magic strings.
- Commits: Conventional Commits, no `--no-verify`. Work happens on a new branch `feat/demo-access-codes` created from `docs/demo-access-codes-spec` (so spec and plan travel with it).

## Review Focus

1. A reviewer types the code in a different shape — lowercase, with spaces instead of hyphens, trailing whitespace, no hyphens at all — and must still get in (Task 1: normalisation + schema tests).
2. Empty or huge input in the code field must give the generic error, not a 500 (Task 1: `demoCodeInputSchema` tests; Task 4: e2e wrong-code test).
3. A visitor who re-enters a _different_ valid code switches to it: the old code's seat is freed, the new one's is taken (Task 2: pgTAP steps 10–13).
4. Revoking or expiring a code mid-session ends data access on the very next request, including direct PostgREST calls (Task 2: pgTAP steps 16–17).
5. Two simultaneous claims on the last free seat must not both succeed. This relies on the `for update` row lock in `claim_demo_session` and cannot be asserted in pgTAP's single session; the reviewer should read that lock, and Task 2's sequential `seats_full` test pins the counting.

---

## File Structure

| File                                                          | Responsibility                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `lib/demo-codes.ts` (create)                                  | Pure: generate, normalise, format, hash, input schema, `summarizeDemoCodes` for the CLI               |
| `lib/demo-codes.test.ts` (create)                             | Unit tests for the above                                                                              |
| `lib/demo-gate.ts` (modify)                                   | Export `hmacHex`; drop `verifyDemoPassword`                                                           |
| `supabase/migrations/20261001120000_demo_access_codes.sql`    | Table, column, function, replaced `is_demo_entitled()`                                                |
| `supabase/tests/demo_codes.test.sql` (create)                 | pgTAP for claim logic and revocation                                                                  |
| `supabase/tests/{demo_entitlement,rls,grants}.test.sql`       | Fixtures gain a code; grants cover the new table and function                                         |
| `lib/supabase/types.ts` (regenerated)                         | `pnpm db:types`                                                                                       |
| `lib/env.ts`, `lib/env.test.ts`                               | `DEMO_PASSWORD` → `DEMO_CODE_PEPPER`                                                                  |
| `app/demo-login/actions.ts`, `components/demo-login-form.tsx` | Code field, `claim_demo_session`, new errors                                                          |
| `e2e/entitle.ts`, `e2e/auth.setup.ts`, `e2e/*.spec.ts`        | Mint a test code through the service role; type it into the form                                      |
| `lib/retention-run.integration.test.ts`                       | Entitlement now needs a code row                                                                      |
| `scripts/demo-codes.ts` (create)                              | CLI: `create`, `list`, `revoke`                                                                       |
| docs                                                          | D-24, `security.md`, `models.md`, README, `.env*.example`, `ai-workflow.md`, release checklist, specs |

---

### Task 1: Pure code logic (`lib/demo-codes.ts`)

**Files:**

- Create: `lib/demo-codes.ts`, `lib/demo-codes.test.ts`
- Modify: `lib/demo-gate.ts` (export `hmacHex`)

**Interfaces:**

- Produces (all in `@/lib/demo-codes`):
  - `generateDemoCode(randomBytes?: Uint8Array): string` — display form, e.g. `AMD-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA`
  - `normalizeDemoCode(raw: string): string`
  - `formatDemoCode(normalized: string): string`
  - `hashDemoCode(pepper: string, rawCode: string): Promise<string>` (hex)
  - `demoCodeInputSchema: z.ZodString` (trim, 8–64 chars)
  - `summarizeDemoCodes(codes: DemoCodeRow[], entitlements: DemoEntitlementRow[], now: Date): DemoCodeSummary[]`
  - types `DemoCodeRow`, `DemoEntitlementRow`, `DemoCodeStatus`, `DemoCodeSummary`
- Produces in `@/lib/demo-gate`: `hmacHex(secret: string, message: string): Promise<string>` (now exported).

- [ ] **Step 1: Branch**

```bash
git checkout -b feat/demo-access-codes docs/demo-access-codes-spec
```

- [ ] **Step 2: Write the failing tests** — create `lib/demo-codes.test.ts`:

```ts
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
  it('encodes 128 bits as AMD- plus 26 base32 characters in groups of four', () => {
    expect(generateDemoCode(new Uint8Array(16))).toBe('AMD-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA');
  });

  it('pads the last 3 bits when every bit is set', () => {
    expect(generateDemoCode(new Uint8Array(16).fill(255))).toBe(
      'AMD-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-Z4',
    );
  });

  it('draws fresh randomness by default', () => {
    const codes = new Set<string>();
    for (let index = 0; index < 50; index++) codes.add(generateDemoCode());
    expect(codes.size).toBe(50);
    for (const code of codes) expect(code).toMatch(/^AMD-([A-Z2-7]{4}-){6}[A-Z2-7]{2}$/);
  });
});

describe('normalizeDemoCode', () => {
  it('maps case, spaces, hyphens and surrounding whitespace to one value', () => {
    const canonical = 'AMDAAAAAAAAAAAAAAAAAAAAAAAAAA';
    expect(normalizeDemoCode('AMD-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA')).toBe(canonical);
    expect(normalizeDemoCode('  amd aaaa aaaa aaaa aaaa aaaa aaaa aa \n')).toBe(canonical);
    expect(normalizeDemoCode('amdaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(canonical);
  });
});

describe('formatDemoCode', () => {
  it('regroups a normalised code', () => {
    expect(formatDemoCode('AMDAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(
      'AMD-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA',
    );
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
    const [summary] = summarizeDemoCodes([baseCode], entitlements, now);
    expect(summary.seatsInUse).toBe(1);
    expect(summary.maxSessions).toBe(3);
    expect(summary.status).toBe('active');
    expect(summary.lastUsedAt).toBe(
      new Date(now.getTime() + 2 * hour - DEMO_SESSION_DURATION_MS).toISOString(),
    );
  });

  it('reports no last use for a code nobody has claimed', () => {
    const [summary] = summarizeDemoCodes([baseCode], [], now);
    expect(summary.lastUsedAt).toBeNull();
    expect(summary.seatsInUse).toBe(0);
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
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm vitest run lib/demo-codes.test.ts`
Expected: FAIL — cannot resolve `@/lib/demo-codes`.

- [ ] **Step 4: Export `hmacHex`** — in `lib/demo-gate.ts` change `async function hmacHex(` to `export async function hmacHex(`.

- [ ] **Step 5: Implement** — create `lib/demo-codes.ts`:

```ts
import { z } from 'zod';
import { DEMO_SESSION_DURATION_MS, hmacHex } from '@/lib/demo-gate';

// Per-reviewer demo access codes (D-24). Pure: no env, no I/O — the pepper is a
// parameter, randomness is injectable.

const CODE_PREFIX = 'AMD';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
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

/** Strips everything but letters and digits and uppercases, so typing style never matters. */
export function normalizeDemoCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
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
```

- [ ] **Step 6: Run to verify they pass**

Run: `pnpm vitest run lib/demo-codes.test.ts lib/demo-gate.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/demo-codes.ts lib/demo-codes.test.ts lib/demo-gate.ts
git commit -m "feat: add pure demo access-code logic"
```

---

### Task 2: Migration, pgTAP, generated types

**Files:**

- Create: `supabase/migrations/20261001120000_demo_access_codes.sql`, `supabase/tests/demo_codes.test.sql`
- Modify: `supabase/tests/demo_entitlement.test.sql`, `supabase/tests/rls.test.sql`, `supabase/tests/grants.test.sql`, `lib/supabase/types.ts` (regenerated), `docs/superpowers/specs/2026-10-01-demo-access-codes-design.md`

**Interfaces:**

- Produces (DB): table `demo_codes(id, label, code_hash, created_at, expires_at, revoked_at, max_sessions)`; `demo_entitlements.code_id uuid not null`; `public.claim_demo_session(p_code_hash text, p_user_id uuid, p_ttl_seconds integer) returns text` (`'ok' | 'invalid' | 'seats_full'`); `public.is_demo_entitled()` requires a live code.

Deviation from the spec text: the function takes `p_ttl_seconds integer` instead of `p_ttl interval` — supabase-js passes plain numbers cleanly. Step 9 updates the spec to match.

- [ ] **Step 1: Start the local stack**

Run: `pnpm db:start` (Docker must be running). Expected: stack up.

- [ ] **Step 2: Write the failing pgTAP file** — create `supabase/tests/demo_codes.test.sql`:

```sql
-- Per-reviewer demo access codes (D-24): claim_demo_session counts seats under a
-- row lock, and is_demo_entitled() also requires the code to be live, so
-- revoking or expiring a code ends access immediately. Codes here are fake
-- hashes — the function never sees a plaintext code.
begin;
select plan(20);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'c@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'd@test.local');

insert into demo_codes (id, label, code_hash, expires_at, revoked_at, max_sessions) values
  ('c0de0000-0000-0000-0000-000000000001', 'live',    'hash-live',    now() + interval '7 days', null,  2),
  ('c0de0000-0000-0000-0000-000000000002', 'revoked', 'hash-revoked', now() + interval '7 days', now(), 2),
  ('c0de0000-0000-0000-0000-000000000003', 'expired', 'hash-expired', now() - interval '1 second', null, 2),
  ('c0de0000-0000-0000-0000-000000000004', 'other',   'hash-other',   now() + interval '7 days', null,  1);

-- ---------------------------------------------------------------------------
-- Claiming (as the table owner, which is what service_role's call amounts to)
-- ---------------------------------------------------------------------------
select is(public.claim_demo_session('hash-unknown', '11111111-1111-1111-1111-111111111111', 28800), 'invalid', '1 an unknown code is invalid');
select is(public.claim_demo_session('hash-revoked', '11111111-1111-1111-1111-111111111111', 28800), 'invalid', '2 a revoked code is invalid');
select is(public.claim_demo_session('hash-expired', '11111111-1111-1111-1111-111111111111', 28800), 'invalid', '3 an expired code is invalid');

select is(public.claim_demo_session('hash-live', '11111111-1111-1111-1111-111111111111', 28800), 'ok', '4 A claims the live code');
select is(
  (select code_id from demo_entitlements where user_id = '11111111-1111-1111-1111-111111111111'),
  'c0de0000-0000-0000-0000-000000000001'::uuid,
  '5 the entitlement records which code granted it'
);
select is(public.claim_demo_session('hash-live', '22222222-2222-2222-2222-222222222222', 28800), 'ok', '6 B takes the second seat');
select is(public.claim_demo_session('hash-live', '33333333-3333-3333-3333-333333333333', 28800), 'seats_full', '7 C is refused: both seats are in use');
select is(public.claim_demo_session('hash-live', '11111111-1111-1111-1111-111111111111', 28800), 'ok', '8 A logging in again on the same session uses no extra seat');
select is(
  (select count(*)::int from demo_entitlements where code_id = 'c0de0000-0000-0000-0000-000000000001' and expires_at > now()),
  2,
  '9 two live seats are in use'
);

-- Switching codes frees the old seat and takes one on the new code.
select is(public.claim_demo_session('hash-other', '11111111-1111-1111-1111-111111111111', 28800), 'ok', '10 A switches to another code');
select is(
  (select count(*)::int from demo_entitlements where code_id = 'c0de0000-0000-0000-0000-000000000001' and expires_at > now()),
  1,
  '11 the first code lost A''s seat'
);
select is(public.claim_demo_session('hash-live', '44444444-4444-4444-4444-444444444444', 28800), 'ok', '12 D takes the seat A freed');
select is(public.claim_demo_session('hash-live', '33333333-3333-3333-3333-333333333333', 28800), 'seats_full', '13 C is refused again');

-- An expired entitlement frees its seat.
update demo_entitlements set expires_at = now() - interval '1 second'
  where user_id = '22222222-2222-2222-2222-222222222222';
select is(public.claim_demo_session('hash-live', '33333333-3333-3333-3333-333333333333', 28800), 'ok', '14 C gets the seat B''s expired session released');

-- ---------------------------------------------------------------------------
-- Revocation and code expiry end access through the policies' own function
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(public.is_demo_entitled(), true, '15 D holds a live entitlement on a live code');

reset role;
update demo_codes set revoked_at = now() where id = 'c0de0000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(public.is_demo_entitled(), false, '16 revoking the code ends D''s access at once');

reset role;
update demo_codes set revoked_at = null, expires_at = now() - interval '1 second'
  where id = 'c0de0000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(public.is_demo_entitled(), false, '17 an expired code ends D''s access too');

-- ---------------------------------------------------------------------------
-- Only the server can reach any of it
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select code_hash from demo_codes $$,
  '42501',
  'permission denied for table demo_codes',
  '18 authenticated cannot read demo_codes'
);
select throws_ok(
  $$ select public.claim_demo_session('hash-live', '44444444-4444-4444-4444-444444444444', 28800) $$,
  '42501',
  'permission denied for function claim_demo_session',
  '19 authenticated cannot claim a session itself'
);

set local role anon;
select throws_ok(
  $$ select public.claim_demo_session('hash-live', '44444444-4444-4444-4444-444444444444', 28800) $$,
  '42501',
  'permission denied for function claim_demo_session',
  '20 anon cannot claim a session'
);

reset role;
select * from finish();
rollback;
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm db:test`
Expected: FAIL — relation `demo_codes` does not exist (other files still pass).

- [ ] **Step 4: Write the migration** — create `supabase/migrations/20261001120000_demo_access_codes.sql`:

```sql
-- D-24: per-reviewer demo access codes replace the shared demo password.
--
-- demo_codes holds one row per reviewer (HMAC hash only — the plaintext is
-- printed once by scripts/demo-codes.ts). Every entitlement now records the
-- code that granted it, and is_demo_entitled() requires that code to be
-- unrevoked and unexpired, so revoking a code closes the database half of the
-- gate immediately (D-21), including direct PostgREST calls.

-- Entitlements issued by the password have no code: everyone re-enters one.
delete from demo_entitlements;

create table demo_codes (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 100),
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_sessions integer not null default 3 check (max_sessions between 1 and 10)
);

alter table demo_codes enable row level security;
-- No policies: server only (default deny), like demo_entitlements.

revoke all on demo_codes from anon, authenticated, service_role;
grant select, insert, update on demo_codes to service_role;

alter table demo_entitlements
  add column code_id uuid not null references demo_codes (id) on delete cascade;
create index demo_entitlements_code_id_idx on demo_entitlements (code_id);

-- ---------------------------------------------------------------------------
-- claim_demo_session: the only door from "a code" to "an entitlement".
--
-- The row lock on the code serialises concurrent claims, so two visitors cannot
-- both take the last seat. Re-claiming on the same session uses no extra seat
-- (the caller's own entitlement is excluded from the count), and claiming a
-- different code moves the session: the upsert re-points the entitlement.
-- Returns a status rather than raising, so a bad code leaks nothing through
-- error text.
-- ---------------------------------------------------------------------------
create function public.claim_demo_session(
  p_code_hash text,
  p_user_id uuid,
  p_ttl_seconds integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.demo_codes%rowtype;
  v_seats_in_use integer;
begin
  select * into v_code
  from public.demo_codes
  where code_hash = p_code_hash
  for update;

  if not found or v_code.revoked_at is not null or v_code.expires_at <= now() then
    return 'invalid';
  end if;

  select count(*) into v_seats_in_use
  from public.demo_entitlements
  where code_id = v_code.id
    and expires_at > now()
    and user_id <> p_user_id;

  if v_seats_in_use >= v_code.max_sessions then
    return 'seats_full';
  end if;

  insert into public.demo_entitlements (user_id, code_id, expires_at)
  values (p_user_id, v_code.id, now() + make_interval(secs => p_ttl_seconds))
  on conflict (user_id) do update
    set code_id = excluded.code_id,
        expires_at = excluded.expires_at;

  return 'ok';
end;
$$;

-- Supabase's default privileges grant execute on new functions to anon and
-- authenticated directly, so revoke from them by name as well as from public.
revoke execute on function public.claim_demo_session(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_demo_session(text, uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- is_demo_entitled: a live entitlement on a live code. Same shape as before
-- (stable, security definer, empty search_path); the nine policies calling it
-- are untouched.
-- ---------------------------------------------------------------------------
create or replace function public.is_demo_entitled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.demo_entitlements e
    join public.demo_codes c on c.id = e.code_id
    where e.user_id = (select auth.uid())
      and e.expires_at > now()
      and c.revoked_at is null
      and c.expires_at > now()
  );
$$;
```

- [ ] **Step 5: Update the existing pgTAP fixtures**

In `supabase/tests/demo_entitlement.test.sql`, add a code row after the `insert into app_settings` statement and give the one entitlement insert a `code_id`:

```sql
insert into demo_codes (id, label, code_hash, expires_at) values
  ('c0de0000-0000-0000-0000-000000000001', 'fixture', 'hash-fixture', now() + interval '7 days');
```

and change

```sql
insert into demo_entitlements (user_id, expires_at)
values ('11111111-1111-1111-1111-111111111111', now() + interval '8 hours');
```

to

```sql
insert into demo_entitlements (user_id, code_id, expires_at)
values ('11111111-1111-1111-1111-111111111111', 'c0de0000-0000-0000-0000-000000000001', now() + interval '8 hours');
```

(The later `throws_ok` that inserts into `demo_entitlements` without a `code_id` stays as is: the privilege error comes before the not-null check. Also update the header comment's "password" wording to "access code".)

In `supabase/tests/rls.test.sql`, add the same `demo_codes` insert before the `insert into demo_entitlements` statement and change that insert to:

```sql
insert into demo_entitlements (user_id, code_id, expires_at) values
  ('11111111-1111-1111-1111-111111111111', 'c0de0000-0000-0000-0000-000000000001', now() + interval '8 hours'),
  ('22222222-2222-2222-2222-222222222222', 'c0de0000-0000-0000-0000-000000000001', now() + interval '8 hours');
```

In `supabase/tests/grants.test.sql`, change `select plan(30);` to `select plan(36);` and add after the `demo_entitlements` privilege lines:

```sql
select table_privs_are('public', 'demo_codes', 'anon', array[]::text[], 'anon has no privileges on demo_codes');
select table_privs_are('public', 'demo_codes', 'authenticated', array[]::text[], 'authenticated has no privileges on demo_codes');
select table_privs_are('public', 'demo_codes', 'service_role', array['SELECT', 'INSERT', 'UPDATE'], 'service_role can read, issue and revoke codes');

select function_privs_are('public', 'claim_demo_session', array['text', 'uuid', 'integer'], 'anon', array[]::text[], 'anon cannot execute claim_demo_session');
select function_privs_are('public', 'claim_demo_session', array['text', 'uuid', 'integer'], 'authenticated', array[]::text[], 'authenticated cannot execute claim_demo_session');
select function_privs_are('public', 'claim_demo_session', array['text', 'uuid', 'integer'], 'service_role', array['EXECUTE'], 'service_role executes claim_demo_session');
```

- [ ] **Step 6: Find any other fixture that inserts entitlements**

Run: `grep -rn "demo_entitlements" supabase/ --include=*.sql | grep -v migrations | grep -v "demo_codes.test\|demo_entitlement.test\|rls.test\|grants.test"`
Expected: no output. If a file shows up, give its insert a `code_id` the same way.

- [ ] **Step 7: Reset and run the DB suite**

Run: `pnpm db:reset && pnpm db:test`
Expected: all files pass, including the 20 new assertions and the 6 new grants assertions.

- [ ] **Step 8: Regenerate types**

Run: `pnpm db:types && git diff --stat lib/supabase/types.ts`
Expected: `demo_codes` table, `demo_entitlements.code_id` and `claim_demo_session` appear in `lib/supabase/types.ts`.

- [ ] **Step 9: Align the spec** — in `docs/superpowers/specs/2026-10-01-demo-access-codes-design.md` replace `claim_demo_session(p_code_hash text, p_user_id uuid, p_ttl interval)` with `claim_demo_session(p_code_hash text, p_user_id uuid, p_ttl_seconds integer)` and `now() + p_ttl` with `now() + make_interval(secs => p_ttl_seconds)`; also change step 3 and 4 of "Claiming a session" to match the migration (the caller's own entitlement is excluded from the seat count, so a same-session re-login needs no separate branch). Run `pnpm exec prettier --write` on it.

- [ ] **Step 10: Commit**

```bash
git add supabase lib/supabase/types.ts docs/superpowers/specs
git commit -m "feat(db): add demo access codes and claim_demo_session"
```

---

### Task 3: Switch the login flow to codes

**Files:**

- Modify: `lib/env.ts`, `lib/env.test.ts`, `app/demo-login/actions.ts`, `components/demo-login-form.tsx`, `lib/demo-gate.ts`, `lib/demo-gate.test.ts`, `.env.example`, `.env.test.example`, `.github/workflows/ci.yml`, `playwright.config.ts` (comments only)

**Interfaces:**

- Consumes: `demoCodeInputSchema`, `hashDemoCode` (Task 1); `claim_demo_session` (Task 2, typed in `lib/supabase/types.ts`).
- Produces: login form field name `code`, label `Access code`; error params `?error=1` (invalid), `?error=seats`, plus the existing `rate_limited` and `no_session`.

- [ ] **Step 1: Update the env test first** — in `lib/env.test.ts`: in `REQUIRED_KEYS` replace `'DEMO_PASSWORD'` with `'DEMO_CODE_PEPPER'`; in `setValidEnv` replace `DEMO_PASSWORD: 'test-password',` with `DEMO_CODE_PEPPER: 'p'.repeat(32),`; change both `/DEMO_PASSWORD/` matchers to `/DEMO_CODE_PEPPER/`; change `process.env.DEMO_PASSWORD = '';` to `process.env.DEMO_CODE_PEPPER = '';`. Add:

```ts
  it('rejects a pepper shorter than 32 characters', async () => {
    setValidEnv();
    process.env.DEMO_CODE_PEPPER = 'short';
    await expect(import('@/lib/env')).rejects.toThrow(/DEMO_CODE_PEPPER/);
  });
```

Run: `pnpm vitest run lib/env.test.ts`
Expected: FAIL (schema still wants `DEMO_PASSWORD`).

- [ ] **Step 2: Change the schema** — in `lib/env.ts` replace `DEMO_PASSWORD: z.string().min(1),` with `DEMO_CODE_PEPPER: z.string().min(32),`.

Run: `pnpm vitest run lib/env.test.ts` — Expected: PASS.

- [ ] **Step 3: Remove the password verifier** — in `lib/demo-gate.ts` delete `verifyDemoPassword`. In `lib/demo-gate.test.ts` delete the `describe('verifyDemoPassword', …)` block and drop it from the import (`import { createDemoToken, verifyDemoToken } from '@/lib/demo-gate';`). `timingSafeEqualHex` stays (used by `verifyDemoToken`); update its comment from "secret/password" to "secret".

- [ ] **Step 4: Rewrite the action** — replace `app/demo-login/actions.ts` with:

```ts
'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { demoCodeInputSchema, hashDemoCode } from '@/lib/demo-codes';
import { DEMO_COOKIE_NAME, DEMO_SESSION_DURATION_MS, createDemoToken } from '@/lib/demo-gate';
import { isRateLimited, recordAttempt } from '@/lib/demo-login-rate-limit';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function login(formData: FormData): Promise<void> {
  const headerList = await headers();
  const clientKey = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (isRateLimited(clientKey)) {
    redirect('/demo-login?error=rate_limited');
  }
  recordAttempt(clientKey);

  const parsedCode = demoCodeInputSchema.safeParse(formData.get('code'));
  if (!parsedCode.success) {
    redirect('/demo-login?error=1');
  }

  // The cookie only gates the Next routes. PostgREST is a different origin and
  // never sees it, so the same entitlement has to exist in the database — see
  // 20260929114828_demo_entitlement.sql (conventions/security.md §3).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/demo-login?error=no_session');
  }

  // The code is only ever hashed and matched against a unique column; the user
  // id comes from the server-resolved session, never from the form (D-24).
  const codeHash = await hashDemoCode(env.DEMO_CODE_PEPPER, parsedCode.data);
  const { data: outcome, error: claimError } = await createAdminClient().rpc(
    'claim_demo_session',
    {
      p_code_hash: codeHash,
      p_user_id: user.id,
      p_ttl_seconds: DEMO_SESSION_DURATION_MS / 1000,
    },
  );
  if (claimError) {
    redirect('/demo-login?error=1');
  }
  if (outcome === 'seats_full') {
    redirect('/demo-login?error=seats');
  }
  if (outcome !== 'ok') {
    redirect('/demo-login?error=1');
  }

  const token = await createDemoToken(env.DEMO_COOKIE_SECRET);
  const cookieStore = await cookies();
  cookieStore.set(DEMO_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: DEMO_SESSION_DURATION_MS / 1000,
    path: '/',
  });

  redirect('/');
}
```

- [ ] **Step 5: Update the form** — in `components/demo-login-form.tsx`: change the doc comment's first line to "The code is only accepted once there is a session…", the heading to `Enter your access code`, and replace the error block and the input with:

```tsx
      {error === 'rate_limited' ? (
        <p className="text-destructive text-sm">
          Too many attempts. Please wait a few minutes and try again.
        </p>
      ) : error === 'no_session' ? (
        <p className="text-destructive text-sm">
          Your session wasn&apos;t ready yet. Please reload the page and enter the code again.
        </p>
      ) : error === 'seats' ? (
        <p className="text-destructive text-sm">
          This code is already in use on its maximum number of devices. Ask for a new one if you
          need more.
        </p>
      ) : error ? (
        <p className="text-destructive text-sm">That code is invalid or has expired.</p>
      ) : null}
      <label htmlFor="code" className="text-sm font-medium">
        Access code
      </label>
      <input
        id="code"
        type="text"
        name="code"
        autoFocus
        required
        maxLength={64}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        className="border-input bg-background rounded-md border px-3 py-2 font-mono text-sm"
      />
```

(The nested ternary mirrors the existing form; keep it rather than restructuring in this task.)

- [ ] **Step 6: Config and example files**
  - `.env.example`: replace the two lines under "Demo password gate" with

    ```
    # --- Demo access-code gate (in front of everything else) ---
    DEMO_CODE_PEPPER=                   # openssl rand -hex 32 — keys the code hashes; rotating it invalidates every code
    DEMO_COOKIE_SECRET=                 # openssl rand -hex 32
    ```

  - `.env.test.example`: replace `DEMO_PASSWORD=ci-e2e-demo-password` with `DEMO_CODE_PEPPER=ci-e2e-demo-code-pepper-not-a-real-secret-32b`.
  - `.github/workflows/ci.yml` (e2e step env): same replacement for `DEMO_PASSWORD: ci-e2e-demo-password`.
  - `playwright.config.ts`: in the two comments replace "DEMO_PASSWORD for the setup test to type in" with "DEMO_CODE_PEPPER so the setup test can hash the code it mints" and "demo password" with "demo gate".

- [ ] **Step 7: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run lib`
Expected: PASS. `grep -rn "DEMO_PASSWORD\|verifyDemoPassword" app lib components e2e playwright.config.ts .github .env.example .env.test.example` will still list the e2e files — Task 4 fixes those.

- [ ] **Step 8: Commit**

```bash
git add lib app components .env.example .env.test.example .github playwright.config.ts
git commit -m "feat: sign in to the demo with a per-reviewer access code"
```

---

### Task 4: e2e and integration tests mint codes

**Files:**

- Modify: `e2e/entitle.ts`, `e2e/auth.setup.ts`, `e2e/notebooks.spec.ts`, `e2e/demo-gate.spec.ts`, `lib/retention-run.integration.test.ts`

**Interfaces:**

- Produces (`e2e/entitle.ts`): `E2E_DEMO_CODE: string`, `ensureE2eDemoCode(): Promise<string>` (returns the code row id, upserting a long-lived test code), `entitleSession(context)` (unchanged signature).

- [ ] **Step 1: Rewrite `e2e/entitle.ts`**

```ts
import type { BrowserContext } from '@playwright/test';
import { hashDemoCode } from '../lib/demo-codes';
import { DEMO_SESSION_DURATION_MS } from '../lib/demo-gate';

// The demo cookie only opens the Next routes. Demo data is gated by a
// `demo_entitlements` row, which app/demo-login/actions.ts writes through
// claim_demo_session once a valid access code is entered
// (20261001120000_demo_access_codes.sql).
//
// The specs mint a fresh anonymous session per test so notebooks and rate
// limits never collide, and typing the code for each of them would spend the
// suite's whole 5-attempt login budget — so their row is granted directly with
// the service role, pointing at one shared long-lived test code. The real
// code → row path is covered by e2e/auth.setup.ts and by the pgTAP suite.

const AUTH_COOKIE_PATTERN = /-auth-token(\.\d+)?$/;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Well-formed (base32 body) but only ever valid against the throwaway test database. */
export const E2E_DEMO_CODE = 'AMD-TEST-TEST-TEST-TEST-TEST-TEST-TE';

function serviceConfig(): { url: string; serviceKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run the E2E tests',
    );
  }
  return { url, serviceKey };
}

/** The user id the browser is signed in as, read from its own session cookie. */
function sessionUserId(cookieValues: string[]): string {
  const decoded = Buffer.from(cookieValues.join('').replace(/^base64-/, ''), 'base64url').toString(
    'utf8',
  );
  const session = JSON.parse(decoded) as { user?: { id?: string } };
  const userId = session.user?.id;
  if (!userId) throw new Error('the session cookie holds no user id');
  return userId;
}

let e2eCodeId: Promise<string> | undefined;

/**
 * Upserts the shared test code (unrevoked, valid for a day, roomy enough for the
 * suite's fresh-user-per-test pattern) and returns its id. Safe to call from
 * every test; it hits the database once per worker.
 */
export function ensureE2eDemoCode(): Promise<string> {
  e2eCodeId ??= createE2eDemoCode();
  return e2eCodeId;
}

async function createE2eDemoCode(): Promise<string> {
  const { url, serviceKey } = serviceConfig();
  const pepper = process.env.DEMO_CODE_PEPPER;
  if (!pepper) throw new Error('DEMO_CODE_PEPPER must be set to run the E2E tests');

  const response = await fetch(`${url}/rest/v1/demo_codes?on_conflict=code_hash`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      label: 'e2e',
      code_hash: await hashDemoCode(pepper, E2E_DEMO_CODE),
      expires_at: new Date(Date.now() + ONE_DAY_MS).toISOString(),
      revoked_at: null,
      max_sessions: 10,
    }),
  });
  if (!response.ok) {
    throw new Error(`creating the e2e demo code failed with ${response.status}`);
  }
  const rows = (await response.json()) as { id: string }[];
  if (!rows[0]) throw new Error('creating the e2e demo code returned no row');
  return rows[0].id;
}

export async function entitleSession(context: BrowserContext): Promise<void> {
  const { url, serviceKey } = serviceConfig();
  const codeId = await ensureE2eDemoCode();

  const cookies = await context.cookies();
  if (!cookies.some((cookie) => cookie.name === 'demo_session')) {
    throw new Error('entitleSession needs a demo_session cookie — pass the demo gate first');
  }
  const authCookies = cookies
    .filter((cookie) => AUTH_COOKIE_PATTERN.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (authCookies.length === 0) {
    throw new Error('the session was never signed in — no auth cookie to read a user id from');
  }

  const response = await fetch(`${url}/rest/v1/demo_entitlements`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: sessionUserId(authCookies.map((cookie) => cookie.value)),
      code_id: codeId,
      expires_at: new Date(Date.now() + DEMO_SESSION_DURATION_MS).toISOString(),
    }),
  });
  if (!response.ok) {
    throw new Error(`granting the demo entitlement failed with ${response.status}`);
  }
}
```

(Keep the existing `(a, b)` sort lambda style unchanged from the original file; the original had the same untyped lambdas.)

- [ ] **Step 2: Rewrite `e2e/auth.setup.ts`**

```ts
import { expect, test as setup } from '@playwright/test';
import { DEMO_AUTH_STATE } from '../playwright.config';
import { E2E_DEMO_CODE, ensureE2eDemoCode } from './entitle';

// Logs in through the demo gate once and hands the cookie to every other
// test, so specs don't each spend one of the 5 login attempts per window.
setup('pass the demo access-code gate', async ({ page }) => {
  await ensureE2eDemoCode();

  await page.goto('/demo-login');
  await page.getByLabel('Access code').fill(E2E_DEMO_CODE);
  await page.getByRole('button', { name: 'Enter' }).click();

  await page.waitForURL('/');
  // The notebooks page only renders once AuthGate has silently signed the
  // visitor in anonymously and refreshed the server component — no login UI.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your notebooks');

  await page.context().storageState({ path: DEMO_AUTH_STATE });
});
```

- [ ] **Step 3: Update `e2e/notebooks.spec.ts`** — add `import { E2E_DEMO_CODE, ensureE2eDemoCode } from './entitle';`; in `signInFreshVisitor` replace the `password` lines with `await ensureE2eDemoCode();`, replace `page.getByLabel('Password').fill(password)` with `page.getByLabel('Access code').fill(E2E_DEMO_CODE)`; in the later test change `page.getByLabel('Password')` to `page.getByLabel('Access code')`. Update the comment above `test.describe.configure` only where it says "demo-gate spec's 'wrong password' test" → "wrong code".

- [ ] **Step 4: Update `e2e/demo-gate.spec.ts`** — heading expectation → `'Enter your access code'`; comment "who doesn't know the password" → "who has no access code"; the wrong-credential test becomes:

```ts
test('wrong code shows an error and sets no cookie', async ({ page, context }) => {
  await page.goto('/demo-login');
  await page.getByLabel('Access code').fill('AMD-WRNG-WRNG-WRNG-WRNG-WRNG-WRNG-WR');
  await page.getByRole('button', { name: 'Enter' }).click();

  await expect(page).toHaveURL('/demo-login?error=1');
  await expect(page.getByText('That code is invalid or has expired.')).toBeVisible();

  const cookies = await context.cookies();
  expect(cookies.find((cookie) => cookie.name === 'demo_session')).toBeUndefined();
});
```

- [ ] **Step 5: Retention integration test** — in `lib/retention-run.integration.test.ts` `addDataFor`, replace the entitlement block with:

```ts
  // Creating a notebook needs a live demo entitlement (20260929114828), and an
  // entitlement needs the code that granted it (20261001120000).
  const { data: code, error: codeError } = await admin
    .from('demo_codes')
    .upsert(
      {
        label: 'retention-integration-test',
        code_hash: 'retention-integration-test',
        expires_at: new Date(Date.now() + DEMO_SESSION_DURATION_MS).toISOString(),
      },
      { onConflict: 'code_hash' },
    )
    .select('id')
    .single();
  if (codeError) throw codeError;
  const { error: entitlementError } = await admin.from('demo_entitlements').upsert({
    user_id: user.id,
    code_id: code.id,
    expires_at: new Date(Date.now() + DEMO_SESSION_DURATION_MS).toISOString(),
  });
  if (entitlementError) throw entitlementError;
```

(Remove the old `// … what app/demo-login/actions.ts writes once the password is accepted.` lines.)

- [ ] **Step 6: Run the checks**

Needs the local stack (`pnpm db:start`), `.env.test.local` with the Supabase pair uncommented and `DEMO_CODE_PEPPER` set (copy from `.env.test.example`), and port 3000 free.

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: all pass, including `wrong code shows an error…`. The integration test runs inside `pnpm test` when the stack is up; if it is skipped locally, run it per its header comment.

- [ ] **Step 7: Commit**

```bash
git add e2e lib/retention-run.integration.test.ts
git commit -m "test: use access codes in e2e and the retention integration test"
```

---

### Task 5: Admin CLI (`scripts/demo-codes.ts`)

**Files:**

- Create: `scripts/demo-codes.ts`

**Interfaces:**

- Consumes: `generateDemoCode`, `hashDemoCode`, `summarizeDemoCodes` (Task 1); `createAdminClient`; `env.DEMO_CODE_PEPPER`.
- Produces: `create "<label>" [--days N] [--sessions N]`, `list`, `revoke <id>`.

The CLI is thin I/O over tested pure logic, so it gets a manual verification step against the _local_ stack rather than a unit test.

- [ ] **Step 1: Write the script**

```ts
// Issue, list and revoke per-reviewer demo access codes (D-24).
//   pnpm script scripts/demo-codes.ts create "<label>" [--days N] [--sessions N]
//   pnpm script scripts/demo-codes.ts list
//   pnpm script scripts/demo-codes.ts revoke <id>
//
// Against production this is a human-only step (D-11): run it with an env file
// holding the hosted NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the
// deployed DEMO_CODE_PEPPER, e.g.
//   SKIP_ENV_VALIDATION=1 pnpm exec tsx --conditions=react-server \
//     --env-file=.env.production.local scripts/demo-codes.ts list
// `create` prints the code exactly once; only its hash is stored.
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  generateDemoCode,
  hashDemoCode,
  summarizeDemoCodes,
  type DemoCodeRow,
  type DemoEntitlementRow,
} from '@/lib/demo-codes';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_CODE_LIFETIME_DAYS = 14;
const DEFAULT_MAX_SESSIONS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const createInputSchema = z.object({
  label: z.string().trim().min(1).max(100),
  days: z.coerce.number().int().min(1).max(90),
  sessions: z.coerce.number().int().min(1).max(10),
});

function requirePepper(): string {
  const pepper = env.DEMO_CODE_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error('DEMO_CODE_PEPPER must be set (min 32 chars) to hash codes');
  }
  return pepper;
}

async function createCode(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { days: { type: 'string' }, sessions: { type: 'string' } },
  });
  const input = createInputSchema.parse({
    label: positionals[0],
    days: values.days ?? DEFAULT_CODE_LIFETIME_DAYS,
    sessions: values.sessions ?? DEFAULT_MAX_SESSIONS,
  });

  const code = generateDemoCode();
  const { data, error } = await createAdminClient()
    .from('demo_codes')
    .insert({
      label: input.label,
      code_hash: await hashDemoCode(requirePepper(), code),
      expires_at: new Date(Date.now() + input.days * MS_PER_DAY).toISOString(),
      max_sessions: input.sessions,
    })
    .select('id, expires_at')
    .single();
  if (error) throw new Error('Could not create the code', { cause: error });

  console.log(`Code for "${input.label}" (shown once, not stored): ${code}`);
  console.log(`id:         ${data.id}`);
  console.log(`expires:    ${data.expires_at}`);
  console.log(`max devices: ${input.sessions}`);
}

async function listCodes(): Promise<void> {
  const client = createAdminClient();
  const [codes, entitlements] = await Promise.all([
    client
      .from('demo_codes')
      .select('id, label, expires_at, revoked_at, max_sessions')
      .order('created_at'),
    client.from('demo_entitlements').select('code_id, expires_at'),
  ]);
  if (codes.error) throw new Error('Could not list codes', { cause: codes.error });
  if (entitlements.error) {
    throw new Error('Could not read sessions', { cause: entitlements.error });
  }

  const summaries = summarizeDemoCodes(
    codes.data as DemoCodeRow[],
    entitlements.data as DemoEntitlementRow[],
    new Date(),
  );
  console.table(
    summaries.map((summary) => ({
      id: summary.id,
      label: summary.label,
      status: summary.status,
      expires: summary.expiresAt,
      seats: `${summary.seatsInUse}/${summary.maxSessions}`,
      lastUsed: summary.lastUsedAt ?? '—',
    })),
  );
}

async function revokeCode(args: string[]): Promise<void> {
  const id = z.string().uuid().parse(args[0]);
  const client = createAdminClient();

  const { data: existing, error: readError } = await client
    .from('demo_codes')
    .select('label, revoked_at')
    .eq('id', id)
    .maybeSingle();
  if (readError) throw new Error('Could not read the code', { cause: readError });
  if (!existing) throw new Error(`No code with id ${id}`);
  if (existing.revoked_at) {
    console.log(`"${existing.label}" was already revoked at ${existing.revoked_at}`);
    return;
  }

  const { error } = await client
    .from('demo_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error('Could not revoke the code', { cause: error });
  console.log(`Revoked "${existing.label}". Its sessions lose data access on their next request.`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'create') return createCode(rest);
  if (command === 'list') return listCodes();
  if (command === 'revoke') return revokeCode(rest);
  throw new Error('Usage: demo-codes.ts create "<label>" [--days N] [--sessions N] | list | revoke <id>');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 2: Verify locally** (local stack only, `.env.local` pointing at it)

Run, in order:

```bash
pnpm script scripts/demo-codes.ts create "Local test" --sessions 2
pnpm script scripts/demo-codes.ts list
pnpm script scripts/demo-codes.ts revoke <id printed above>
pnpm script scripts/demo-codes.ts list
pnpm script scripts/demo-codes.ts revoke not-a-uuid
```

Expected: `create` prints a code matching `AMD-XXXX-…` once; the first `list` shows `active`, `0/2`; after `revoke` the second `list` shows `revoked`; the last command exits 1 with a Zod error and no stack trace dump. The `list` output contains no code and no hash.

- [ ] **Step 3: Lint, typecheck, commit**

Run: `pnpm lint && pnpm typecheck`

```bash
git add scripts/demo-codes.ts
git commit -m "feat: add the demo access-code admin CLI"
```

---

### Task 6: Documentation

**Files:**

- Modify: `docs/decisions.md` (append D-24 only), `conventions/security.md` §2 and §7, `docs/models.md`, `README.md`, `docs/ai-workflow.md`, `tasks/README.md` (release checklist), `docs/scope.md` (password wording, if present)

- [ ] **Step 1: Append D-24** to `docs/decisions.md` (after D-23), following the file's heading pattern:

```markdown
## D-24 — Per-reviewer demo access codes replace the shared password

**Date:** 2026-10-01 · **Status:** proposed (supersedes the shared password of D-16; builds on D-21)

**Decision:** The demo password is replaced by one access code per reviewer (`AMD-` + 128 random bits, shown once, stored only as an HMAC hash keyed by `DEMO_CODE_PEPPER`). `claim_demo_session(code_hash, user_id, ttl)` (service-role only) locks the code row, refuses unknown/revoked/expired codes and a fourth concurrent session (`max_sessions`, default 3), and writes the `demo_entitlements` row with its `code_id`. `is_demo_entitled()` also requires the code to be unrevoked and unexpired, so revoking a code ends access at the database immediately. The cookie is unchanged (route gate only). Codes are issued, listed and revoked with `scripts/demo-codes.ts` by the human. `DEMO_PASSWORD` is removed with no fallback.
**Why:** a shared password is effectively public once sent, cannot be withdrawn from one person, and rotating it locks everyone out. Per-person codes make a leak attributable and revocable, and the seat cap bounds sharing.
**Rejected:** keeping the password beside codes (a permanent bypass); an admin web UI (a new privileged surface for a handful of reviewers); single-use OTPs (reviewers return over several days); putting `code_id` in the cookie (the cookie is not an authorization layer, D-21).
**Consequence:** one migration that clears existing entitlements, one new secret (`DEMO_CODE_PEPPER`; rotating it invalidates every code), a seat frees only when its 8 h entitlement expires. The in-process login limiter stays a stopgap, but guessing 128-bit codes is infeasible.
```

- [ ] **Step 2: `conventions/security.md`** — §2: replace the demo-password bullet with: "Each reviewer gets a revocable **access code** (`/demo-login`, D-24). A valid code buys an **entitlement**, not just a cookie: a `demo_entitlements` row naming the code, which the demo policies and `notebooks_insert_owner` require while the code is unrevoked and unexpired. Entitlements expire after 8 h; a code allows `max_sessions` concurrent ones." §7: in "The login limiter is a stopgap" paragraph replace the password-guessing reasoning with: codes carry 128 bits, so guessing them is infeasible regardless of the limiter; the limiter remains a per-instance stopgap against noise, and "revisit only if the gate ever protects something other than the public demo" stays.

- [ ] **Step 3: `docs/models.md`** — add a `demo_codes` row (`id PK`, `label`, `code_hash UNIQUE`, `created_at`, `expires_at`, `revoked_at`, `max_sessions` — "One row per reviewer. Server only; the hash is HMAC-SHA256 of the normalised code with `DEMO_CODE_PEPPER`.") and change the `demo_entitlements` row to include `code_id FK → demo_codes` and "one row per session that entered a valid access code".

- [ ] **Step 4: README** — run `grep -n -i "password" README.md` and replace every demo-password mention with access-code wording ("request an access code"). In the mailto link, replace the body with the URL-encoded text `Hi,\n\nI'd like to try the ask-my-docs demo (https://ask-my-docs-demo.vercel.app). Could you send me an access code?\n\nName / company (optional):\n\nThanks!` (keep `subject=ask-my-docs%20demo%20access%20request`). In "Known limitations" add one line: a code works on at most 3 devices at once, and a seat frees when its 8 h session expires.

- [ ] **Step 5: Release checklist** — in `tasks/README.md` "Release to production (human)", add before the `supabase db push` step: "Add `DEMO_CODE_PEPPER` (`openssl rand -hex 32`) to the Vercel env; remove `DEMO_PASSWORD`." and after the production smoke test: "Issue a code per reviewer: `scripts/demo-codes.ts create "<label>"` with production env values, send each code out of band." Run `grep -n -i "demo password\|DEMO_PASSWORD" docs/scope.md tasks/*.md` and update any live (non-historical) mention; leave `tasks/T02b-demo-password-gate.md` as history.

- [ ] **Step 6: `docs/ai-workflow.md`** — append one row to the log table: "Demo access codes (branch `feat/demo-access-codes`; no task file)" describing the spec, plan and implementation (migration + `claim_demo_session`, code-based login, e2e minting through the service role, admin CLI); leave the human-review column empty.

- [ ] **Step 7: Verify and commit**

Run: `pnpm format:check && pnpm lint`
Expected: PASS (run `pnpm format` first if Prettier complains).

```bash
git add docs conventions README.md tasks
git commit -m "docs: document per-reviewer demo access codes (D-24)"
```

---

## Final verification (before handing back for review)

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm db:test && pnpm test:e2e` all pass (local stack up, port 3000 free).
- [ ] `grep -rn "DEMO_PASSWORD" . --include=* -l | grep -v node_modules` lists only historical docs (T02b task file, D-16, ai-workflow history) and the findings JSON.
- [ ] Report the human steps still open: push the hosted migration, set `DEMO_CODE_PEPPER` / remove `DEMO_PASSWORD` in Vercel, then issue codes. Do not push without the user's approval.
