-- T02: RLS tests (conventions/database.md, docs/architecture.md §3)
begin;
select plan(10);

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

update notebooks set title = 'hacked' where id = 'b0000000-0000-0000-0000-000000000001';
delete from notebooks where id = 'b0000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ insert into sources (notebook_id, user_id, kind, title, status)
     values ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'text', 'hack', 'ready') $$,
  '42501',
  null,
  'A cannot insert a source into B''s notebook'
);

select throws_ok(
  $$ insert into chunks (source_id, notebook_id, user_id, ordinal, content)
     values ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 0, 'hack') $$,
  '42501',
  null,
  'A cannot insert a chunk into B''s notebook'
);

select throws_ok(
  $$ insert into chunks (source_id, notebook_id, user_id, ordinal, content)
     values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 2, 'hack') $$,
  '42501',
  null,
  'nobody can insert a chunk into the demo notebook'
);

select is(
  (select count(*)::int from chunks where id = 'd2000000-0000-0000-0000-000000000001'),
  1,
  'demo rows are readable'
);

-- ---------------------------------------------------------------------------
-- Back to postgres: prove B's notebook survived A's update/delete attempts
-- ---------------------------------------------------------------------------
reset role;

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

-- ---------------------------------------------------------------------------
-- As user B: the poisoned chunk must not be readable
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from chunks where id = 'd2000000-0000-0000-0000-000000000002'),
  0,
  'a chunk in the demo notebook owned by someone other than the demo owner is not readable'
);

select * from finish();
rollback;
