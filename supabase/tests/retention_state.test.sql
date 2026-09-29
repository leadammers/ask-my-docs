-- T08b: the retention claim and the failure-last candidate order
-- (see 20260927..._retention_claim.sql).
--
-- Two findings from the PR review are pinned here, both entirely in Postgres:
-- a claim decides and records in one statement (so a visit between selection
-- and deletion wins), and the candidate order rotates attempted users behind
-- never-attempted ones (so a user who always fails cannot starve the queue).
begin;
select plan(25);

-- Privileges: nobody reaches retention_state through the API; only the
-- security-definer functions below touch it.
select table_privs_are('public', 'retention_state', 'anon', array[]::text[],
  'anon has no privileges on retention_state');
select table_privs_are('public', 'retention_state', 'authenticated', array[]::text[],
  'authenticated has no privileges on retention_state');
select table_privs_are('public', 'retention_state', 'service_role', array[]::text[],
  'service_role has no privileges on retention_state');

select function_privs_are('public', 'claim_retention_user',
  array['uuid', 'timestamp with time zone', 'interval'], 'anon', array[]::text[],
  'anon cannot claim a retention candidate');
select function_privs_are('public', 'claim_retention_user',
  array['uuid', 'timestamp with time zone', 'interval'], 'authenticated', array[]::text[],
  'authenticated cannot claim a retention candidate');
select function_privs_are('public', 'claim_retention_user',
  array['uuid', 'timestamp with time zone', 'interval'], 'service_role', array['EXECUTE'],
  'service_role can claim a retention candidate');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.retention_state'::regclass),
  'row level security is enabled on retention_state'
);

-- The two older users are 60 days idle, the newer ones 45 and 40 — so the
-- ordering case below can tell "oldest activity first" from "least recently
-- attempted first".
insert into auth.users (id, email, is_anonymous, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', null, true, now() - interval '60 days'),
  ('bbbbbbbb-0000-4000-8000-000000000002', null, true, now() - interval '60 days'),
  ('cccccccc-0000-4000-8000-000000000003', 'demo@test.local', false, now() - interval '60 days'),
  ('dddddddd-0000-4000-8000-000000000004', null, true, now() - interval '45 days'),
  ('eeeeeeee-0000-4000-8000-000000000005', null, true, now() - interval '40 days');

-- The second user visited just now, so it is not deletable even though its
-- account is old.
insert into user_activity (user_id, last_seen_at)
  values ('bbbbbbbb-0000-4000-8000-000000000002', now());

-- Argument bounds: a null or non-positive retry window would either never
-- claim or (with a negative interval) always claim, dropping the guard.
select throws_ok(
  $$ select public.claim_retention_user(null, now(), interval '20 hours') $$,
  '22023', 'invalid arguments', 'a null user id is rejected'
);
select throws_ok(
  $$ select public.claim_retention_user('aaaaaaaa-0000-4000-8000-000000000001', null, interval '20 hours') $$,
  '22023', 'invalid arguments', 'a null cutoff is rejected'
);
select throws_ok(
  $$ select public.claim_retention_user('aaaaaaaa-0000-4000-8000-000000000001', now(), null) $$,
  '22023', 'invalid arguments', 'a null retry window is rejected'
);
select throws_ok(
  $$ select public.claim_retention_user('aaaaaaaa-0000-4000-8000-000000000001', now(), interval '0') $$,
  '22023', 'invalid arguments', 'a zero retry window is rejected'
);
select throws_ok(
  $$ select public.claim_retention_user('aaaaaaaa-0000-4000-8000-000000000001', now(), interval '-1 hour') $$,
  '22023', 'invalid arguments', 'a negative retry window is rejected'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002"}';
select throws_ok(
  $$ select public.claim_retention_user('aaaaaaaa-0000-4000-8000-000000000001', now(), interval '20 hours') $$,
  '42501', null, 'a signed-in user cannot claim a retention candidate'
);
reset role;

-- The claim itself: true once, false while the window runs, recorded either way.
select ok(
  public.claim_retention_user('aaaaaaaa-0000-4000-8000-000000000001',
    now() - interval '30 days', interval '20 hours'),
  'a stale anonymous user is claimed'
);

update retention_state set attempted_at = now() - interval '1 hour'
  where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select is(
  public.claim_retention_user('aaaaaaaa-0000-4000-8000-000000000001',
    now() - interval '30 days', interval '20 hours'),
  false, 'a second claim inside the retry window is refused'
);
select ok(
  (select attempted_at < now() - interval '30 minutes' from retention_state
   where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'a refused claim does not refresh the attempt marker'
);

update retention_state set attempted_at = now() - interval '21 hours'
  where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select ok(
  public.claim_retention_user('aaaaaaaa-0000-4000-8000-000000000001',
    now() - interval '30 days', interval '20 hours'),
  'a claim is allowed again once the retry window has passed'
);

select is(
  public.claim_retention_user('bbbbbbbb-0000-4000-8000-000000000002',
    now() - interval '30 days', interval '20 hours'),
  false, 'a user who visited after the candidate query is not claimed'
);
select is(
  public.claim_retention_user('cccccccc-0000-4000-8000-000000000003',
    now() - interval '30 days', interval '20 hours'),
  false, 'a non-anonymous user is not claimed'
);
select is(
  public.claim_retention_user('ffffffff-0000-4000-8000-0000000000ff',
    now() - interval '30 days', interval '20 hours'),
  false, 'an unknown user is not claimed'
);
select is(
  (select count(*)::int from retention_state
   where user_id in ('bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000003')),
  0, 'a refused claim records nothing'
);
-- Scoped to the fixtures: a real cleanup run leaves its own rows behind, and
-- counting the whole table would make this file fail on any database that has
-- had one.
select is(
  (select count(*)::int from retention_state
   where user_id in ('aaaaaaaa-0000-4000-8000-000000000001',
                     'bbbbbbbb-0000-4000-8000-000000000002',
                     'cccccccc-0000-4000-8000-000000000003',
                     'dddddddd-0000-4000-8000-000000000004',
                     'eeeeeeee-0000-4000-8000-000000000005')),
  1, 'only the claimed user has a retention state row');

-- Ordering: the user attempted most recently sorts last even though it is the
-- longest idle, and a never-attempted user sorts ahead of both. Plain
-- "oldest activity first" would return exactly the reverse.
insert into retention_state (user_id, attempted_at)
  values ('dddddddd-0000-4000-8000-000000000004', now() - interval '3 hours');
update retention_state set attempted_at = now() - interval '1 hour'
  where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';

select results_eq(
  $$ select user_id from public.list_retention_candidates(now() - interval '30 days', 100) $$,
  $$ values ('eeeeeeee-0000-4000-8000-000000000005'::uuid),
            ('dddddddd-0000-4000-8000-000000000004'::uuid),
            ('aaaaaaaa-0000-4000-8000-000000000001'::uuid) $$,
  'never-attempted users come first, then the least recently attempted'
);

-- Deleting the user takes the bookkeeping row with it (no orphan state).
delete from auth.users where id = 'eeeeeeee-0000-4000-8000-000000000005';
select is(
  (select count(*)::int from retention_state
   where user_id = 'eeeeeeee-0000-4000-8000-000000000005'),
  0, 'deleting the user cascades to its retention state row'
);

-- Equal attempt time and equal activity fall back to the id, so a batch is
-- stable across runs rather than reordered by whatever the planner picked.
update retention_state set attempted_at = now()
  where user_id in ('aaaaaaaa-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000004');
update auth.users set created_at = now() - interval '50 days'
  where id in ('aaaaaaaa-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000004');
select results_eq(
  $$ select user_id from public.list_retention_candidates(now() - interval '30 days', 100) $$,
  $$ values ('aaaaaaaa-0000-4000-8000-000000000001'::uuid),
            ('dddddddd-0000-4000-8000-000000000004'::uuid) $$,
  'identical activity and attempt time are ordered by user id'
);

select * from finish();
rollback;
