# T02b — Demo password gate

**Mode:** shared · **Priority:** P0 · **Depends on:** T02 · **Estimate:** 0.75h · **Your time:** 10 min

## Goal
Every route of the deployed app (except the login page itself and static assets) requires a short-lived, signed, httpOnly session cookie obtained by submitting a shared demo password. No other path into the app exists.

## Your part
- Choose the demo password and generate a cookie-signing secret (`openssl rand -hex 32`), set `DEMO_PASSWORD` and `DEMO_COOKIE_SECRET` in `.env.local` and, at release time, in Vercel.
- Share the password with reviewers out of band (README already documents this once T15 lands).

## Context
- `docs/decisions.md` D-05 (anonymous sessions, no accounts) and D-09 (layered abuse protection) — this gate is a new layer *in front of* that flow, not a replacement: it keeps the app off the public internet for anyone without the password, while anonymous auth + RLS continue to isolate visitors from each other underneath.
- `conventions/security.md` §2 (auth), §4 (input validation), §7 (rate limits) apply.
- `proxy.ts` (T03) already exists for Supabase session refresh; this task extends it.

## Scope
- `lib/env.ts`: add `DEMO_PASSWORD` (min 1 char) and `DEMO_COOKIE_SECRET` (min 32 chars) to the server schema.
- `lib/demo-gate.ts`: pure functions — `createDemoToken(secret, now?)` and `verifyDemoToken(secret, token, now?)`. Token is `"<expiresAtEpochMs>.<hmac-sha256-hex>"` using Web Crypto (`crypto.subtle`), no Node-only APIs (must run in `proxy.ts`). Session lasts 8h. Password comparison and token verification both go through a constant-time compare (hash both sides first so differing lengths don't leak via early return).
- `app/demo-login/page.tsx`: a plain HTML form (works with JS disabled), POSTing to a server action. Shows an error message when `?error=1` is in the query string.
- `app/demo-login/actions.ts`: `"use server"` action — Zod-validates the submitted password (string, 1–200 chars), rate-limits attempts (in-memory, per-IP, e.g. 5 attempts / 5 min — document as best-effort/single-instance, same caveat as other in-memory limiters until T04's shared limiter exists), compares against `env.DEMO_PASSWORD` via the constant-time helper, sets the signed cookie (`httpOnly`, `secure` in production, `sameSite: "lax"`, `maxAge` matching the token's 8h) on success and redirects to `/`, or redirects to `/demo-login?error=1` on failure.
- `proxy.ts`: before the existing Supabase session-refresh logic, check the gate. Allow `/demo-login` and the existing static-asset exclusions through unchecked; every other path requires a valid, unexpired cookie token or redirects to `/demo-login`. Read `DEMO_COOKIE_SECRET` directly from `process.env` (proxy already does this for the public Supabase vars — see the existing comment in the file) since proxy runs outside the module graph `lib/env.ts` validates for.
- Unit tests for `lib/demo-gate.ts`: valid token round-trips, expired token rejected, tampered signature rejected, malformed token rejected.
- `.env.example` (or wherever env vars are documented): add the two new vars with placeholder values.

## Out of scope
- Anything about Turnstile, anonymous Supabase auth, or notebook CRUD — that is T03, unchanged by this task.
- A shared/persistent rate limiter (Upstash, Postgres-backed) — T04 builds the real one; this task's login rate limit is a best-effort stopgap.
- Logging out / rotating the password without a redeploy — not required for the demo window.

## Acceptance criteria
- [x] Visiting any app route without the cookie redirects to `/demo-login`.
- [x] Submitting the correct password sets an httpOnly, signed cookie and redirects to `/`; the app is then reachable normally.
- [x] Submitting the wrong password redirects back to `/demo-login?error=1` with a visible error, no cookie set.
- [x] A tampered cookie value (bit flipped in the signature) is rejected and redirects to `/demo-login`.
- [x] An expired token (test with a `now` far in the future in unit tests) is rejected.
- [x] `/demo-login` itself and Next.js static assets remain reachable without the cookie.
- [x] 6th login attempt within the rate-limit window is refused with a clear message, even with the correct password (proves the limiter fires before the password check succeeds). (human — verify by hand, no Playwright dependency on timing)
- [x] No route, server action, or route handler is reachable while bypassing `proxy.ts`'s check (reviewed by hand: confirm the matcher covers every path under `app/`).

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Notes for the agent
- Keep `lib/demo-gate.ts` pure and Web-Crypto-only (`crypto.subtle`, no `Buffer`, no Node `crypto` module) so the same code runs in `proxy.ts`'s runtime and in Node during tests/actions.
- This sits *before* T03's Supabase proxy logic in `proxy.ts`, not instead of it — both checks live in the same file, gate first.
- Do not touch `docs/decisions.md` beyond appending a new `proposed` entry (D-16) describing this layer; do not mark any existing decision as superseded.
