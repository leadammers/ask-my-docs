-- T02: RLS tests (conventions/database.md, docs/architecture.md §3)
begin;
select plan(37);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres, RLS does not apply to the table owner)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'demo@test.local');

insert into app_settings (id, demo_owner_id)
values (true, '33333333-3333-3333-3333-333333333333');

-- A and B are visitors who have entered the demo password: the demo reads and
-- the notebook insert below both require a live entitlement
-- (20260929114828_demo_entitlement.sql). B holds one too, so the poisoned-chunk
-- assertion at the end still isolates the demo-owner condition instead of
-- passing for the unrelated reason that B cannot see demo content at all.
insert into demo_codes (id, label, code_hash, expires_at) values
  ('c0de0000-0000-0000-0000-000000000001', 'fixture', 'hash-fixture', now() + interval '7 days');

insert into demo_entitlements (user_id, code_id, expires_at) values
  ('11111111-1111-1111-1111-111111111111', 'c0de0000-0000-0000-0000-000000000001', now() + interval '8 hours'),
  ('22222222-2222-2222-2222-222222222222', 'c0de0000-0000-0000-0000-000000000001', now() + interval '8 hours');

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

-- the demo owner's own message in the demo notebook: for the delete-ownership check
insert into messages (id, notebook_id, user_id, role, content) values
  ('d5000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'user', 'demo owner message');

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

-- chunks are the exception in this section: `authenticated` holds no write
-- grant at all (20260929102647), so these raise before RLS is consulted. The
-- rows surviving untouched is asserted again after `reset role` below.
select throws_ok(
  $$ update chunks set content = 'hacked' where id = 'b2000000-0000-0000-0000-000000000001' $$,
  '42501',
  'permission denied for table chunks',
  'A cannot update a chunk — authenticated has no update grant on chunks'
);

select throws_ok(
  $$ delete from chunks where id = 'b2000000-0000-0000-0000-000000000001' $$,
  '42501',
  'permission denied for table chunks',
  'A cannot delete a chunk — authenticated has no delete grant on chunks'
);

select throws_ok(
  $$ insert into sources (notebook_id, user_id, kind, title, status)
     values ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'text', 'hack', 'ready') $$,
  '42501',
  'new row violates row-level security policy for table "sources"',
  'A cannot insert a source into B''s notebook'
);

-- Inserting a chunk is refused by the missing grant, not by RLS: the grant is
-- checked first, so the message is `permission denied` for every notebook,
-- the visitor's own included. The demo case is the one that mattered (a chunk
-- in the demo notebook is served to every demo user), and it is refused too.
select throws_ok(
  $$ insert into chunks (source_id, notebook_id, user_id, ordinal, content)
     values ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 0, 'hack') $$,
  '42501',
  'permission denied for table chunks',
  'A cannot insert a chunk into B''s notebook'
);

select throws_ok(
  $$ insert into chunks (source_id, notebook_id, user_id, ordinal, content)
     values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 2, 'hack') $$,
  '42501',
  'permission denied for table chunks',
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
select throws_ok(
  $$ delete from chunks where id = 'd2000000-0000-0000-0000-000000000001' $$,
  '42501',
  'permission denied for table chunks',
  'a demo chunk cannot be deleted through the API'
);
delete from sources where id = 'd1000000-0000-0000-0000-000000000001';
delete from notes where id = 'd3000000-0000-0000-0000-000000000001';
delete from notebook_guides where notebook_id = 'd0000000-0000-0000-0000-000000000001';
delete from audio_overviews where id = 'd4000000-0000-0000-0000-000000000001';
delete from messages where id = 'd5000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ delete from chunks where id = 'a2000000-0000-0000-0000-000000000001' $$,
  '42501',
  'permission denied for table chunks',
  'A cannot delete its own chunk either — the ingest pipeline clears them under the service role'
);
delete from sources where id = 'a1000000-0000-0000-0000-000000000001';
delete from notes where id = 'a3000000-0000-0000-0000-000000000001';
delete from notebook_guides where notebook_id = 'a0000000-0000-0000-0000-000000000001';
delete from audio_overviews where id = 'a4000000-0000-0000-0000-000000000001';
delete from messages where notebook_id = 'd0000000-0000-0000-0000-000000000001' and user_id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Back to postgres: prove B's rows survived A's update/delete attempts, A's
-- own non-demo rows are gone, and the demo rows above were never deleted.
-- ---------------------------------------------------------------------------
reset role;

-- A could not delete this chunk directly (the grant is gone); it is gone
-- because deleting its source cascaded. That cascade, not a client delete, is
-- what clears chunks — which is why revoking delete on chunks is safe.
select is(
  (select count(*)::int from chunks where id = 'a2000000-0000-0000-0000-000000000001'),
  0,
  'A''s chunk is removed by the cascade from its deleted source'
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
  (select count(*)::int from messages where notebook_id = 'd0000000-0000-0000-0000-000000000001' and user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'A can delete its own message'
);

select is(
  (select count(*)::int from messages where id = 'd5000000-0000-0000-0000-000000000001'),
  1,
  'demo owner''s message cannot be deleted by another user'
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
-- app_settings is read-only through the API for everyone: authenticated has
-- no update grant at all (20260927130918_explicit_grants.sql), so this
-- raises before RLS even gets a chance to evaluate a (nonexistent) policy.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update app_settings set demo_owner_id = '22222222-2222-2222-2222-222222222222' where id = true$$,
  '42501',
  'permission denied for table app_settings',
  'nobody can update app_settings through the API'
);

-- ---------------------------------------------------------------------------
-- 20260929102647_authenticated_write_bounds.sql: `messages.content` is capped.
-- (The chunk write revoke from the same migration is covered above, by the
-- insert/update/delete attempts that now raise `permission denied`.)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into messages (notebook_id, user_id, role, content)
    values ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
            'user', repeat('x', 20001))$$,
  '23514',
  'new row for relation "messages" violates check constraint "messages_content_length"',
  'a message longer than the content cap is rejected'
);

reset role;

select * from finish();
rollback;
