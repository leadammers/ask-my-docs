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
