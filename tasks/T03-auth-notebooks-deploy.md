# T03 — Anonymous auth, notebooks CRUD, first deploy

**Mode:** shared · **Priority:** P0 · **Depends on:** T02 · **Estimate:** 1.75h · **Your time:** 30 min

## Goal
A visitor opening the live URL is silently signed in anonymously, can create, rename and delete notebooks, and sees them again after a reload. **The app is deployed on Vercel.**

## Your part
- **Release to production** (see `tasks/README.md`): `supabase db push` to the hosted project, merge to `main` (CI's `deploy-prod` deploys; the Vercel Git integration is off, D-23), confirm the Vercel deployment
- On the live URL: fresh browser → no visible login step (confirms Turnstile works in production); add the URL to the README

## Context
`docs/decisions.md` D-05. Supabase SSR guide for Next.js App Router (`@supabase/ssr`).

## Scope
- `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server components, actions, route handlers), the session-refresh file (`middleware.ts`, or `proxy.ts` in Next.js 16+ — follow the installed version and the current `@supabase/ssr` guide)
- On first visit without a session: render the Turnstile widget (managed mode, `@marsidev/react-turnstile` or the plain script), then `signInAnonymously({ options: { captchaToken } })` — no other UI for it; show a small "Checking your browser…" state. If `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is empty (local dev, CAPTCHA disabled in `config.toml`), skip the widget
- Home page: list of the user's notebooks (cards with title, source count, updated date) + the demo notebook pinned first with a "Demo" badge
- Create notebook (default title "Untitled notebook"), rename inline, delete with confirmation
- Server actions follow the Result pattern in `conventions/code.md` and the checklist in `conventions/security.md`; validated with Zod; limit of `5` notebooks per user (friendly error)
- Empty state, loading skeletons, toast on errors
- CI `e2e` job now needs the database: start the local Supabase stack in CI (`supabase/setup-cli` action, `supabase start`, `supabase db reset`) with `AI_PROVIDER=mock`
- Notebook page route `/n/[id]` as a placeholder showing the title (built out in T08)

## Out of scope
Sources, chat, anything AI.

## Acceptance criteria
- [ ] Fresh browser → notebooks page loads without any login step
- [ ] Created notebooks survive a reload; a second browser (incognito) does not see them
- [ ] 6th notebook is refused with a readable message
- [ ] **Production:** sign-in without a valid CAPTCHA token fails (human check)
- [ ] Calling a server action with another user's notebook id returns `not_found`
- [ ] **Production:** deployment live and the checks above pass there (human)

## E2E tests (Playwright, `e2e/`)
- First visit → notebooks page without a visible login step
- Create, rename, delete a notebook; the change survives a reload
- Isolation: a second browser context (another anonymous user) does not see the first one's notebooks
- The 6th notebook is refused with the readable message
- axe: no violations on the notebooks page

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```
Local: two browsers, check isolation. Production: see "Your part".

## Notes for the agent
- Anonymous users are `authenticated` role in RLS — policies from T02 apply unchanged.
- Don't call `signInAnonymously()` in middleware on every request; only when no session exists.
