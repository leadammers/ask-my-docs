# T08b — Data retention for inactive anonymous users

**Mode:** shared · **Priority:** P0 · **Depends on:** T05 · **Estimate:** 1.5h · **Your time:** 15 min

## Goal
Data of anonymous users who stop coming back is deleted automatically after a fixed retention period — database rows **and** storage objects — and every visitor is told about it: a banner on their first visit and a short, permanent line in the footer.

## Your part
- Generate `CRON_SECRET` and set it in Vercel (Production). Vercel sends it to the cron route automatically.
- After the first production run: check Vercel's cron log and the Storage buckets — no objects left under deleted users' folders, demo notebook untouched.

## Context
- `conventions/security.md` §5 (storage objects are deleted together with their rows), §10 (service-role key), §12 ("collect nothing that isn't needed")
- `docs/scope.md` §2: users must be able to "return later in the same browser" — so this is a retention period, not deletion at session end
- `docs/architecture.md` §3: every table has `user_id … references auth.users on delete cascade`; storage paths are `{userId}/{sourceId}.{ext}`

## Scope
- **Single source of truth:** `RETENTION_DAYS` in `lib/config.ts`, used by the cleanup, the banner and the README.
- **Selection (pure core):** `lib/retention.ts` — given users with their last-activity timestamp, `now` and `RETENTION_DAYS`, return the ids due for deletion; never the demo owner (`app_settings.demo_owner_id`), never non-anonymous users. Unit tested (boundary day, demo owner, empty input).
- **Last activity (`last_seen_at`):** new table `user_activity (user_id uuid primary key references auth.users on delete cascade, last_seen_at timestamptz not null default now())`, RLS enabled.
  - Written only through a SQL function `touch_last_seen()` (`security definer`, `set search_path = ''`) that upserts `now()` for `auth.uid()` and skips the write if the stored value is less than a day old. `grant execute` to `authenticated` only; **no** table grants to `authenticated` or `anon`, so users can't set their own timestamp. `service_role` gets `select`.
  - Called from `proxy.ts` right after the session refresh, at most once per day per browser: a small httpOnly cookie (e.g. `last_seen_touch`, `maxAge` 1 day) marks that the touch already happened. No extra database call on other requests; a failed touch never blocks the request.
  - The cleanup reads users through a second SQL function (`security definer`, `set search_path = ''`, `grant execute` to `service_role` only, revoked from `public`, `anon`, `authenticated`) that returns anonymous users with `coalesce(last_seen_at, auth.users.created_at)`. Don't read `auth.sessions` — Supabase-internal, may change.
- **Deletion order per user:** remove all objects under `{userId}/` in the `sources` and `audio` buckets via the Storage API, **then** `auth.admin.deleteUser(id)`; the FK cascade removes the rows. If listing or removing objects fails for either bucket, **skip** `deleteUser` for that user and count it as failed — it stays eligible and the next run retries, so rows are never deleted while their files remain. Never delete rows from `storage.objects` with SQL. Cap each run (e.g. 100 users) so it finishes within the function timeout; the next run continues.
- **Trigger:** Vercel Cron, once a day (Hobby allows daily) → `app/api/cron/retention/route.ts`. Rejects any request without `Authorization: Bearer ${CRON_SECRET}` (constant-time compare). Add the path to `proxy.ts`'s gate exemptions — it is protected by `CRON_SECRET`, not the demo cookie. `CRON_SECRET` in `lib/env.ts` and `.env.example`.
- **Logging:** structured JSON with counts only (users deleted, objects removed, duration) — no user ids in logs.
- **Banner (first visit):** a notice at the top of the app pages (not `/demo-login`) until the visitor dismisses it: anonymous session tied to this browser, data deleted after `RETENTION_DAYS` days without a visit, don't upload confidential documents (free-tier Gemini notice from `conventions/security.md` §12). Dismissal remembered in `localStorage` (wrapped in try/catch — without storage the banner simply shows again, nothing breaks).
- **Footer (always):** one short sentence on every app page so the information never disappears after dismissal, e.g. "Anonymous demo — your data is deleted after 30 days without a visit; please don't upload confidential documents." Banner and footer read `RETENTION_DAYS` and keep their wording in one module, not duplicated with T08's upload-dialog notice.
- **Docs:** `user_activity` in `docs/architecture.md` §3; retention period in the README's limitations/privacy section; one line in `conventions/security.md` §12; append a `proposed` decision to `docs/decisions.md` (next free number).

## Out of scope
- Deleting individual stale notebooks of active users
- A "delete my data now" button (users can already delete notebooks)
- pg_cron / Supabase Edge Functions — Vercel Cron keeps everything in one deployable

## Acceptance criteria
- [ ] A user inactive for more than `RETENTION_DAYS` loses their auth user, all rows and all storage objects; an active user and the demo owner keep everything; a user whose storage cleanup fails keeps their auth user and rows (integration test against the local stack, with backdated timestamps)
- [ ] The cron route returns 401 without the correct bearer token and is reachable without the demo cookie
- [ ] The cleanup's SQL function is not executable by `anon` or `authenticated`; `touch_last_seen()` is executable by `authenticated` only; `authenticated` and `anon` have no privileges on `user_activity` (pgTAP)
- [ ] Visiting the app sets `last_seen_at`; a second visit within a day does not write again (integration test)
- [ ] The banner is visible on first visit, shows the retention period from `RETENTION_DAYS`, stays dismissed after a reload; the footer sentence is visible on every app page, also after dismissal; no axe violations (Playwright)
- [ ] First production run completes; no orphaned objects in Storage; demo notebook intact (human)

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm db:reset && pnpm db:test && pnpm test:e2e
```

## Notes for the agent
- Vercel Cron only runs on **production** deployments, defined under `crons` in `vercel.json`. Test the route locally by calling it with the bearer token.
- The service-role client (`lib/supabase/admin.ts`) is fine here: the ids come from the database query, never from request input.
- Follow the explicit-grants rule for the new SQL function (hosted Supabase does not grant defaults).
