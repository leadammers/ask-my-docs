# T08c — Demo notebook seeding

**Mode:** shared · **Priority:** P0 · **Depends on:** T05, T07 · **Estimate:** 0.75h · **Your time:** 20 min

## Goal
A reviewer who opens the live URL finds a notebook that is already ingested and answers questions with citations — no upload, no waiting, no empty state. **T09 (guide), T11 (audio) and T13 (evaluation) all run against this notebook**, so the seed script is infrastructure, not a demo flourish.

## Your part
- Put the two documents you already have into `supabase/seed/` and confirm their licences allow **public** redistribution: the demo notebook is public and the repo is public. If one of them is a private, internal or copyrighted document, say so before the agent seeds it — the fallback is a different document, not a quieter upload.
- Run the script once against production with production env values (see *Release to production* in `tasks/README.md`), then open the live URL in an incognito window and check that the demo notebook returns a cited answer.
- Check the Gemini usage after that run: two documents of embeddings are a one-off cost, but it is real quota.

## Context
- `docs/architecture.md` §3: demo rows are readable by everyone only when `is_demo = true` **and** the row belongs to `demo_owner_id`; writable by no one through the API. T02's policies already enforce this — this task must not need to weaken them.
- The demo read policies match on `user_id = demo_owner_id` (`supabase/migrations/20260925161242_schema_and_rls.sql:110-116`, plus the matching policy on `chunks`). Rows this script writes must carry that `user_id` explicitly — see *Sources* below.
- `conventions/security.md` §3: the service-role key is allowed in `scripts/`. This script is that case — every id it touches comes from the database or from the seed folder, never from request input.
- `scripts/search.ts:13-22` already resolves the demo notebook through `app_settings.demo_owner_id`. That lookup is the pattern to follow rather than inventing a second one.
- `docs/decisions.md` D-11: development is the local stack. The hosted project is touched only by the human step above.

## Scope
- **Seed documents:** `supabase/seed/` holds the PDFs plus a `README.md` that names, for each file, where it came from and under which licence it may be redistributed.
- **`scripts/seed-demo.ts`**, run with `pnpm script`, service role, idempotent:
  1. **Demo owner:** look up the fixed owner email (`auth.admin.listUsers`), create the user if it is missing, and write its id into `app_settings.demo_owner_id`. Never touch an owner that already exists.
  2. **Notebook:** ensure exactly one notebook with `is_demo = true` owned by the demo owner, with a fixed title. Look it up by owner before creating.
  3. **Sources:** for each document in `supabase/seed/`, ensure a `sources` row with **every required column given explicitly** — `id` (`crypto.randomUUID()`), `notebook_id` (the demo notebook), `user_id` (`demoOwnerId`), `kind: 'pdf'`, `title` from the file name, `storage_path` `{demoOwnerId}/{sourceId}.pdf`, `status: 'pending'` — and upload the object to the `sources` bucket if it is not already there. `kind` has no default and fails loudly, but `user_id` does not: its column default is `auth.uid()`, which is null under the service role (`lib/ingest/pipeline.ts:61`), and the demo read policies match on `user_id = demo_owner_id` — a row written without it would seed "successfully" and then show every reviewer an empty source list.
  4. **Ingest:** claim each source with the route's conditional update — `pending|failed`, plus a `processing` row whose claim is stale — then `runIngest(admin, source, extractor, { requestId, userId })` — the same four arguments the ingest route passes. Skip sources already `ready`; `--force` re-ingests everything. See *Notes* for why the stale clause is not optional.
  5. **Report:** one line per source (id, status, pages, chunks, seconds) and a summary. Counts only — no document content in the output, per `conventions/security.md` §12.
- **Extract the extractor:** the route's local `pdfExtractor` (`app/api/sources/[id]/ingest/route.ts:103-123` — storage-metadata size check, download, `%PDF-` handled inside `extractPdfPages`) moves into a shared module (`lib/ingest/stored-pdf.ts`) and both callers import it. Two copies of the size check would drift, and the one that drifts is the one that stops enforcing the cap.
- **Constants:** the owner email and the demo notebook title live in `lib/config.ts`, because T09 and T13 look the notebook up too.
- **No chat messages are seeded.** An empty chat plus T09's suggested questions is the intended first screen; a staged conversation reads as decoration and would have to be kept in sync with the answers.
- **Docs:** a "demo notebook" paragraph in the README (what it is, how to re-seed it). `docs/architecture.md` §8 already lists `supabase/seed/`.

## Out of scope
- Precomputing the notebook guide (T09), the audio overview (T11), the evaluation questions and results (T13) — each extends this script in its own task.
- Any second demo notebook, or demo data for the home page list.

## Acceptance criteria
- [ ] On a fresh local database (`pnpm db:reset`), `pnpm script scripts/seed-demo.ts` leaves the demo notebook on the home page with every source `ready` and a non-zero chunk count; a question about the documents returns a cited answer locally (mock provider)
- [ ] Running the script twice changes nothing: same notebook id, same source ids, no duplicate rows, and the second run re-embeds nothing (chunk count unchanged, no model calls)
- [ ] A source that failed mid-ingest is retried by the next run instead of being skipped or duplicated — including one a crashed run left in `processing`, once its claim is past `STUCK_PROCESSING_MS` (set `updated_at` back in SQL to test it without waiting)
- [ ] The demo notebook is still read-only after seeding: an insert/update/delete against its `notebooks`, `sources` or `chunks` rows is refused for an authenticated non-owner (SQL or pgTAP check, not a UI assertion). `messages` is the deliberate exception — `messages_insert_owner` lets any signed-in visitor write to a demo notebook's chat, which is how a reviewer chats at all — so the assertion must not cover it
- [ ] `supabase/seed/README.md` records origin and licence for every document in the folder
- [ ] Production: the script ran once, the live URL shows the demo notebook, and a reviewer-style question returns a cited answer (human)

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm db:reset && pnpm db:test
pnpm script scripts/seed-demo.ts   # twice: the second run must be a no-op
pnpm test:e2e
```

## Notes for the agent
- `pnpm script` runs `tsx --conditions=react-server --env-file=.env.local`. That condition is what lets a script import `server-only` modules (`lib/ingest/pipeline.ts`, `lib/ai/*`) — do **not** copy pipeline stages into the script to avoid the guard.
- `runIngest` signature and call site: `lib/ingest/pipeline.ts:24`, `app/api/sources/[id]/ingest/route.ts:91-98`. It deletes the source's existing chunks **before** extracting (`pipeline.ts:33`) — that is what stops a retry from duplicating passages, but it also means a run that fails after that delete leaves the source `failed` with **no** chunks. `--force` on a live demo source is the case that matters: it drops the passages a reviewer is currently citing, then re-embeds them. The resulting state is at least honest — the row is `failed` with the reason on it, never `ready` and empty — and the recovery is the ordinary one: fix the cause and run the script again, which claims the `failed` row and re-ingests it from scratch. Treat `--force` against production as a step to watch through to `ready`, not one to fire and walk away from.
- The route claims the source with a conditional update because a public endpoint can be called twice; the script is single-owner, but claim the row the same way so a crash leaves a reclaimable row. The condition has **two** branches (`app/api/sources/[id]/ingest/route.ts:61-63`): `status.in.(pending,failed)`, **or** `status.eq.processing` with `updated_at` older than `STUCK_PROCESSING_MS`. A crash mid-ingest leaves `processing` with no further update ever coming — a claim that only matched `pending|failed` would skip that source on every later run, which is the one state the script could not get out of. Reuse `STUCK_PROCESSING_MS` (`lib/sources.ts:19`) rather than inventing a second threshold.
- Do **not** call `assertAiAllowed` here: the script deliberately bypasses the per-user limits and the global daily cap — one-off, service role, not a user entry point (`conventions/security.md` §7 governs routes and actions). Say so in the report-back rather than adding it quietly. The honest consequence: `assertAiAllowed` is also the only writer of `usage_events`, so this run's embeddings land in no usage row and the daily cap under-counts what is the largest single embedding job in the project.
- Local and production seeds are not interchangeable: locally the mock provider produces hash embeddings (`lib/ai/mock.ts`) that only a near-exact question retrieves. Production must be seeded with the real provider, and re-seeding production after changing documents is a fresh embedding run.
- Use `demo@ask-my-docs.invalid` for the owner (`.invalid` can never receive mail) and mark it confirmed at creation.
- Never run anything against the hosted project from an agent session (`AGENTS.md`, *Things the agent must not do*).
