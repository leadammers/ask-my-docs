# Per-person demo access codes

Status: draft for review · Date: 2026-10-01 · Supersedes the shared password of D-16 (proposed as D-24)

## Problem

The demo gate is one shared password (`DEMO_PASSWORD`, D-16). Once it is sent to a demo user it is effectively public: it can be forwarded, it cannot be withdrawn from one person, and rotating it locks out everyone. D-21 already enforces the gate in Postgres (`demo_entitlements`, `is_demo_entitled()`), so the fix is to change what _earns_ an entitlement, not to rebuild the gate.

## Goals

- Issue one code per demo user; revoke a single demo user without affecting anyone else.
- Revocation takes effect immediately at the database level, not only at the next login.
- Limit sharing: a code works on at most 3 concurrent sessions (devices/browsers).
- Codes expire on their own at the end of the demo period.
- Manage codes with a CLI script run by the human (no admin UI).

## Non-goals

- No admin web UI, no email delivery of codes, no self-service signup.
- No per-IP or fingerprint limits (see `conventions/security.md` §7, residual risk unchanged).
- No `DEMO_PASSWORD` fallback: the password is removed, not kept alongside codes.
- Revocation does not delete a demo user's notebooks; retention (30 days) still applies.

## Design

### Data model (one migration)

New table `demo_codes`:

| Column         | Type                | Notes                                         |
| -------------- | ------------------- | --------------------------------------------- |
| `id`           | uuid pk             | `gen_random_uuid()`; what `revoke` takes      |
| `label`        | text not null       | Who it was issued to; 1–100 chars             |
| `code_hash`    | text not null unique | HMAC-SHA256 hex of the normalised code       |
| `created_at`   | timestamptz         | default `now()`                               |
| `expires_at`   | timestamptz not null | CLI default: end of the demo period           |
| `revoked_at`   | timestamptz         | null = active                                 |
| `max_sessions` | int not null        | default 3, check `between 1 and 10`           |

RLS enabled, no policies. Follow the `demo_entitlements` grant pattern: `revoke all` from `anon, authenticated, service_role`, then grant only what `service_role` needs (the repo note on hosted vs. local default privileges applies).

`demo_entitlements` gains `code_id uuid not null references demo_codes (id) on delete cascade`. "Last used" in `list` is derived as `max(expires_at) - 8h` over the code's entitlements, so no extra column is needed.

`is_demo_entitled()` is replaced (same signature, same `stable security definer set search_path = ''`) to also require the code to be live:

```sql
select exists (
  select 1
  from public.demo_entitlements e
  join public.demo_codes c on c.id = e.code_id
  where e.user_id = (select auth.uid())
    and e.expires_at > now()
    and c.revoked_at is null
    and c.expires_at > now()
);
```

The nine policies that call it are unchanged. Revoking a code therefore closes every existing session of that demo user on the next request, including direct PostgREST calls.

### Claiming a session

`public.claim_demo_session(p_code_hash text, p_user_id uuid, p_ttl_seconds integer) returns text`, `security definer`, `search_path = ''`, executable by `service_role` only (revoked from `public`, `anon`, `authenticated`). One transaction:

1. `select … from demo_codes where code_hash = p_code_hash for update` (the lock serialises concurrent claims on the same code, so the seat count cannot be raced).
2. No row, `revoked_at` set, or `expires_at <= now()` → return `'invalid'`.
3. Count that code's live entitlements (`expires_at > now()`) _excluding `p_user_id`'s own_, so a re-login on the same session uses no extra seat. If the count is `>= max_sessions` → return `'seats_full'`.
4. Upsert the entitlement (`user_id`, `code_id`, `expires_at = now() + make_interval(secs => p_ttl_seconds)`) → `'ok'`.

Returning a status string, not raising, keeps the action's error mapping trivial and leaks nothing through SQL error text. A user who re-enters a _different_ valid code replaces their entitlement's `code_id` (upsert on `user_id`) and consumes a seat on the new code only.

### Login action (`app/demo-login/actions.ts`)

- The existing flow stays: rate-limit by IP, Zod-validate, resolve the user with `createClient().auth.getUser()`, then grant, set the cookie, redirect `/`.
- The field becomes `code` (Zod: trimmed string, 8–64 chars). `lib/demo-codes.ts` normalises (trim, uppercase, strip spaces and hyphens) and hashes it with `DEMO_CODE_PEPPER`.
- The grant becomes `rpc('claim_demo_session', …)` via the service-role client (user input selects no row by itself: it is hashed and matched against a unique column, and the user id comes from the server-resolved session).
- Outcomes: `ok` → cookie + redirect. `invalid` → `/demo-login?error=1` ("That code is invalid or has expired" — one message for unknown, revoked and expired, so a guess learns nothing). `seats_full` → `/demo-login?error=seats` ("This code is already in use on its maximum number of devices", worded without a number because the limit is per code).
- The cookie is unchanged (HMAC, 8 h, route gate only, no `code_id` in it). A revoked demo user still passes `proxy.ts` but sees an empty app, exactly the D-21 trade-off; the cookie is not an authorization layer.
- The in-process login limiter stays as the stopgap it is. With 128-bit codes the guessing risk it covered (security.md §7) is gone, so that paragraph is rewritten rather than the limiter hardened.

### Code format and secrets

- Code: `AMD-` + 26 Crockford base32 characters (128 bits from `crypto.getRandomValues`; the alphabet has no I, L, O or U), grouped for readability on display, e.g. `AMD-7K2Q-…`. Normalisation makes grouping and case irrelevant when typing and folds O to 0 and I/L to 1.
- Stored only as `HMAC-SHA256(DEMO_CODE_PEPPER, normalisedCode)`. The plaintext exists once, in the CLI output at creation.
- New env var `DEMO_CODE_PEPPER` (min 32 chars) in `lib/env.ts`, `.env.example`, the CI e2e job env (needed because `SKIP_ENV_VALIDATION=1` skips defaults) and Vercel (human step). `DEMO_PASSWORD` is removed everywhere. `DEMO_COOKIE_SECRET` stays.
- Rotating the pepper invalidates every code; treat it like `DEMO_COOKIE_SECRET`.

### Code layout

- `lib/demo-codes.ts` — pure and unit-tested: `generateDemoCode()`, `normalizeDemoCode()`, `hashDemoCode(code, pepper)`, `formatDemoCode()`. No env reads (pepper is a parameter), per the pure-core principle.
- `scripts/demo-codes.ts` — thin CLI, service-role client, run with the production env values by the human (D-11). Never run by an agent against the hosted project.
  - `create "<label>" [--days N] [--sessions N]` — inserts the row, prints the code once with its id and expiry.
  - `list` — label, id, status (active / revoked / expired), expiry, seats in use / max, last used. Never prints a code or a hash.
  - `revoke <id>` — sets `revoked_at = now()`; idempotent.
- `app/demo-login/actions.ts`, `components/demo-login-form.tsx` — field renamed and relabelled "Access code"; new error text for `seats`.

### Rollout

- The migration deletes all existing `demo_entitlements` rows (they have no code), so everyone re-enters a code; it ships in the same release as the code change (as D-21 did).
- Hosted migration and Vercel env changes are human steps; after the deploy the human runs `create` for each demo user and sends the code.
- README: "request a password" becomes "request an access code"; the drafted mailto body changes accordingly.

## Testing

- Unit (`lib/demo-codes.test.ts`): generated codes are unique, match the format and carry 128 bits; normalisation maps case, spaces and hyphens to one value; hashing is deterministic, pepper-dependent and never returns the code.
- pgTAP (`supabase/tests/`): unknown, revoked and expired codes → `invalid`; 4th concurrent session → `seats_full`; same-user re-login uses no seat; an expired entitlement frees its seat; revoking a code makes `is_demo_entitled()` false for its sessions; `anon` and `authenticated` can neither read `demo_codes` nor execute `claim_demo_session`.
- e2e: `e2e/auth.setup.ts` and `e2e/entitle.ts` mint a test code through the service role (insert a `demo_codes` row once in setup; entitlements reference it) instead of reading `DEMO_PASSWORD`. One e2e spec exercises the real form: bad code shows the generic error, a valid code enters. Test codes are created with `max_sessions` high enough for the suite's fresh-user-per-test pattern.
- `lib/retention-run.integration.test.ts` grants its entitlement against a code row created in the test.

## Docs to update with the implementation

- `docs/decisions.md`: append D-24 (proposed), noting it supersedes D-16's shared password and builds on D-21.
- `conventions/security.md` §2 (codes buy the entitlement) and §7 (limiter paragraph: guessing is infeasible, limiter remains a stopgap).
- `docs/models.md` (`demo_codes`, `demo_entitlements.code_id`), `docs/architecture.md` if it describes the gate, `README.md`, `.env.example`, and a row in `docs/ai-workflow.md`.

## Risks and accepted trade-offs

- A demo user can still share a code with up to two other devices; the cap bounds it, revocation ends it.
- Seat counting uses live entitlements (8 h TTL), so a closed browser frees its seat only when its entitlement expires, or when the demo user asks for a new code. Accepted; no explicit logout.
- A revoked demo user's cookie still passes the route gate until it expires (8 h); the database returns nothing for them. Same as D-21.
- Losing `DEMO_CODE_PEPPER` or rotating it invalidates all codes; the human re-issues them.
