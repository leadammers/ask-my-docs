# T02 — Local Supabase, schema, RLS, storage

**Mode:** hand-off · **Priority:** P0 · **Depends on:** T00, T01 · **Estimate:** 1.25h · **Your time:** 10 min (diff review)

## Goal
A local Supabase stack runs in Docker with the complete data model from `docs/architecture.md` §3, row-level security on every table, private storage buckets, and automated RLS tests.

## Context
`conventions/database.md` and `conventions/security.md` §3 and §5. Everything here runs **locally**. Pushing to the hosted project is a human step (see "Release to production" in `tasks/README.md`).

## Scope
- `supabase init`; in `supabase/config.toml`: anonymous sign-ins **enabled**, CAPTCHA **disabled** (local only), storage enabled
- Fill the Supabase values in `.env.local` from `supabase status` (local keys are public dev keys, not secrets)
- `package.json` scripts: `db:start` (`supabase start`), `db:stop`, `db:reset` (`supabase db reset`), `db:types` (`supabase gen types typescript --local > lib/supabase/types.ts`), `db:test` (`supabase test db`)
- Migration: `create extension if not exists vector;`, all tables from architecture §3 including `usage_events`
- `progress jsonb` on `sources` and `audio_overviews` (see architecture §3)
- `check` constraints for `sources.kind`, `sources.status`, `messages.role`, `notes.origin`, `audio_overviews.status`
- `user_id uuid not null default auth.uid()` on every table; foreign keys with `on delete cascade`; index on every foreign key
- Indexes: HNSW on `chunks.embedding` (`vector_cosine_ops`), GIN on `chunks.fts`
- `chunks.fts` generated column: `to_tsvector('simple', content)`
- `updated_at` trigger for `notebooks` and `notes`
- **Demo owner:** the demo notebook and all its rows belong to a dedicated auth user created by the seed script (T08). Store its id in a one-row table `app_settings (demo_owner_id uuid)` that is readable by everyone and writable by no one through the API.
- **RLS on all tables** (`conventions/database.md`):
  - Owner policies for select/insert/update/delete
  - **Insert/update `with check` also verifies the parent:** a row may only reference a notebook the user owns — `exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))`. Exception: `messages` may also reference the demo notebook (people chat with it).
  - Demo read policies (notebooks, sources, chunks, notebook_guides, audio_overviews) require **both** `is_demo` on the notebook **and** `user_id = demo_owner_id` on the row. Without the second condition, anyone could insert a chunk into the demo notebook and every visitor would read it — a prompt-injection path into every reviewer's session.
- Storage via migration: private buckets `sources` and `audio`; users read/write only under `{auth.uid()}/…`; objects under `demo/…` readable by all authenticated users, writable by none
- **RLS tests** as pgTAP in `supabase/tests/rls.test.sql`: two users; A cannot read, update or delete B's notebook, sources or chunks; A cannot insert a source or chunk into B's notebook; nobody can insert chunks into the demo notebook; demo rows are readable; a chunk in the demo notebook owned by someone other than the demo owner is **not** readable

## Out of scope
`match_chunks` (T06). Application code. Anything against the hosted project.

## Acceptance criteria
- [ ] `pnpm db:reset` applies all migrations cleanly
- [ ] `pnpm db:test` passes all RLS tests, including the demo-poisoning cases
- [ ] `pnpm db:types` generates types that compile
- [ ] Every table has `enable row level security`

## Verification
```bash
pnpm db:start && pnpm db:reset && pnpm db:test
pnpm db:types && pnpm typecheck
grep -c "enable row level security" supabase/migrations/*.sql
```

## Notes for the agent
- `vector(768)` must match `AI_EMBEDDING_DIMENSIONS`.
- Keep denormalised `notebook_id` and `user_id` on `chunks`; retrieval filters on them without joins.
- pgTAP: switch users in tests with `set local role authenticated` and `set local request.jwt.claims = '{"sub":"<uuid>"}'`.
