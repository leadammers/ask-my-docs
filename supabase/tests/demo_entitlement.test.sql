-- Security review follow-up (findings ca458014 CWE-863, 9a842259 CWE-862):
-- the demo password gated Next.js routes only. PostgREST is a different origin,
-- so proxy.ts never saw those calls: any anonymous session — and one is minted
-- on the public /demo-login page, before the password is typed — could read the
-- demo notebook and create notebooks through the API directly.
--
-- The entitlement row written by the login action (see
-- 20260929140000_demo_entitlement.sql) is the database's half of that gate.
-- This file asserts the negative case first: without a live entitlement the
-- demo content is invisible and the write is refused.
begin;
select plan(30);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres, RLS does not apply to the table owner)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'demo@test.local');

insert into app_settings (id, demo_owner_id)
values (true, '33333333-3333-3333-3333-333333333333');

-- A's own notebook: the owner side must keep working with no entitlement.
insert into notebooks (id, user_id, title, is_demo) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A notebook', false);

insert into sources (id, notebook_id, user_id, kind, title, status) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'text', 'A source', 'ready');

-- The demo notebook and one row of each thing the demo policies serve.
insert into notebooks (id, user_id, title, is_demo) values
  ('d0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Demo notebook', true);

insert into sources (id, notebook_id, user_id, kind, title, status) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'text', 'Demo source', 'ready');

insert into chunks (id, source_id, notebook_id, user_id, ordinal, content) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 0, 'demo chunk');

insert into notebook_guides (notebook_id, user_id, summary) values
  ('d0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Demo guide');

insert into audio_overviews (id, notebook_id, user_id, status) values
  ('d4000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'ready');

-- Demo Storage objects: the two bucket policies key off the literal `demo/`
-- folder, not off the demo owner's uuid.
insert into storage.objects (bucket_id, name) values
  ('sources', 'demo/d1000000-0000-0000-0000-000000000001.txt'),
  ('audio', 'demo/d4000000-0000-0000-0000-000000000001.wav');

-- ---------------------------------------------------------------------------
-- A, with no entitlement: everything demo is invisible, the write is refused
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  public.is_demo_entitled(),
  false,
  'a session with no entitlement row is not demo-entitled'
);

select is(
  (select count(*)::int from notebooks where id = 'd0000000-0000-0000-0000-000000000001'),
  0,
  'an unentitled visitor cannot read the demo notebook'
);

select is(
  (select count(*)::int from sources where id = 'd1000000-0000-0000-0000-000000000001'),
  0,
  'an unentitled visitor cannot read the demo notebook''s sources'
);

select is(
  (select count(*)::int from chunks where id = 'd2000000-0000-0000-0000-000000000001'),
  0,
  'an unentitled visitor cannot read the demo chunks'
);

select is(
  (select count(*)::int from notebook_guides where notebook_id = 'd0000000-0000-0000-0000-000000000001'),
  0,
  'an unentitled visitor cannot read the demo guide'
);

select is(
  (select count(*)::int from audio_overviews where id = 'd4000000-0000-0000-0000-000000000001'),
  0,
  'an unentitled visitor cannot read the demo audio overview'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'sources' and (storage.foldername(name))[1] = 'demo'),
  0,
  'an unentitled visitor cannot read the demo source file'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'audio' and (storage.foldername(name))[1] = 'demo'),
  0,
  'an unentitled visitor cannot read the demo audio file'
);

select throws_ok(
  $$ insert into notebooks (title) values ('not entitled') $$,
  '42501',
  'new row violates row-level security policy for table "notebooks"',
  'an unentitled visitor cannot create a notebook'
);

select throws_ok(
  $$ insert into messages (notebook_id, role, content)
     values ('d0000000-0000-0000-0000-000000000001', 'user', 'hello demo') $$,
  '42501',
  'new row violates row-level security policy for table "messages"',
  'an unentitled visitor cannot write into the demo notebook'
);

-- The gate is narrow: nothing the visitor owns is affected.
select is(
  (select title from notebooks where id = 'a0000000-0000-0000-0000-000000000001'),
  'A notebook',
  'an unentitled visitor still reads its own notebook'
);

select lives_ok(
  $$ insert into sources (notebook_id, kind, title)
     values ('a0000000-0000-0000-0000-000000000001', 'text', 'A second source') $$,
  'an unentitled visitor still writes into its own notebook'
);

select is(
  (select demo_owner_id from app_settings where id = true),
  '33333333-3333-3333-3333-333333333333'::uuid,
  'app_settings stays readable — the demo policies read it as the invoking role'
);

-- ---------------------------------------------------------------------------
-- A, with a live entitlement: the demo half opens up
-- ---------------------------------------------------------------------------
reset role;

insert into demo_entitlements (user_id, expires_at)
values ('11111111-1111-1111-1111-111111111111', now() + interval '8 hours');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  public.is_demo_entitled(),
  true,
  'a live entitlement row makes the session demo-entitled'
);

select is(
  (select count(*)::int from notebooks where id = 'd0000000-0000-0000-0000-000000000001'),
  1,
  'an entitled visitor can read the demo notebook'
);

select is(
  (select count(*)::int from sources where id = 'd1000000-0000-0000-0000-000000000001'),
  1,
  'an entitled visitor can read the demo sources'
);

select is(
  (select count(*)::int from chunks where id = 'd2000000-0000-0000-0000-000000000001'),
  1,
  'an entitled visitor can read the demo chunks'
);

select is(
  (select count(*)::int from notebook_guides where notebook_id = 'd0000000-0000-0000-0000-000000000001'),
  1,
  'an entitled visitor can read the demo guide'
);

select is(
  (select count(*)::int from audio_overviews where id = 'd4000000-0000-0000-0000-000000000001'),
  1,
  'an entitled visitor can read the demo audio overview'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'sources' and (storage.foldername(name))[1] = 'demo'),
  1,
  'an entitled visitor can read the demo source file'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'audio' and (storage.foldername(name))[1] = 'demo'),
  1,
  'an entitled visitor can read the demo audio file'
);

select lives_ok(
  $$ insert into notebooks (title) values ('entitled notebook') $$,
  'an entitled visitor can create a notebook'
);

select lives_ok(
  $$ insert into messages (notebook_id, role, content)
     values ('d0000000-0000-0000-0000-000000000001', 'user', 'hello demo') $$,
  'an entitled visitor can chat with the demo notebook'
);

-- ---------------------------------------------------------------------------
-- The entitlement is per user: B holds no row and sees nothing
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  public.is_demo_entitled(),
  false,
  'another user''s entitlement does not carry over'
);

select is(
  (select count(*)::int from notebooks where id = 'd0000000-0000-0000-0000-000000000001'),
  0,
  'a user with no entitlement of their own reads no demo rows'
);

-- ---------------------------------------------------------------------------
-- Expiry closes the gate again without deleting anything
-- ---------------------------------------------------------------------------
reset role;

update demo_entitlements
  set expires_at = now() - interval '1 second'
  where user_id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  public.is_demo_entitled(),
  false,
  'an expired entitlement is not an entitlement'
);

select is(
  (select count(*)::int from notebooks where id = 'd0000000-0000-0000-0000-000000000001'),
  0,
  'an expired entitlement reads no demo rows'
);

select throws_ok(
  $$ insert into notebooks (title) values ('expired') $$,
  '42501',
  'new row violates row-level security policy for table "notebooks"',
  'an expired entitlement cannot create a notebook'
);

-- ---------------------------------------------------------------------------
-- The table itself is reachable by the server only
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select user_id from demo_entitlements $$,
  '42501',
  'permission denied for table demo_entitlements',
  'authenticated cannot read demo_entitlements — the function is the only door'
);

select throws_ok(
  $$ insert into demo_entitlements (user_id, expires_at)
     values ('22222222-2222-2222-2222-222222222222', now() + interval '8 hours') $$,
  '42501',
  'permission denied for table demo_entitlements',
  'a visitor cannot grant themselves an entitlement'
);

reset role;

select * from finish();
rollback;
