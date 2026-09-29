# Decision Log

Short ADR-style log. Each entry: decision, why, what was rejected, consequence.
New decisions are appended; superseded ones are marked, not deleted.

---

## D-01 — Build the NotebookLM core first, extras by priority
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Ship sources → grounded chat with citations as a complete, deployed product before any extra. Extras in order: notebook guide, more source types, audio overview, saved notes.
**Why:** One week. Reviewers will test the core live; a polished core beats four half-built features.
**Rejected:** building features in parallel; starting with the audio overview because it is the most impressive.
**Consequence:** A cut line exists (see `scope.md` §3) and is respected.

## D-02 — One Next.js full-stack app, no Python backend
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Next.js App Router in TypeScript for UI and server logic, deployed to Vercel.
**Why:** The live demo must respond on the first click. Free Python hosting (Render) sleeps after 15 min idle and takes ~1 min to wake — a reviewer's first impression would be a hanging request. One deploy target also removes a whole class of integration work from a one-week build.
**Rejected:** Next.js + FastAPI (the original portfolio plan) — cold starts, two deployments, ~3-4 extra hours. Python only — same cold starts, weaker UI.
**Consequence:** Long-running work (ingest, audio) must fit Vercel function limits → `maxDuration = 300`, size caps, direct-to-storage uploads.

## D-03 — Supabase for database, vectors, storage and auth
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Supabase Postgres + pgvector, Storage, anonymous auth, RLS.
**Why:** One free service covers four needs. Postgres keeps vectors next to relational data, so hybrid search and access control are one SQL query. RLS enforces isolation between anonymous users in the database, not only in app code.
**Rejected:** dedicated vector DB (Pinecone/Qdrant) — another service, no benefit at this scale. SQLite — no free persistent hosting on Vercel.
**Consequence:** Free-tier limits (500 MB DB, 1 GB storage, pause after 7 idle days) → upload caps; keep the project active during review.

## D-04 — Gemini free tier as hosted provider, behind a pluggable layer
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Gemini API free tier for chat, embeddings and TTS, accessed through the Vercel AI SDK. Provider and model IDs come from env vars; Ollama works for local development.
**Why:** €0 budget. One provider covers all three capabilities, including two-speaker TTS for the audio overview. Model IDs change often — keeping them in config avoids code changes.
**Rejected:** local Ollama for the deployment — reviewers can't reach it. Paid APIs — budget.
**Consequence:** Free-tier content may be used by Google to improve its products → privacy notice in UI and README. Rate limits → retries with backoff, per-user limits, graceful error messages.

## D-05 — Anonymous sessions instead of accounts
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Supabase anonymous sign-in on first visit. Data persists per browser.
**Why:** Reviewers should not hit a sign-up wall. RLS still gives each visitor an isolated workspace.
**Rejected:** email/OAuth (friction); no auth at all (no isolation, no rate limiting per user).
**Consequence:** Clearing cookies loses notebooks — acceptable for a demo, stated in README.

## D-06 — Hybrid retrieval (vector + full-text, RRF) from the start
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Combine pgvector cosine search and Postgres full-text search with Reciprocal Rank Fusion in one SQL function.
**Why:** Users ask about exact names, numbers and terms; embeddings alone miss those. It is ~30 lines of SQL, not a new service.
**Rejected:** vector-only (misses exact matches); adding a re-ranker model (extra latency and quota).
**Consequence:** The evaluation compares hybrid vs vector-only to show whether it actually helps.

## D-07 — Citations as numbered context blocks, validated after generation
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Number the retrieved chunks `[1]..[k]` in the prompt, require `[n]` markers in the answer, and map/validate them server-side after streaming.
**Why:** Simple, works with streaming, and every citation can be checked against a real chunk. Invalid markers are dropped, never shown.
**Rejected:** structured-output answers with citation objects — breaks token streaming and feels slow.
**Consequence:** Citation correctness is measurable in the evaluation.

## D-08 — Agent-driven implementation with task files
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Implementation happens through coding agents working one task file at a time (`tasks/`), guided by `AGENTS.md`. Every task has acceptance criteria and verification commands; a human reviews each result before the next task starts.
**Why:** The application explicitly asks for AI-tool usage and wants to see the approach. Written tasks make the process visible and keep agent output reviewable in small pieces.
**Consequence:** `docs/ai-workflow.md` records how it went, including where the agent was corrected.

## D-09 — Layered abuse protection: CAPTCHA, per-user limits, global cap
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Cloudflare Turnstile on anonymous sign-in (managed/invisible mode, via Supabase Auth's CAPTCHA support), per-user rate limits, and a global daily cap on model calls.
**Why:** The URL is public and users are anonymous, so per-user limits alone are bypassed by clearing cookies. The free Gemini quota is shared by everyone — one abuser could take the demo down during the review window.
**Rejected:** per-user limits only (bypassable); real accounts (sign-up wall for reviewers).
**Consequence:** One more external service (Turnstile, free) and one more human setup step in T00. CSP must allow Turnstile. Managed mode keeps reviewer friction near zero.

## D-10 — Conventions as a directory, core rules always loaded
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Coding rules live in `conventions/` (principles, security, code, database, ai). `CLAUDE.md` always loads principles and security; area files are read on demand.
**Why:** Keeps every agent session's context small while making security and core principles impossible to skip. Priority on conflict: security > correctness > simplicity > DRY.

## D-11 — Local Supabase in Docker; production is human-only
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Development runs against a local Supabase stack (Docker, Supabase CLI). Agents may reset, migrate, seed and test it freely, and may run scripts that call Gemini. The hosted project is production: only the human pushes migrations and seeds it.
**Why:** Without a local stack, dev and production share one database and every agent migration changes production. Locally, RLS gets automated pgTAP tests and CAPTCHA can be off, so tests and scripts can sign in.
**Rejected:** developing against the hosted project (agents changing production); a second hosted project for dev (free tier allows two, but no automated tests and more setup).
**Consequence:** Docker Desktop is a prerequisite (T00). A release checklist in `tasks/README.md` replaces ad-hoc deploys.

## D-12 — Task modes: who does what
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Every task has a mode: `human`, `hand-off`, `agent+check`, or `shared`, plus an estimate of the human's time. UI behaviour is checked by the human in the browser, not by automated browser tests.
**Why:** Makes the human workload visible (~7.25h of ~23h) and keeps judgement calls — demo content, citation quality, voices, eval questions, production releases — with the human.
**Rejected:** ~~Playwright tests per task~~ — superseded by D-13.

## D-13 — Playwright E2E tests per UI task, with a mock AI provider
**Date:** 2026-09-22 · **Status:** accepted (supersedes the "rejected" line in D-12)

**Decision:** Every UI task adds Playwright tests (plus axe accessibility checks) for its predictable behaviour. They run against the local stack with `AI_PROVIDER=mock`, locally and in CI. Humans keep the judgement calls: real answer quality, voices, demo content, production.
**Why:** The local stack removed the CAPTCHA obstacle. Automated tests turn six manual click-throughs into hand-offs, catch regressions while agents keep changing code, and are part of the engineering story for reviewers.
**Rejected:** Cypress — Playwright is the Next.js-documented option, supports multiple browsers and free parallelism, and handles iframes (Turnstile) better. A single smoke suite — too little coverage to hand tasks off.
**Consequence:** ~2.5h more agent time (total ~25h vs ~20h budget) → the cut line matters more. A mock provider must exist and must never be active in production.

## D-14 — Polling with progress stages for status; streaming only for in-request output
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Long-running work (ingest, audio) writes a `progress` stage to its row; the UI polls every 2s while something runs. HTTP streaming (AI SDK) is used only when the output is produced inside the same request — the chat answer. Rules live in `conventions/code.md`, *Streaming and real-time*.
**Why:** Vercel invocations are isolated. An SSE endpoint couldn't receive events from the ingest function and would end up polling the database itself while holding a connection open. The database is the single source of truth; polling it is simple, survives reloads and extra tabs, and progress stages give detailed feedback anyway.
**Rejected:** SSE status endpoints (server-side polling in disguise); Supabase Realtime (true push, but extra setup and a second place where access rules must hold — revisit if the 2s delay ever matters); streaming progress from the ingest request itself (still needs polling for reloads, so both would be built).

## D-15 — Move evaluation and hardening ahead of the remaining extras; audio overview becomes a stretch goal
**Date:** 2026-09-25 · **Status:** proposed

**Decision:** Evaluation (T13) and hardening (T14) are now explicit, never-cut parts of the MVP rather than tasks scheduled after all extras. Saved notes moves ahead of the audio overview in priority (P3), and the audio overview moves from P3 to a stretch goal, attempted only once P0, evaluation and hardening are done.
**Why:** With a one-week budget, the core RAG pipeline (hybrid retrieval, grounded citations) is the main engineering deliverable, and a real evaluation plus security hardening are what make that deliverable credible. The audio overview is the most memorable demo moment but also the highest-risk build (preview TTS model, long generation) — building it before evaluation/hardening risked losing time on the riskiest feature and leaving the two most important quality checks exposed to the cut line.
**Rejected:** keeping the original order (audio overview at P3, evaluation/hardening scheduled after all extras) — too much schedule risk on the least certain part of the plan.
**Consequence:** `docs/scope.md` §3 and §6, and `tasks/README.md`'s board, cut line and recommended order, updated to match.

## D-16 — Shared demo password in front of anonymous auth
**Date:** 2026-09-26 · **Status:** proposed

**Decision:** A `/demo-login` route checks a single shared password (env var) and, on success, sets a short-lived (8h), signed, httpOnly cookie via HMAC-SHA256. `proxy.ts` requires this cookie on every route except `/demo-login` and static assets, redirecting elsewhere otherwise. This sits in front of, not instead of, D-05's anonymous Supabase auth — the password gate keeps the deployed app off the open internet during the review window; anonymous auth + RLS still isolate visitors from each other underneath.
**Why:** The public URL plus a free, shareable LLM quota is an easy target for scraping/abuse once discovered, beyond what D-09's CAPTCHA + rate limits + global cap alone bound. A password known only to reviewers removes that exposure without adding accounts or friction for the people who are supposed to use it.
**Rejected:** relying solely on D-09's layered abuse protection (CAPTCHA + per-user limits + global cap) — those bound cost but don't prevent a stranger from reaching and using the app at all; Vercel/host-level access control — not available on the free tier used here.
**Consequence:** One new task (T02b) ahead of T03; two new env vars (`DEMO_PASSWORD`, `DEMO_COOKIE_SECRET`); the README (T15) must state that reviewers need the password, shared out of band.

## D-17 — Notebook limit enforced by a database trigger
**Date:** 2026-09-27 · **Status:** proposed

**Decision:** The 5-notebook-per-user limit is enforced by a `before insert` trigger on `notebooks` (`20260927140000_notebook_limit.sql`) that takes a per-user transaction advisory lock, counts, and raises `check_violation` at the cap. `createNotebook` still counts first for a quick, friendly error and maps the trigger's error to `limit_reached`.
**Why:** RLS (`notebooks_insert_owner`) lets any signed-in user insert through the API directly, bypassing the server action — an app-only check would let one visitor create unlimited notebooks and fill the free-tier database. The advisory lock also closes the race where two parallel creates both pass the count.
**Rejected:** app-only count-then-insert (bypassable, racy); a check constraint (can't count other rows); `SELECT … FOR UPDATE` (nothing to lock before the first notebook exists).
**Consequence:** The limit lives in two places — `MAX_NOTEBOOKS_PER_USER` in `lib/config.ts` and the trigger — with comments pointing at each other. Covered by `supabase/tests/notebook_limit.test.sql`.

## D-18 — Notebook workspace: two columns plus drawers, Studio is not a column
**Date:** 2026-09-29 · **Status:** proposed

**Decision:** The notebook page is two columns at ≥1024px (`sources | chat`) and `Tabs` below that. A citation opens a left-anchored modal drawer showing the quoted passage; Studio opens a sheet from the header. There is no permanent third column.
**Why:** At 1280px a permanent third column squeezes the chat — the actual product — to roughly 520px while holding three placeholder cards until T09/T11/T12 land. A drawer gives Studio and the citation the width they need when open and costs nothing when closed, so the extras can arrive later without a layout rework. Both narrow-width `TabsPanel`s are kept mounted, so switching tabs mid-answer does not unmount `useChat` and lose a streaming answer.
**Rejected:** copying NotebookLM's permanent third column (three empty cards for most of the build, chat squeezed); a `/n/[id]/studio` route (a page navigation for a panel, and the notebook's state would live in two places); a right-hand drawer for both (a citation would cover the answer it cites).
**Consequence:** `components/workspace/` owns the layout, the source selection and both drawers; `components/ui/sheet.tsx` is a side-anchored dialog built on the already-installed `@base-ui/react`, not on a shadcn registry entry that would pull in a second primitive family. T09/T11/T12 fill the Studio cards' bodies without touching the shell.

## D-19 — Dark mode via the already-installed next-themes, following the system
**Date:** 2026-09-29 · **Status:** proposed

**Decision:** Dark mode uses `next-themes` with `attribute="class"`, `defaultTheme="system"` and `enableSystem`, mounted once in `app/layout.tsx`. One shared `ThemeToggle` sits in each page's existing header row; `/demo-login` has none.
**Why:** `next-themes@0.4.6` was already a direct dependency and `components/ui/sonner.tsx` already called `useTheme()` — with no provider mounted, so that call returned `undefined` and the toaster could never follow the theme. Mounting the provider wires up the feature and fixes that latent bug in one change, with nothing new to install. The `.dark` palette already existed in `globals.css`, so the work was a toggle and an audit across both themes, not a second design.
**Rejected:** a hand-rolled class toggle plus pre-hydration script (re-implements the library, and gets the flash wrong); `prefers-color-scheme` alone with no toggle (no user choice); defaulting to a fixed light or dark (wrong for somebody on first paint either way).
**Consequence:** Both themes are part of the axe and visual checks from here on, and `sonner.tsx`'s theme now tracks the toggle. `color-scheme` is declared per theme in `globals.css` so native controls (scrollbars, the composer) match.

## D-20 — Retention via `last_seen_at` and a daily Vercel Cron
**Date:** 2026-09-28 · **Status:** proposed

**Decision:** Activity is tracked in `user_activity.last_seen_at`, touched at most once a day from `proxy.ts` (cookie-throttled `touch_last_seen` rpc). A daily Vercel Cron calls `/api/cron/retention` (bearer `CRON_SECRET`), which deletes anonymous users inactive for 30 days in batches of 100: storage objects first, then the auth user; rows cascade. A failed storage cleanup skips the user until the next run.
**Why:** `auth.sessions` / `last_sign_in_at` don't reflect visits with a refreshed session; one own column is explicit and testable.
**Rejected:** pg_cron (can't delete Storage objects); deleting the user first (orphaned files).
**Consequence:** Needs `CRON_SECRET` in Vercel Production; cron only runs in production.
**Amendment (2026-09-29, review):** Each user is *claimed* before anything of theirs is touched, and candidates are ordered never-attempted first. `retention_state(user_id, attempted_at)` records the claim; `claim_retention_user()` settles eligibility and the claim in one statement, so a visit between selection and deletion saves the user, and two overlapping runs cannot work on the same user (a claim is refreshable only after `RETENTION_RETRY_AFTER`, 20 h — under the daily interval so a failed user is retried next run, far over `maxDuration` so a retry cannot pick up a user mid-deletion). The order puts `attempted_at nulls first`, then oldest activity: without it the same 100 oldest users were returned every run and a user whose cleanup always fails starved the queue permanently while the run looked healthy. `retention_state` is separate from `user_activity` because that row *is* the claim "this user has been seen" and its `last_seen_at` is `not null` — recording an attempt there would either need a nullability change or write a fake timestamp that made an idle user look active, i.e. never deletable.

## D-21 — The demo gate is enforced in the database, per session
**Date:** 2026-09-29 · **Status:** proposed

**Decision:** Entering the demo password writes a `demo_entitlements` row for the caller's session (`user_id` PK → `auth.users`, `expires_at` = now + `DEMO_SESSION_DURATION_MS`, 8 h) through the service-role client, *in addition to* setting the existing HMAC cookie. Nine RLS policies then require `public.is_demo_entitled()`: the eight `*_select_demo` policies (`notebooks`, `sources`, `chunks`, `notebook_guides`, `audio_overviews`, the `sources` and `audio` bucket objects) plus `notebooks_insert_owner` and the demo branch of `messages_insert_owner`. The function is `stable` + `security definer` with `set search_path = ''`; the table has RLS on, no policies, and grants only to `service_role`, so no client can grant itself one (`20260929114828_demo_entitlement.sql`).
**Why:** `proxy.ts` gates the Next app, but PostgREST is a different origin and never passes through it — exactly D-17's reasoning. The root layout mounts `AuthGate` on `/demo-login`, so a visitor holds an anonymous session *before* typing the password; with the old policies that session alone could read every demo row and insert a notebook, i.e. a stranger who never had the password could use the app through the API and spend the free quota. The password now buys something the database can check.
**Rejected:** an app-only check (the finding's premise: it is bypassable by construction, since the client can call PostgREST directly); gating all ~30 policies (unneeded — `notebooks_insert_owner` is the choke point for the entire write side, because every other insert `with check` requires the parent notebook to be owned and not demo, and `chunks`/`usage_events`/`audio_overviews` have no client insert at all); gating only the storage policies (would leave demo reads and notebook creation open); a `security definer` *grant* function callable by `authenticated` (self-service — the hole restated as a feature).
**Consequence:** A ninth layer to keep in sync: a new demo-select policy must remember `is_demo_entitled()`, and `app_settings_select_all` is deliberately *not* gated (the demo policies read `demo_owner_id` through a subquery that runs as the caller, so gating it would fail closed for everyone; the row holds only the demo owner's uuid). The entitlement is per **session**, not per cookie, so a visitor who keeps the 8 h cookie but loses the Supabase session (AuthGate mints a new anonymous user) passes the route gate and fails the data gate — the app renders empty until the password is entered again. Recovery is re-entering the password; requiring it deliberately is the point, so `proxy.ts` checks no further. Login now needs a session before it can be submitted, which the form enforces by disabling submit until `AuthGate` reports one (`components/demo-login-form.tsx`), with `?error=no_session` as the fallback. The migration and the app code deploy **together**: the migration alone leaves nobody entitlable (the app renders empty), the code alone makes the login insert fail.
