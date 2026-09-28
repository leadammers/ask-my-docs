-- T05 review follow-up: the source limit holds even for direct inserts that
-- skip the server action (see 20260928110000_sources_updated_at_and_limit.sql).
begin;
select plan(4);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into notebooks (id, title) values
  ('33333333-3333-3333-3333-333333333333', 'Notebook A');

select lives_ok(
  $$ insert into sources (notebook_id, kind, title)
     select '33333333-3333-3333-3333-333333333333', 'text', 'Source ' || n
     from generate_series(1, 10) as n $$,
  'a notebook can hold up to 10 sources'
);

select throws_ok(
  $$ insert into sources (notebook_id, kind, title)
     values ('33333333-3333-3333-3333-333333333333', 'text', 'Source 11') $$,
  '23514',
  'source limit reached',
  'a direct insert of an 11th source is refused'
);

select is(
  (select count(*)::int from sources where notebook_id = '33333333-3333-3333-3333-333333333333'),
  10,
  'the refused insert left no row behind'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

insert into notebooks (id, title) values
  ('44444444-4444-4444-4444-444444444444', 'Notebook B');

select lives_ok(
  $$ insert into sources (notebook_id, kind, title)
     values ('44444444-4444-4444-4444-444444444444', 'text', 'B 1') $$,
  'another notebook''s limit is independent'
);

select * from finish();
rollback;
