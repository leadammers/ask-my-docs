# Database: Supabase Postgres, RLS, Storage

Supabase is not just storage here — **RLS is the access-control layer**. A mistake in this file's rules is a data leak between users.

## Migrations

- **All schema changes are migrations** in `supabase/migrations/`, created with `supabase migration new <description>`. Never change the schema in the dashboard.
- One concern per migration; never edit a migration that has been pushed — write a new one.
- **Every migration that creates a table or SQL function grants privileges explicitly** — the local stack's default-privilege bootstrap does not exist on the hosted project, so relying on it works locally and fails there with "permission denied". A table's grants to `authenticated` match exactly what its RLS policies allow (e.g. a table with only `select`/`insert` policies gets `grant select, insert`, not `all`); `anon` gets nothing (every real user is `authenticated` via anonymous auth); `service_role` gets full DML since it bypasses RLS. A function gets `grant execute … to authenticated` and nothing for `anon`. Cover the grants with a `table_privs_are()` pgTAP case (`supabase/tests/`).
- Develop against the **local** stack: `pnpm db:reset` applies all migrations, `pnpm db:test` runs the pgTAP tests, `pnpm db:types` regenerates `lib/supabase/types.ts` — commit it in the same commit.
- `supabase db push` to the hosted project is a **human release step**, never run by agents.

## Naming and types

- Tables: plural `snake_case` (`notebooks`, `audio_overviews`). Columns: `snake_case`.
- Primary keys: `id uuid primary key default gen_random_uuid()`.
- Timestamps: `timestamptz not null default now()`; `updated_at` maintained by trigger.
- Enumerations: `check` constraints on `text` columns (simpler to change than Postgres enums).
- Every foreign key has an index and an explicit `on delete` behaviour (usually `cascade`).
- Denormalise `user_id` and `notebook_id` onto child tables that are filtered often (`chunks`) — avoids joins in RLS and retrieval.

## Row Level Security

- `alter table … enable row level security;` in the **same migration** that creates the table. No exceptions.
- Default deny: a table with RLS and no policy is unreadable — that's the safe starting point.
- One policy per operation, named `<table>_<operation>_<who>`: `notebooks_select_owner`, `notebooks_select_demo`.
- Owner policies: `using (user_id = (select auth.uid()))` and the same in `with check` for insert/update. The `(select auth.uid())` form is evaluated once per query, not per row.
- **Parent ownership in `with check`:** a row that references a notebook may only be inserted/updated if the user owns that notebook (exception: `messages` in the demo notebook). Checking only `user_id = auth.uid()` lets users attach rows to other people's notebooks.
- Demo content: separate `select` policies that require `is_demo` on the notebook **and** the row's `user_id` = the demo owner. No insert/update/delete policy can match demo rows.
- RLS changes come with a matching pgTAP case in `supabase/tests/` (`pnpm db:test`).

## SQL functions

- `security invoker` (the default) so RLS applies. `security definer` only with a written justification in the migration **and** `set search_path = ''` with fully qualified names.
- Functions called via `rpc` validate their own parameters (e.g. `p_k between 1 and 20`).
- Complex queries (retrieval, fusion) live in SQL functions; simple CRUD uses `supabase-js`.

## Queries from the app

- Select **explicit columns**, not `*` — smaller payloads, and nothing accidental reaches the client.
- Use the **user-scoped client** for everything user-triggered. The service-role client is for `scripts/` and already-authorized server paths only (see `security.md` §3).
- Batch inserts (chunks in batches of ~100); no queries inside loops.
- Always check `error` on every Supabase call; map it via `lib/errors.ts`, never pass it to the client.

## Storage

- Buckets `sources` and `audio` are private. Policies restrict access to objects under `{auth.uid()}/…`; demo objects live under `demo/…` and are read-only.
- Paths are generated server-side; see `security.md` §5.
- **Deleting a row that owns files deletes the files first**, then the row. Cascades don't reach Storage.

## Free-tier limits to respect

500 MB database, 1 GB storage, project pauses after 7 idle days. Keep the upload caps; don't store extracted full text twice (chunks are enough); no binary data in Postgres.
