-- T08b: user_activity and the retention candidates
-- (see 20260927200000_user_activity_and_retention.sql).
begin;
select plan(14);

-- Privileges: users can't read or write their own activity; only the functions can.
select table_privs_are('public', 'user_activity', 'anon', array[]::text[],
  'anon has no privileges on user_activity');
select table_privs_are('public', 'user_activity', 'authenticated', array[]::text[],
  'authenticated has no privileges on user_activity');
select table_privs_are('public', 'user_activity', 'service_role', array['SELECT'],
  'service_role can only read user_activity');

select function_privs_are('public', 'touch_last_seen', array[]::text[], 'anon', array[]::text[],
  'anon cannot execute touch_last_seen');
select function_privs_are('public', 'touch_last_seen', array[]::text[], 'authenticated', array['EXECUTE'],
  'authenticated can execute touch_last_seen');

select function_privs_are('public', 'list_retention_candidates', array['timestamp with time zone', 'integer'],
  'anon', array[]::text[], 'anon cannot list retention candidates');
select function_privs_are('public', 'list_retention_candidates', array['timestamp with time zone', 'integer'],
  'authenticated', array[]::text[], 'authenticated cannot list retention candidates');
select function_privs_are('public', 'list_retention_candidates', array['timestamp with time zone', 'integer'],
  'service_role', array['EXECUTE'], 'service_role can list retention candidates');

insert into auth.users (id, email, is_anonymous, created_at) values
  ('11111111-1111-1111-1111-111111111111', null, true, now() - interval '60 days'),  -- stale, never touched
  ('22222222-2222-2222-2222-222222222222', null, true, now() - interval '60 days'),  -- old account, seen recently
  ('33333333-3333-3333-3333-333333333333', 'demo@test.local', false, now() - interval '60 days'); -- not anonymous

-- touch_last_seen as user 2: first call writes, a second call the same day doesn't.
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select lives_ok($$ select public.touch_last_seen() $$, 'a signed-in user can touch their activity');
reset role;

select is((select count(*)::int from user_activity where user_id = '22222222-2222-2222-2222-222222222222'),
  1, 'the first touch records the user');

update user_activity set last_seen_at = now() - interval '2 hours'
  where user_id = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select public.touch_last_seen();
reset role;
select ok(
  (select last_seen_at < now() - interval '1 hour' from user_activity
   where user_id = '22222222-2222-2222-2222-222222222222'),
  'a second touch within a day does not write again'
);

-- Candidates: only anonymous users whose last activity is before the cutoff.
select results_eq(
  $$ select user_id from public.list_retention_candidates(now() - interval '30 days', 100) $$,
  $$ values ('11111111-1111-1111-1111-111111111111'::uuid) $$,
  'only the stale anonymous user is a candidate (recent activity and non-anonymous users are not)'
);

select is(
  (select count(*)::int from public.list_retention_candidates(now() + interval '1 day', 1)),
  1, 'the limit caps the number of candidates'
);

select throws_ok(
  $$ select * from public.list_retention_candidates(now(), 0) $$,
  '22023', 'invalid arguments', 'a non-positive limit is rejected'
);

select * from finish();
rollback;
