-- Security review follow-up (findings ca458014 CWE-863, 9a842259 CWE-862):
-- the demo password was enforced in Next.js only.
--
-- proxy.ts gates every route but /demo-login, and app/layout.tsx mounts
-- AuthGate on that page — so a visitor gets an anonymous Supabase session
-- *before* typing the password. PostgREST is a different origin than the Next
-- app, so proxy.ts never saw a direct API call, and the database had no way to
-- tell an entitled visitor from one that never passed the gate: the demo
-- policies admitted any `authenticated` session, and notebooks_insert_owner
-- accepted any of them too.
--
-- This migration gives the database its own half of the gate: a row issues an
-- entitlement, and the policies that serve demo content or mint a notebook
-- require one. Same reasoning as D-17 — an API reachable with the anon key
-- needs its binding check in Postgres, not only in the server that happens to
-- be the usual caller.

-- ---------------------------------------------------------------------------
-- demo_entitlements: written by app/demo-login/actions.ts after the password
-- verifies, through the service-role client. Never a security-definer *grant*
-- function — that would be self-service, exactly the hole being closed here.
-- ---------------------------------------------------------------------------
create table demo_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);

alter table demo_entitlements enable row level security;
-- No policies: the function below is the only door, and it only ever answers a
-- question about the caller (default deny).

revoke all on demo_entitlements from anon, authenticated, service_role;
grant select, insert, update, delete on demo_entitlements to service_role;

-- ---------------------------------------------------------------------------
-- is_demo_entitled: does the caller hold a live entitlement?
--
-- `stable` + `security definer` with `set search_path = ''` and fully
-- qualified names, like the other helpers (conventions/database.md) — it reads
-- a table `authenticated` has no privileges on. It leaks nothing: the caller
-- learns only a fact about themselves.
--
-- Called once per row by the demo select policies. The lookup is a primary-key
-- scan on a table with one row per visitor who entered the password, so the
-- per-row cost is a single index probe.
-- ---------------------------------------------------------------------------
create function public.is_demo_entitled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.demo_entitlements
    where user_id = (select auth.uid())
      and expires_at > now()
  );
$$;

revoke execute on function public.is_demo_entitled() from public, anon;
grant execute on function public.is_demo_entitled() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The policies that serve demo content, or mint the notebook everything else
-- hangs off, now require a live entitlement.
--
-- Gating notebooks_insert_owner covers the whole write side: every other
-- insert policy's `with check` requires the parent notebook to be owned and
-- not demo, so a visitor who cannot create a notebook cannot create anything,
-- and chunks/usage_events/audio_overviews have no client insert at all.
--
-- messages_insert_owner is the one exception that does reach demo rows — it
-- carries the documented "anyone may chat with the demo notebook" branch — so
-- its demo half is gated too. Otherwise the entitlement would close the reads
-- and the notebook write while leaving a PostgREST path that writes junk into
-- the notebook every reviewer sees.
--
-- Deliberately left alone: app_settings_select_all. The demo policies read
-- `(select demo_owner_id from app_settings)` in a subquery that runs as the
-- invoking role, so gating it would make them fail closed for everyone. The
-- row holds nothing but the demo owner's uuid.
-- ---------------------------------------------------------------------------
drop policy notebooks_select_demo on notebooks;
create policy notebooks_select_demo
  on notebooks for select
  to authenticated
  using (is_demo = true and user_id = (select demo_owner_id from app_settings) and public.is_demo_entitled());

drop policy notebooks_insert_owner on notebooks;
create policy notebooks_insert_owner
  on notebooks for insert
  to authenticated
  with check (user_id = (select auth.uid()) and is_demo = false and public.is_demo_entitled());

drop policy sources_select_demo on sources;
create policy sources_select_demo
  on sources for select
  to authenticated
  using (
    user_id = (select demo_owner_id from app_settings)
    and exists (select 1 from notebooks n where n.id = notebook_id and n.is_demo = true)
    and public.is_demo_entitled()
  );

drop policy chunks_select_demo on chunks;
create policy chunks_select_demo
  on chunks for select
  to authenticated
  using (
    user_id = (select demo_owner_id from app_settings)
    and exists (select 1 from notebooks n where n.id = notebook_id and n.is_demo = true)
    and public.is_demo_entitled()
  );

drop policy notebook_guides_select_demo on notebook_guides;
create policy notebook_guides_select_demo
  on notebook_guides for select
  to authenticated
  using (
    user_id = (select demo_owner_id from app_settings)
    and exists (select 1 from notebooks n where n.id = notebook_id and n.is_demo = true)
    and public.is_demo_entitled()
  );

drop policy audio_overviews_select_demo on audio_overviews;
create policy audio_overviews_select_demo
  on audio_overviews for select
  to authenticated
  using (
    user_id = (select demo_owner_id from app_settings)
    and exists (select 1 from notebooks n where n.id = notebook_id and n.is_demo = true)
    and public.is_demo_entitled()
  );

drop policy messages_insert_owner on messages;
create policy messages_insert_owner
  on messages for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from notebooks n
      where n.id = notebook_id
        and (
          n.user_id = (select auth.uid())
          or (
            n.is_demo = true
            and n.user_id = (select demo_owner_id from app_settings)
            and public.is_demo_entitled()
          )
        )
    )
  );

drop policy sources_bucket_select_demo on storage.objects;
create policy sources_bucket_select_demo
  on storage.objects for select
  to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = 'demo' and public.is_demo_entitled());

drop policy audio_bucket_select_demo on storage.objects;
create policy audio_bucket_select_demo
  on storage.objects for select
  to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = 'demo' and public.is_demo_entitled());
