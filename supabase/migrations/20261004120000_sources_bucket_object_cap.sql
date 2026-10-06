-- Follow-up to the upload gate (20261002120000): the source limits do not bound
-- storage on their own. `sources_delete_owner` lets an owner delete a row
-- directly through PostgREST, which leaves its object behind (only the app's
-- deleteSource removes it). Insert row -> upload -> delete row -> repeat buys a
-- new 15 MB orphan per round, each one tracked by no row and so by no limit.
--
-- The cap counts the objects themselves. 50 = MAX_NOTEBOOKS_PER_USER (5,
-- lib/config.ts) x MAX_SOURCES_PER_NOTEBOOK (10, .env.example), the most
-- objects the app's own flow can ever hold for one user — change it with them.
-- A policy on storage.objects cannot query storage.objects (Postgres reports
-- infinite recursion), so the count lives in a security definer helper that
-- only ever counts the caller's own folder. Concurrent uploads at the cap can
-- each pass the check before the others commit; the overshoot is bounded by
-- the signed upload URLs the caller holds, each of which needs its own row.
-- Overwrites go through UPDATE and add no object, so that policy is unchanged.

create function public.own_source_object_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from storage.objects o
  where o.bucket_id = 'sources'
    and (storage.foldername(o.name))[1] = (select auth.uid()::text);
$$;

revoke execute on function public.own_source_object_count() from public, anon;
grant execute on function public.own_source_object_count() to authenticated, service_role;

drop policy sources_bucket_insert_owner on storage.objects;
create policy sources_bucket_insert_owner
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sources'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select public.is_demo_entitled())
    and exists (
      select 1 from public.sources s
      where s.user_id = (select auth.uid())
        and s.storage_path = objects.name
        and objects.name = s.user_id::text || '/' || s.id::text || '.pdf'
    )
    and (select public.own_source_object_count()) < 50
  );
