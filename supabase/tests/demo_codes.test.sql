-- Per-person demo access codes (D-24): claim_demo_session counts seats under a
-- row lock, and is_demo_entitled() also requires the code to be live, so
-- revoking or expiring a code ends access immediately. Codes here are fake
-- hashes — the function never sees a plaintext code.
begin;
select plan(21);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'c@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'd@test.local');

insert into demo_codes (id, label, code_hash, expires_at, revoked_at, max_sessions) values
  ('c0de0000-0000-0000-0000-000000000001', 'live',    'hash-live',    now() + interval '7 days', null,  2),
  ('c0de0000-0000-0000-0000-000000000002', 'revoked', 'hash-revoked', now() + interval '7 days', now(), 2),
  ('c0de0000-0000-0000-0000-000000000003', 'expired', 'hash-expired', now() - interval '1 second', null, 2),
  ('c0de0000-0000-0000-0000-000000000004', 'other',   'hash-other',   now() + interval '7 days', null,  1);

-- Claiming (the first calls run as the owner; test 21 runs as service_role itself)
select is(public.claim_demo_session('hash-unknown', '11111111-1111-1111-1111-111111111111', 28800), 'invalid', '1 an unknown code is invalid');
select is(public.claim_demo_session('hash-revoked', '11111111-1111-1111-1111-111111111111', 28800), 'invalid', '2 a revoked code is invalid');
select is(public.claim_demo_session('hash-expired', '11111111-1111-1111-1111-111111111111', 28800), 'invalid', '3 an expired code is invalid');

select is(public.claim_demo_session('hash-live', '11111111-1111-1111-1111-111111111111', 28800), 'ok', '4 A claims the live code');
select is(
  (select code_id from demo_entitlements where user_id = '11111111-1111-1111-1111-111111111111'),
  'c0de0000-0000-0000-0000-000000000001'::uuid,
  '5 the entitlement records which code granted it'
);
select is(public.claim_demo_session('hash-live', '22222222-2222-2222-2222-222222222222', 28800), 'ok', '6 B takes the second seat');
select is(public.claim_demo_session('hash-live', '33333333-3333-3333-3333-333333333333', 28800), 'seats_full', '7 C is refused: both seats are in use');
select is(public.claim_demo_session('hash-live', '11111111-1111-1111-1111-111111111111', 28800), 'ok', '8 A logging in again on the same session uses no extra seat');
select is(
  (select count(*)::int from demo_entitlements where code_id = 'c0de0000-0000-0000-0000-000000000001' and expires_at > now()),
  2,
  '9 two live seats are in use'
);

-- Switching codes frees the old seat and takes one on the new code.
select is(public.claim_demo_session('hash-other', '11111111-1111-1111-1111-111111111111', 28800), 'ok', '10 A switches to another code');
select is(
  (select count(*)::int from demo_entitlements where code_id = 'c0de0000-0000-0000-0000-000000000001' and expires_at > now()),
  1,
  '11 the first code lost A''s seat'
);
select is(public.claim_demo_session('hash-live', '44444444-4444-4444-4444-444444444444', 28800), 'ok', '12 D takes the seat A freed');
select is(public.claim_demo_session('hash-live', '33333333-3333-3333-3333-333333333333', 28800), 'seats_full', '13 C is refused again');

-- An expired entitlement frees its seat.
update demo_entitlements set expires_at = now() - interval '1 second'
  where user_id = '22222222-2222-2222-2222-222222222222';
select is(public.claim_demo_session('hash-live', '33333333-3333-3333-3333-333333333333', 28800), 'ok', '14 C gets the seat B''s expired session released');

-- Revocation and code expiry end access through the policies' own function
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(public.is_demo_entitled(), true, '15 D holds a live entitlement on a live code');

reset role;
update demo_codes set revoked_at = now() where id = 'c0de0000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(public.is_demo_entitled(), false, '16 revoking the code ends D''s access at once');

reset role;
update demo_codes set revoked_at = null, expires_at = now() - interval '1 second'
  where id = 'c0de0000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(public.is_demo_entitled(), false, '17 an expired code ends D''s access too');

-- Only the server can reach any of it
select throws_ok(
  $$ select code_hash from demo_codes $$,
  '42501',
  'permission denied for table demo_codes',
  '18 authenticated cannot read demo_codes'
);
select throws_ok(
  $$ select public.claim_demo_session('hash-live', '44444444-4444-4444-4444-444444444444', 28800) $$,
  '42501',
  'permission denied for function claim_demo_session',
  '19 authenticated cannot claim a session itself'
);

set local role anon;
select throws_ok(
  $$ select public.claim_demo_session('hash-live', '44444444-4444-4444-4444-444444444444', 28800) $$,
  '42501',
  'permission denied for function claim_demo_session',
  '20 anon cannot claim a session'
);

reset role;

-- The function is security invoker, so service_role's own grants must be enough.
insert into demo_codes (id, label, code_hash, expires_at)
values ('c0de0000-0000-0000-0000-000000000005', 'fresh', 'hash-fresh', now() + interval '7 days');

set local role service_role;
select is(
  public.claim_demo_session('hash-fresh', '44444444-4444-4444-4444-444444444444', 28800),
  'ok',
  '21 service_role can claim with its own grants (security invoker)'
);

reset role;
select * from finish();
rollback;
