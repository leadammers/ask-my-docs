-- Pentest follow-up: the entitlement gate also covers match_chunks over the demo
-- notebook, which demo_entitlement.test.sql does not exercise. A session with no
-- live entitlement must not read demo chunks; an entitled session (the control)
-- must, so a passing negative case cannot be a fixture that denies everyone.
-- The same two checks guard the owner-folder rule of the sources bucket. What the
-- bucket demands beyond that folder (entitlement, a matching sources row) is
-- asserted where that policy is defined, in storage_rls.test.sql.
begin;
select plan(4);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'demo@test.local');

insert into app_settings (id, demo_owner_id)
values (true, '33333333-3333-3333-3333-333333333333');

-- Only B holds an entitlement. A is the unentitled session under test.
insert into demo_codes (id, label, code_hash, expires_at) values
  ('c0de0000-0000-0000-0000-000000000001', 'fixture', 'hash-fixture', now() + interval '7 days');
insert into demo_entitlements (user_id, code_id, expires_at)
values ('22222222-2222-2222-2222-222222222222', 'c0de0000-0000-0000-0000-000000000001', now() + interval '8 hours');

insert into notebooks (id, user_id, title, is_demo) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A notebook', false),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B notebook', false),
  ('d0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Demo notebook', true);

insert into sources (id, notebook_id, user_id, kind, title, status, storage_path) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'pdf', 'A source', 'pending',
    '11111111-1111-1111-1111-111111111111/a1000000-0000-0000-0000-000000000001.pdf'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'pdf', 'B source', 'pending',
    '22222222-2222-2222-2222-222222222222/b1000000-0000-0000-0000-000000000001.pdf'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'text', 'Demo source', 'ready', null);

insert into chunks (source_id, notebook_id, user_id, ordinal, content, embedding) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 0,
    'the quick brown fox', array_fill(0::real, array[768])::vector(768));

-- ---------------------------------------------------------------------------
-- match_chunks over the demo notebook
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.match_chunks(
    'd0000000-0000-0000-0000-000000000001',
    array['d1000000-0000-0000-0000-000000000001']::uuid[],
    array_fill(0::real, array[768])::vector(768), 'fox')),
  0,
  'unentitled A gets no demo chunks from match_chunks'
);

-- ---------------------------------------------------------------------------
-- B, entitled: the control, plus the owner-folder rule
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.match_chunks(
    'd0000000-0000-0000-0000-000000000001',
    array['d1000000-0000-0000-0000-000000000001']::uuid[],
    array_fill(0::real, array[768])::vector(768), 'fox')),
  1,
  'entitled B gets the demo chunk from match_chunks'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('sources', '22222222-2222-2222-2222-222222222222/b1000000-0000-0000-0000-000000000001.pdf',
             '22222222-2222-2222-2222-222222222222') $$,
  'entitled B can upload to their own source path'
);

-- A's tracked path, so the object trigger (which fires before the policy check)
-- passes and the refusal comes from the owner-folder rule itself.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('sources', '11111111-1111-1111-1111-111111111111/a1000000-0000-0000-0000-000000000001.pdf',
             '22222222-2222-2222-2222-222222222222') $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'entitled B cannot upload into another user''s folder'
);

select * from finish();
rollback;
