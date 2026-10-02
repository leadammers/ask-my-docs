-- Storage owner isolation and the upload gate (review 2026-10-02, D1/D8): an
-- object in `sources` may be written only by a demo-entitled owner of a
-- `sources` row naming that path; nobody touches another user's folder; the
-- `audio` bucket takes no client writes.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

insert into notebooks (id, user_id, title, is_demo) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A notebook', false);

-- The row createSourceUpload inserts before it asks for the signed URL.
insert into sources (id, notebook_id, user_id, kind, title, storage_path) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'pdf', 'A source',
   '11111111-1111-1111-1111-111111111111/a1000000-0000-0000-0000-000000000001.pdf');

insert into demo_codes (id, label, code_hash, expires_at) values
  ('c0de0000-0000-0000-0000-000000000001', 'fixture', 'hash-fixture', now() + interval '7 days');

-- ---------------------------------------------------------------------------
-- A, no entitlement: even a tracked path in its own folder is refused
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('sources', '11111111-1111-1111-1111-111111111111/a1000000-0000-0000-0000-000000000001.pdf') $$,
  '42501',
  null,
  'an unentitled session cannot upload, even to a path its own source row names'
);

-- ---------------------------------------------------------------------------
-- A, entitled: only the tracked path in its own folder is writable
-- ---------------------------------------------------------------------------
reset role;
insert into demo_entitlements (user_id, code_id, expires_at) values
  ('11111111-1111-1111-1111-111111111111', 'c0de0000-0000-0000-0000-000000000001', now() + interval '8 hours'),
  ('22222222-2222-2222-2222-222222222222', 'c0de0000-0000-0000-0000-000000000001', now() + interval '8 hours');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('sources', '11111111-1111-1111-1111-111111111111/a1000000-0000-0000-0000-000000000001.pdf') $$,
  'an entitled owner can upload to the path its source row names'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('sources', '11111111-1111-1111-1111-111111111111/untracked.pdf') $$,
  '42501',
  null,
  'an object in the own folder with no source row is refused'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('sources', '22222222-2222-2222-2222-222222222222/x.pdf') $$,
  '42501',
  null,
  'an upload into another user''s folder is refused'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('audio', '11111111-1111-1111-1111-111111111111/x.wav') $$,
  '42501',
  null,
  'the audio bucket takes no client uploads'
);

select lives_ok(
  $$ update storage.objects set metadata = '{}'::jsonb
     where bucket_id = 'sources'
       and name = '11111111-1111-1111-1111-111111111111/a1000000-0000-0000-0000-000000000001.pdf' $$,
  'an entitled owner can update the object of its tracked path'
);

select throws_ok(
  $$ update storage.objects
     set name = '11111111-1111-1111-1111-111111111111/renamed.pdf'
     where bucket_id = 'sources'
       and name = '11111111-1111-1111-1111-111111111111/a1000000-0000-0000-0000-000000000001.pdf' $$,
  '42501',
  null,
  'an update cannot move an object to a path no source row names'
);

-- Repointing the row's storage_path must not buy a second object: the name is
-- bound to the row id, not to the mutable column.
select lives_ok(
  $$ update sources
     set storage_path = '11111111-1111-1111-1111-111111111111/other.pdf'
     where id = 'a1000000-0000-0000-0000-000000000001' $$,
  'an owner can still update its own source row'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('sources', '11111111-1111-1111-1111-111111111111/other.pdf') $$,
  '42501',
  null,
  'a repointed storage_path does not make another object name uploadable'
);

-- ---------------------------------------------------------------------------
-- B, entitled too (so only ownership is under test): A's object is invisible
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'sources' and (storage.foldername(name))[1] = '11111111-1111-1111-1111-111111111111'),
  0,
  'another user cannot read an owner''s objects'
);

select is_empty(
  $$ update storage.objects set metadata = '{"x":1}'::jsonb
     where bucket_id = 'sources' and (storage.foldername(name))[1] = '11111111-1111-1111-1111-111111111111'
     returning 1 $$,
  'another user cannot update an owner''s objects'
);

-- Delete is not asserted here: Storage's own trigger rejects direct SQL deletes
-- ("use the Storage API"), so that policy cannot be exercised from pgTAP.

select * from finish();
rollback;
