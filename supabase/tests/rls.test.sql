-- T02: RLS tests (conventions/database.md, docs/architecture.md §3)
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

insert into notebooks (id, user_id, title, is_demo) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A notebook', false),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B notebook', false),
  ('d0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Demo notebook', true);

insert into sources (id, notebook_id, user_id, kind, title, status) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'text', 'A source', 'ready'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'text', 'B source', 'ready'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'text', 'Demo source', 'ready');

-- B's own chunk, unrelated to the demo notebook
insert into chunks (id, source_id, notebook_id, user_id, ordinal, content) values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 0, 'B chunk');

-- legitimate demo chunk, owned by the demo owner
insert into chunks (id, source_id, notebook_id, user_id, ordinal, content) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 0, 'demo chunk');

-- poisoned chunk: sits in the demo notebook but is owned by A, not the demo owner
insert into chunks (id, source_id, notebook_id, user_id, ordinal, content) values
  ('d2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 'poisoned chunk');

-- A's own chunk, notes, guide and audio overview: for owner-positive delete checks
insert into chunks (id, source_id, notebook_id, user_id, ordinal, content) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 0, 'A chunk');

insert into notes (id, notebook_id, user_id, title, content, origin) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A note', 'A note', 'manual'),
  ('d3000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Demo note', 'Demo note', 'manual');

insert into notebook_guides (notebook_id, user_id, summary) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A guide'),
  ('d0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Demo guide');

insert into audio_overviews (id, notebook_id, user_id, status) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'ready'),
  ('d4000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'ready');

-- ---------------------------------------------------------------------------
-- As user A
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from notebooks where id = 'b0000000-0000-0000-0000-000000000001'),
  0,
  'A cannot read B''s notebook'
);

select is(
  (select count(*)::int from sources where id = 'b1000000-0000-0000-0000-000000000001'),
  0,
  'A cannot read B''s sources'
);

select is(
  (select count(*)::int from chunks where id = 'b2000000-0000-0000-0000-000000000001'),
  0,
  'A cannot read B''s chunks'
);

select is(
  (select title from notebooks where id = 'a0000000-0000-0000-0000-000000000001'),
  'A notebook',
  'A can read its own notebook (owner-positive check)'
);

update notebooks set title = 'hacked' where id = 'b0000000-0000-0000-0000-000000000001';
delete from notebooks where id = 'b0000000-0000-0000-0000-000000000001';

update sources set title = 'hacked' where id = 'b1000000-0000-0000-0000-000000000001';
delete from sources where id = 'b1000000-0000-0000-0000-000000000001';

update chunks set content = 'hacked' where id = 'b2000000-0000-0000-0000-000000000001';
delete from chunks where id = 'b2000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ insert into sources (notebook_id, user_id, kind, title, status)
     values ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'text', 'hack', 'ready') $$,
  '42501',
  'new row violates row-level security policy for table "sources"',
  'A cannot insert a source into B''s notebook'
);

select throws_ok(
  $$ insert into chunks (source_id, notebook_id, user_id, ordinal, content)
     values ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 0, 'hack') $$,
  '42501',
  'new row violates row-level security policy for table "chunks"',
  'A cannot insert a chunk into B''s notebook'
);

select throws_ok(
  $$ insert into chunks (source_id, notebook_id, user_id, ordinal, content)
     values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 2, 'hack') $$,
  '42501',
  'new row violates row-level security policy for table "chunks"',
  'nobody can insert a chunk into the demo notebook'
);

select throws_ok(
  $$ insert into sources (notebook_id, user_id, kind, title, status)
     values ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'text', 'hack', 'ready') $$,
  '42501',
  'new row violates row-level security policy for table "sources"',
  'nobody can insert a source into the demo notebook'
);

select throws_ok(
  $$ insert into notebooks (user_id, title, is_demo)
     values ('11111111-1111-1111-1111-111111111111', 'sneaky demo', true) $$,
  '42501',
  'new row violates row-level security policy for table "notebooks"',
  'a user cannot flag their own notebook as demo on insert'
);

select is(
  (select count(*)::int from chunks where id = 'd2000000-0000-0000-0000-000000000001'),
  1,
  'demo rows are readable'
);

-- A is a regular visitor chatting with the demo notebook: insert succeeds,
-- but A still cannot read the demo owner's own messages.
insert into messages (notebook_id, user_id, role, content)
values ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'user', 'hello demo');

select is(
  (select count(*)::int from messages where notebook_id = 'd0000000-0000-0000-0000-000000000001' and user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'a visitor can chat with the demo notebook'
);

-- ---------------------------------------------------------------------------
-- DELETE policy coverage: A can delete its own non-demo rows, but demo rows
-- (owned by the demo owner) stay protected even though A can read them.
-- ---------------------------------------------------------------------------
delete from chunks where id = 'd2000000-0000-0000-0000-000000000001';
delete from sources where id = 'd1000000-0000-0000-0000-000000000001';
delete from notes where id = 'd3000000-0000-0000-0000-000000000001';
delete from notebook_guides where notebook_id = 'd0000000-0000-0000-0000-000000000001';
delete from audio_overviews where id = 'd4000000-0000-0000-0000-000000000001';

delete from chunks where id = 'a2000000-0000-0000-0000-000000000001';
delete from sources where id = 'a1000000-0000-0000-0000-000000000001';
delete from notes where id = 'a3000000-0000-0000-0000-000000000001';
delete from notebook_guides where notebook_id = 'a0000000-0000-0000-0000-000000000001';
delete from audio_overviews where id = 'a4000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Back to postgres: prove B's rows survived A's update/delete attempts, A's
-- own non-demo rows are gone, and the demo rows above were never deleted.
-- ---------------------------------------------------------------------------
reset role;

select is(
  (select count(*)::int from chunks where id = 'a2000000-0000-0000-0000-000000000001'),
  0,
  'A can delete its own chunk'
);

select is(
  (select count(*)::int from sources where id = 'a1000000-0000-0000-0000-000000000001'),
  0,
  'A can delete its own source'
);

select is(
  (select count(*)::int from notes where id = 'a3000000-0000-0000-0000-000000000001'),
  0,
  'A can delete its own note'
);

select is(
  (select count(*)::int from notebook_guides where notebook_id = 'a0000000-0000-0000-0000-000000000001'),
  0,
  'A can delete its own notebook guide'
);

select is(
  (select count(*)::int from audio_overviews where id = 'a4000000-0000-0000-0000-000000000001'),
  0,
  'A can delete its own audio overview'
);

select is(
  (select count(*)::int from chunks where id = 'd2000000-0000-0000-0000-000000000001'),
  1,
  'demo chunk cannot be deleted'
);

select is(
  (select count(*)::int from sources where id = 'd1000000-0000-0000-0000-000000000001'),
  1,
  'demo source cannot be deleted'
);

select is(
  (select count(*)::int from notes where id = 'd3000000-0000-0000-0000-000000000001'),
  1,
  'demo note cannot be deleted'
);

select is(
  (select count(*)::int from notebook_guides where notebook_id = 'd0000000-0000-0000-0000-000000000001'),
  1,
  'demo notebook guide cannot be deleted'
);

select is(
  (select count(*)::int from audio_overviews where id = 'd4000000-0000-0000-0000-000000000001'),
  1,
  'demo audio overview cannot be deleted'
);

select is(
  (select title from notebooks where id = 'b0000000-0000-0000-0000-000000000001'),
  'B notebook',
  'A cannot update B''s notebook'
);

select is(
  (select count(*)::int from notebooks where id = 'b0000000-0000-0000-0000-000000000001'),
  1,
  'A cannot delete B''s notebook'
);

select is(
  (select title from sources where id = 'b1000000-0000-0000-0000-000000000001'),
  'B source',
  'A cannot update B''s source'
);

select is(
  (select count(*)::int from sources where id = 'b1000000-0000-0000-0000-000000000001'),
  1,
  'A cannot delete B''s source'
);

select is(
  (select content from chunks where id = 'b2000000-0000-0000-0000-000000000001'),
  'B chunk',
  'A cannot update B''s chunk'
);

select is(
  (select count(*)::int from chunks where id = 'b2000000-0000-0000-0000-000000000001'),
  1,
  'A cannot delete B''s chunk'
);

-- ---------------------------------------------------------------------------
-- As user B: the poisoned chunk must not be readable, demo chat is private
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from chunks where id = 'd2000000-0000-0000-0000-000000000002'),
  0,
  'a chunk in the demo notebook owned by someone other than the demo owner is not readable'
);

select is(
  (select count(*)::int from messages where notebook_id = 'd0000000-0000-0000-0000-000000000001' and user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'B cannot read A''s messages in the demo notebook'
);

-- ---------------------------------------------------------------------------
-- app_settings is read-only through the API for everyone: no update policy
-- exists, so the update matches zero rows instead of raising.
-- ---------------------------------------------------------------------------
update app_settings set demo_owner_id = '22222222-2222-2222-2222-222222222222' where id = true;

reset role;

select is(
  (select demo_owner_id from app_settings),
  '33333333-3333-3333-3333-333333333333'::uuid,
  'nobody can update app_settings through the API'
);

select * from finish();
rollback;
