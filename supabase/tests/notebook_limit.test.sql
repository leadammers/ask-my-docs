-- T03: the notebook limit holds even for direct inserts that skip the server
-- action (see 20260927140000_notebook_limit.sql).
begin;
select plan(4);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select lives_ok(
  $$ insert into notebooks (title) select 'A ' || n from generate_series(1, 5) as n $$,
  'a user can create up to 5 notebooks'
);

select throws_ok(
  $$ insert into notebooks (title) values ('A 6') $$,
  '23514',
  'notebook limit reached',
  'a direct insert of a 6th notebook is refused'
);

select is(
  (select count(*)::int from notebooks where user_id = '11111111-1111-1111-1111-111111111111'),
  5,
  'the refused insert left no row behind'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

select lives_ok(
  $$ insert into notebooks (title) values ('B 1') $$,
  'another user''s limit is independent'
);

select * from finish();
rollback;
