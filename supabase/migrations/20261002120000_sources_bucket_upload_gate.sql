-- Security review follow-up (2026-10-02, D1): the `sources` bucket's insert and
-- update policies only checked the `{uid}/` folder. Storage is a separate API
-- from the Next app, so any anonymous session — one is minted on the public
-- /demo-login page before a code is typed — could upload straight to it:
-- unlimited objects of up to 15 MB, tracked by no `sources` row, against a 1 GB
-- free tier. That contradicts D-21 ("a visitor who cannot create a notebook
-- cannot create anything") and the bounds the tables already enforce.
--
-- Same fix as the tables (D-17, D-21): the binding check lives in Postgres.
-- An object may be written only when the caller is demo-entitled AND owns a
-- `sources` row naming that exact path. createSourceUpload inserts the row
-- (count and trigger limits apply) before it asks for the signed upload URL,
-- so the app's own flow is unchanged and the source limit bounds storage too.
-- The name is tied to the row's immutable id (lib/sources.ts sourceStoragePath),
-- not just to its `storage_path`: `authenticated` may update that column, and
-- repointing one row at ever new paths would otherwise buy unlimited objects for
-- one row, orphaned from deleteSource, which removes only the current path.
-- `audio` has no client write policy and stays server-only.

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
  );

drop policy sources_bucket_update_owner on storage.objects;
create policy sources_bucket_update_owner
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'sources'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
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
  );
