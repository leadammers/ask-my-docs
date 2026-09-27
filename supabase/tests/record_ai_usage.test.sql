-- T04: record_ai_usage_if_allowed reserves AI usage atomically and is only
-- callable by the server (see 20260927190000_record_ai_usage_if_allowed.sql).
begin;
select plan(13);

select function_privs_are('public', 'record_ai_usage_if_allowed',
  array['uuid', 'text', 'integer', 'integer', 'integer'], 'anon', array[]::text[],
  'anon cannot execute record_ai_usage_if_allowed');
select function_privs_are('public', 'record_ai_usage_if_allowed',
  array['uuid', 'text', 'integer', 'integer', 'integer'], 'authenticated', array[]::text[],
  'authenticated cannot execute record_ai_usage_if_allowed');
select function_privs_are('public', 'record_ai_usage_if_allowed',
  array['uuid', 'text', 'integer', 'integer', 'integer'], 'service_role', array['EXECUTE'],
  'service_role can execute record_ai_usage_if_allowed');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

-- Per-user window: limit 2 per hour for `chat`.
select is(public.record_ai_usage_if_allowed('11111111-1111-1111-1111-111111111111', 'chat', 2, 3600, 100),
  'ok', 'first call within the limit is allowed');
select is(public.record_ai_usage_if_allowed('11111111-1111-1111-1111-111111111111', 'chat', 2, 3600, 100),
  'ok', 'second call within the limit is allowed');
select is(public.record_ai_usage_if_allowed('11111111-1111-1111-1111-111111111111', 'chat', 2, 3600, 100),
  'rate_limited', 'third call in the window is refused');
select is((select count(*)::int from usage_events where user_id = '11111111-1111-1111-1111-111111111111'),
  2, 'a refused call is not recorded');
select is(public.record_ai_usage_if_allowed('11111111-1111-1111-1111-111111111111', 'ingest', 2, 3600, 100),
  'ok', 'the limit is per kind');
select is(public.record_ai_usage_if_allowed('22222222-2222-2222-2222-222222222222', 'chat', 2, 3600, 100),
  'ok', 'the limit is per user');

-- Events older than the window don't count against the user's limit.
insert into usage_events (user_id, kind, created_at) values
  ('22222222-2222-2222-2222-222222222222', 'audio', now() - interval '2 hours');
select is(public.record_ai_usage_if_allowed('22222222-2222-2222-2222-222222222222', 'audio', 1, 3600, 100),
  'ok', 'events outside the window are ignored');

-- Global daily cap: 5 events today (the backdated one may fall on today too),
-- so a cap at today's count refuses everyone and records nothing.
select is(
  public.record_ai_usage_if_allowed('22222222-2222-2222-2222-222222222222', 'guide', 10, 3600,
    (select count(*)::int from usage_events
     where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')),
  'daily_cap_reached', 'the global daily cap refuses once reached, for any user or kind');

-- Events before midnight UTC don't count against the daily cap.
delete from usage_events;
insert into usage_events (user_id, kind, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'chat',
   date_trunc('day', now() at time zone 'utc') at time zone 'utc' - interval '1 minute');
select is(public.record_ai_usage_if_allowed('22222222-2222-2222-2222-222222222222', 'chat', 5, 60, 1),
  'ok', 'yesterday''s events do not count against today''s cap');

select throws_ok(
  $$ select public.record_ai_usage_if_allowed('11111111-1111-1111-1111-111111111111', 'chat', 0, 3600, 100) $$,
  '22023', 'invalid arguments', 'a non-positive limit is rejected');

select * from finish();
rollback;
