# Decision Log

Short ADR-style log. Each entry: decision, why, what was rejected, consequence.
New decisions are appended; superseded ones are marked, not deleted.

---

## D-01 — Build the NotebookLM core first, extras by priority
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Ship sources → grounded chat with citations as a complete, deployed product before any extra. Extras in order: notebook guide, more source types, audio overview, saved notes.
**Why:** A tight time budget. Users test the core first; a polished core beats four half-built features.
**Rejected:** building features in parallel; starting with the audio overview because it is the most impressive.
**Consequence:** A cut line exists (see `scope.md` §3) and is respected.

## D-02 — One Next.js full-stack app, no Python backend
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Next.js App Router in TypeScript for UI and server logic, deployed to Vercel.
**Why:** The live demo must respond on the first click. Free Python hosting (Render) sleeps after 15 min idle and takes ~1 min to wake — a visitor's first impression would be a hanging request. One deploy target also removes a whole class of integration work from a small build.
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
**Rejected:** local Ollama for the deployment — demo users can't reach it. Paid APIs — budget.
**Consequence:** Free-tier content may be used by Google to improve its products → privacy notice in UI and README. Rate limits → retries with backoff, per-user limits, graceful error messages.

## D-05 — Anonymous sessions instead of accounts
**Date:** 2026-09-22 · **Status:** accepted

**Decision:** Supabase anonymous sign-in on first visit. Data persists per browser.
**Why:** Demo users should not hit a sign-up wall. RLS still gives each visitor an isolated workspace.
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
**Why:** The URL is public and users are anonymous, so per-user limits alone are bypassed by clearing cookies. The free Gemini quota is shared by everyone — one abuser could take the demo down for everyone.
**Rejected:** per-user limits only (bypassable); real accounts (sign-up wall for demo users).
**Consequence:** One more external service (Turnstile, free) and one more human setup step in T00. CSP must allow Turnstile. Managed mode keeps user friction near zero.

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
**Why:** The local stack removed the CAPTCHA obstacle. Automated tests turn six manual click-throughs into hand-offs, catch regressions while agents keep changing code, and document how the project is engineered.
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
**Why:** With a tight time budget, the core RAG pipeline (hybrid retrieval, grounded citations) is the main engineering deliverable, and a real evaluation plus security hardening are what make that deliverable credible. The audio overview is the most memorable demo moment but also the highest-risk build (preview TTS model, long generation) — building it before evaluation/hardening risked losing time on the riskiest feature and leaving the two most important quality checks exposed to the cut line.
**Rejected:** keeping the original order (audio overview at P3, evaluation/hardening scheduled after all extras) — too much schedule risk on the least certain part of the plan.
**Consequence:** `docs/scope.md` §3 and §6, and `tasks/README.md`'s board, cut line and recommended order, updated to match.

## D-16 — Shared demo password in front of anonymous auth
**Date:** 2026-09-26 · **Status:** proposed

**Decision:** A `/demo-login` route checks a single shared password (env var) and, on success, sets a short-lived (8h), signed, httpOnly cookie via HMAC-SHA256. `proxy.ts` requires this cookie on every route except `/demo-login` and static assets, redirecting elsewhere otherwise. This sits in front of, not instead of, D-05's anonymous Supabase auth — the password gate keeps the deployed app off the open internet while the demo is live; anonymous auth + RLS still isolate visitors from each other underneath.
**Why:** The public URL plus a free, shareable LLM quota is an easy target for scraping/abuse once discovered, beyond what D-09's CAPTCHA + rate limits + global cap alone bound. A password known only to demo users removes that exposure without adding accounts or friction for the people who are supposed to use it.
**Rejected:** relying solely on D-09's layered abuse protection (CAPTCHA + per-user limits + global cap) — those bound cost but don't prevent a stranger from reaching and using the app at all; Vercel/host-level access control — not available on the free tier used here.
**Consequence:** One new task (T02b) ahead of T03; two new env vars (`DEMO_PASSWORD`, `DEMO_COOKIE_SECRET`); the README (T15) must state that demo users need the password, shared out of band.

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

**Decision:** Entering the demo password writes a `demo_entitlements` row for the caller's session (`user_id` PK → `auth.users`, `expires_at` = now + `DEMO_SESSION_DURATION_MS`, 8 h) through the service-role client, *in addition to* setting the existing HMAC cookie. Nine RLS policies then require `public.is_demo_entitled()`: the seven `*_select_demo` policies (`notebooks`, `sources`, `chunks`, `notebook_guides`, `audio_overviews`, the `sources` and `audio` bucket objects) plus `notebooks_insert_owner` and the demo branch of `messages_insert_owner`. The function is `stable` + `security definer` with `set search_path = ''`; the table has RLS on, no policies, and grants only to `service_role`, so no client can grant itself one (`20260929114828_demo_entitlement.sql`).
**Why:** `proxy.ts` gates the Next app, but PostgREST is a different origin and never passes through it — exactly D-17's reasoning. The root layout mounts `AuthGate` on `/demo-login`, so a visitor holds an anonymous session *before* typing the password; with the old policies that session alone could read every demo row and insert a notebook, i.e. a stranger who never had the password could use the app through the API and spend the free quota. The password now buys something the database can check.
**Rejected:** an app-only check (the finding's premise: it is bypassable by construction, since the client can call PostgREST directly); gating all ~30 policies (unneeded — `notebooks_insert_owner` is the choke point for the entire write side, because every other insert `with check` requires the parent notebook to be owned and not demo, and `chunks`/`usage_events`/`audio_overviews` have no client insert at all); gating only the storage policies (would leave demo reads and notebook creation open); a `security definer` *grant* function callable by `authenticated` (self-service — the hole restated as a feature).
**Consequence:** A ninth layer to keep in sync: a new demo-select policy must remember `is_demo_entitled()`, and `app_settings_select_all` is deliberately *not* gated (the demo policies read `demo_owner_id` through a subquery that runs as the caller, so gating it would fail closed for everyone; the row holds only the demo owner's uuid). The entitlement is per **session**, not per cookie, so a visitor who keeps the 8 h cookie but loses the Supabase session (AuthGate mints a new anonymous user) passes the route gate and fails the data gate — the app renders empty until the password is entered again. Recovery is re-entering the password; requiring it deliberately is the point, so `proxy.ts` checks no further. Login now needs a session before it can be submitted, which the form enforces by disabling submit until `AuthGate` reports one (`components/demo-login-form.tsx`), with `?error=no_session` as the fallback. The migration and the app code deploy **together**: the migration alone leaves nobody entitlable (the app renders empty), the code alone makes the login insert fail.

## D-22 — Dependency updates enter through `dev`; security updates are the one exception
**Date:** 2026-09-30 · **Status:** proposed

**Decision:** Dependabot version-update PRs target `dev` (`target-branch: 'dev'` on both entries in `.github/dependabot.yml`). Security-update PRs are left to target the default branch, `main`; whenever one merges there, `main` is merged back into `dev` in the same sitting, through a PR on `dev`. A genuinely exploited advisory skips Dependabot entirely: `hotfix/<package>-<version>` off `main`, one bump, PR to `main`, then the same back-merge.
**Why:** `target-branch` is a version-updates-only option — GitHub's Dependabot options reference says a configured `target-branch` means the ecosystem's settings "no longer apply to security updates because security updates always use the default branch for the repository" — so "security updates target `dev` first" is not expressible in configuration. The real choice is "land on `main` and back-merge" versus "retarget every security PR by hand". Landing on `main` is right because `main` is the deployed revision (a PR to it is one merge from production, where the `dev` route costs a release PR and a wait for the release cadence), and because Dependabot pins the *minimum version that clears the advisory* — small and targeted, the case where integration soak has least value. The exception reorders the gate rather than bypassing it: both baselines run the same six ruleset checks. The back-merge is what keeps the exception honest, since `main` ahead of `dev` is the only state that actually breaks the invariant above, and if it survives to the next release the same manifest line has changed on both sides — a conflict, or a release that re-pins the vulnerable version.
**Rejected:** changing the repository's default branch to `dev` (the only way to move security updates, but `main` has to stay the deployed default); retargeting each security PR to `dev` (`gh api -X PATCH … -F base=dev`) as the standard move — it was computed against `main`'s manifest, so when `dev` is already past the advisory's fixed version, merging it into `dev` conflicts or *downgrades*, and the right action then is closing the PR as already resolved; either way, it puts hand-work on the PR class least suited to it; letting security PRs rest on `main` without the back-merge; cherry-picking the bump into `dev` instead of merging `main`, which leaves two distinct commits for one change, so the next `dev`→`main` sees the same content changed on both sides — a conflict rather than a no-op.
**Consequence:** The `dev`→`main` invariant in `AGENTS.md` now carries a documented exception, and the exception comes with a follow-up step rather than being self-enforcing: nothing detects a `main` that has drifted ahead, because a release merge also puts a commit on `main` (a commit-graph check would false-positive) and the lockfile differs between the two branches by design between releases. Alerts are unaffected by the version-update change — GitHub's wording is that "Dependabot scans your repository's default branch and sends alerts when" a manifest or advisory changes — so a security PR is closed by the merge to `main`, never by work on `dev`. `automated-security-fixes` is currently enabled with no open alerts, so this is prospective.

## D-23 — A merged branch deletes its own preview; production and `dev` are never touched
**Date:** 2026-09-30 · **Status:** proposed

**Decision:** The Vercel Git integration stays off for this project: the `deploy-preview` job in `.github/workflows/ci.yml` is the only thing that creates a preview, and only for in-repo, non-Dependabot pull requests whose head is not `dev` or `main` (those are deployed by their own push jobs, so a dev → main release PR does not build a second copy). `.github/workflows/preview-cleanup.yml` deletes a branch's previews once its PR is merged — it takes the branch from the event, asks the API for that branch's deployments (`-m githubCommitRef=<branch>`, which the CLI sends as a `meta-<key>` filter), drops everything whose `target` is `production` and, on a merge, everything created after the PR's `merged_at` (the selector is a branch name, so a delayed or repeated run must not take the previews of a later PR that reused it), and calls `vercel remove <ids> --yes --safe`. Three exclusions are absolute and independent: the ref may not be `main` or `dev`, `target` may not be `production`, and `--safe` skips any deployment that currently holds an alias. A manual `workflow_dispatch` run does the same thing for one named branch and is a dry run unless told otherwise.
**Why:** Roughly 200 preview deployments had accumulated, and the shape of the list showed why: the Git integration was still live. The proof is that GitHub deployment records exist authored by `dependabot[bot]`, and `deploy-preview` cannot have created those — it is gated on the PR author precisely because a Dependabot run gets no secrets. So previews came from two sources at once, and neither owned their end of life. The rule the repository actually wants is the one a deployment can be attributed to: the branch it was built from. Deleting on merge, keyed on that branch, ties the deletion to the same event that ends the branch's reason to exist, and needs no scheduled sweep, no expiry heuristics and no per-deployment bookkeeping. `--safe` is what makes it safe to run unattended: the API itself answers whether a deployment currently backs an alias, which covers production and the `dev` alias without this workflow having to know either name.
**Rejected:** Running `vercel remove <project> --yes --safe` on a schedule, without a ref filter. It reads well and would keep the list small, but it cannot tell an abandoned branch from a pull request under review, so an open PR's preview disappears while its author is still looking at it. Making the cleanup a job inside `ci.yml`: that workflow's `pull_request` trigger carries no `types:`, so adding `closed` would re-run build, test, db-test and e2e on every merge to delete one deployment. A TypeScript script under `scripts/` with the selection extracted into a unit-tested pure function — the usual shape here (`conventions/principles.md`, "pure core, thin I/O shell"). The knowledge being tested would be one jq predicate and one CLI flag; the script would have to re-implement the API call the CLI already makes, so the test would cover the shell, not the logic. Keeping the Git integration and sweeping up after it: two producers, one of which creates deployments no PR can be attributed to.
**Consequence:** The literal rule "keep anything built from `dev` or `main`" holds for the *current* deployments of those branches, not for their history: a superseded dev or main build holds no alias, so the sweep deletes it. The one-off cleanup and the automated sweep therefore have exactly the same semantics, which is deliberate — one rule, not two. A PR closed without merging leaves its preview behind, since no merge means no run; `workflow_dispatch` with its branch name is the manual path, and the same applies to a branch deleted by hand. Fork PRs get no preview at all, which was already true and now means that source is simply gone. `vercel remove` exits 1 when every matched deployment is filtered out as aliased — a merge whose only preview is aliased therefore shows a red job with an explanatory message rather than a green no-op. And the workflow's one unverified assumption is the meta key `githubCommitRef`: if it is not the key Vercel records for a CLI deployment, the job deletes nothing and reports that, printing the newest five deployments and their actual refs.

## D-24 — Per-person demo access codes replace the shared password
**Date:** 2026-10-01 · **Status:** proposed (supersedes the shared password of D-16; builds on D-21)

**Decision:** The demo password is replaced by one access code per demo user (`AMD-` + 128 random bits, shown once, stored only as an HMAC hash keyed by `DEMO_CODE_PEPPER`). `claim_demo_session(code_hash, user_id, ttl_seconds)` (service-role only) locks the code row, refuses unknown, revoked or expired codes and a session beyond `max_sessions` (default 3), and writes the `demo_entitlements` row with its `code_id`. `is_demo_entitled()` also requires the code to be unrevoked and unexpired, so revoking a code ends access at the database immediately. The cookie is unchanged (route gate only). Codes are issued, listed and revoked with `scripts/demo-codes.ts` by the human. `DEMO_PASSWORD` is removed with no fallback.
**Why:** A shared password is effectively public once sent, cannot be withdrawn from one person, and rotating it locks everyone out. Per-person codes make a leak attributable and revocable, and the seat cap bounds sharing.
**Rejected:** keeping the password beside codes (a permanent bypass); an admin web UI (a new privileged surface for a handful of demo users); single-use OTPs (demo users return over several days); putting `code_id` in the cookie (the cookie is not an authorization layer, D-21).
**Consequence:** One migration that clears existing entitlements, one new secret (`DEMO_CODE_PEPPER`; rotating it invalidates every code), and a seat frees only when its 8 h entitlement expires. The in-process login limiter stays a stopgap, but guessing 128-bit codes is infeasible.

## D-25 — CodeQL gates merges; a ZAP baseline scan is considered and not added
**Date:** 2026-10-03 · **Status:** proposed (builds on D-21 and D-24)

**Decision:** **CodeQL** joins CI as its own workflow (`.github/workflows/codeql.yml`, advanced setup, `javascript-typescript`, `build-mode: none`, SHA-pinned actions) on PRs and pushes to `dev`/`main` and weekly. Its job id `codeql` is meant to join the ruleset's required checks beside `semgrep`, so it gates merges. A `dev` → `main` PR skips it, bound to this repository's own `dev` (a fork can name its branch `dev`, and a skipped job satisfies a required check); the same binding now guards the four `ci.yml` jobs that carried the bare `github.head_ref != 'dev'`.
**Why:** Semgrep pattern-matches; CodeQL's dataflow analysis finds a different class of issue (tainted input reaching a sink across files), at no cost on a public repository.
**Rejected:** CodeQL default setup (one click, but no pinned actions, no control over triggers or build mode, and not reviewable in the repo); autobuild (JavaScript/TypeScript needs no build for extraction, so it only adds a pnpm install to drift). **A ZAP baseline scan of the preview** was built and dropped before merging: a baseline scan is passive, and the only page reachable without an access code is `/demo-login` (D-21, D-24), so it could see headers and cookie flags on one page and nothing behind the gate. Its first findings would be the missing security headers T14 already owns, and its cookie checks see nothing because the anonymous session cookie is set client-side by JavaScript it does not run. Revisit when T14 has set the headers (a `curl` assertion on them is cheaper and deterministic) or if a scanner-held access code makes an authenticated scan worth its credential.
**Consequence:** Adding `codeql` to the required checks is a ruleset change, which agents do not make (`AGENTS.md`); it is the human's step, and until then CodeQL reports without gating. Open to check on the first runs: that CodeQL can upload results on Dependabot PRs, which run with a read-only token.
