-- Follow-up to the upload gate (20261002120000), two holes a policy cannot close:
--
-- 1. Orphans. `sources_delete_owner` lets an owner delete a row directly through
--    PostgREST, which leaves its object behind (only the app's deleteSource
--    removes it). Insert row -> upload -> delete row -> repeat buys a new 15 MB
--    object per round that no row, and so no source limit, accounts for.
-- 2. Signed uploads skip RLS. storage-api checks the insert policy only when it
--    signs an upload URL (a trial insert, rolled back), then performs the upload
--    itself as its superuser. So the policy's row binding holds at signing time
--    only: sign a URL, delete the row, repeat, then spend every URL at once.
--
-- Triggers fire for every role, the storage superuser included, and for the
-- trial insert too, so a BEFORE INSERT trigger enforces both rules at the
-- moment an object row is actually written (uploads and copies alike):
--   - a `sources` row must name the object, bound to its immutable id
--   - the owner's folder must hold fewer than 50 objects, orphans included.
--     50 = MAX_NOTEBOOKS_PER_USER (5, lib/config.ts) x MAX_SOURCES_PER_NOTEBOOK
--     (10, .env.example), the most the app's own flow can hold for one user —
--     change it with them. A per-folder advisory lock makes the count exact
--     under concurrent uploads.
-- The `demo` folder is exempt: no client can sign a URL for it (the insert
-- policy requires the caller's own folder), and its objects have no
-- id-derived paths. The entitlement is still checked at signing time only; an
-- entitled session can therefore spend a URL up to its expiry after the code
-- is revoked, within the limits above.

create function public.enforce_source_object_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  folder text := (storage.foldername(new.name))[1];
begin
  if new.bucket_id <> 'sources' or folder = 'demo' then
    return new;
  end if;

  if not exists (
    select 1 from public.sources s
    where s.storage_path = new.name
      and new.name = s.user_id::text || '/' || s.id::text || '.pdf'
  ) then
    raise exception 'no source row names this object' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('sources_bucket_objects:' || folder));
  if (
    select count(*) from storage.objects o
    where o.bucket_id = 'sources'
      and (storage.foldername(o.name))[1] = folder
  ) >= 50 then
    raise exception 'storage object limit reached' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_source_object_gate() from public, anon, authenticated;

create trigger sources_object_gate
  before insert on storage.objects
  for each row execute function public.enforce_source_object_gate();
