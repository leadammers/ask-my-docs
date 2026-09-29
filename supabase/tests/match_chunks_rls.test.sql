-- T06: match_chunks runs `security invoker`, so RLS decides visibility —
-- another user's call returns zero rows even when notebook_id/source_id
-- match exactly (see 20260928120000_match_chunks.sql).
begin;
select plan(2);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

-- A creates a notebook below, which needs a live demo entitlement
-- (20260929114828). B needs none: it only ever reads.
insert into demo_entitlements (user_id, expires_at)
values ('11111111-1111-1111-1111-111111111111', now() + interval '8 hours');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into notebooks (id, title) values
  ('33333333-3333-3333-3333-333333333333', 'Notebook A');

insert into sources (id, notebook_id, kind, title) values
  (
    '44444444-4444-4444-4444-444444444444',
    '33333333-3333-3333-3333-333333333333',
    'text',
    'Source A'
  );

-- The chunk goes in as the table owner: `authenticated` holds no insert grant
-- on chunks (20260929102647) — the ingest pipeline writes them under the
-- service role. `request.jwt.claims` is still set, so `user_id` defaults to A.
reset role;

insert into chunks (source_id, notebook_id, ordinal, content, embedding) values
  (
    '44444444-4444-4444-4444-444444444444',
    '33333333-3333-3333-3333-333333333333',
    0,
    'the quick brown fox',
    array_fill(0::real, array[768])::vector(768)
  );

set local role authenticated;

select is(
  (
    select count(*)::int from public.match_chunks(
      '33333333-3333-3333-3333-333333333333',
      array['44444444-4444-4444-4444-444444444444']::uuid[],
      array_fill(0::real, array[768])::vector(768),
      'fox'
    )
  ),
  1,
  'owner calling match_chunks gets their chunk'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

select is(
  (
    select count(*)::int from public.match_chunks(
      '33333333-3333-3333-3333-333333333333',
      array['44444444-4444-4444-4444-444444444444']::uuid[],
      array_fill(0::real, array[768])::vector(768),
      'fox'
    )
  ),
  0,
  'another user calling match_chunks gets zero rows'
);

select * from finish();
rollback;
