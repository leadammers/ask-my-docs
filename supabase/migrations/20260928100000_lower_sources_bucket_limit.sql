-- The `sources` bucket allowed 50 MB, well above MAX_UPLOAD_MB (10 MB by
-- default): a direct uploadToSignedUrl call could make the ingest route
-- buffer a much larger file than the app's own limit expects. The app is
-- still the real enforcement point (createSourceUpload checks the client's
-- claimed size before issuing a URL; the ingest route checks the object's
-- actual size before downloading it) — this is a hard ceiling, set with
-- headroom over the current default so a future MAX_UPLOAD_MB bump doesn't
-- also require a migration.
update storage.buckets
set file_size_limit = 15728640 -- 15 MB
where id = 'sources';
