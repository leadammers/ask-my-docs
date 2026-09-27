-- T04: reserve AI usage atomically (lib/rate-limit.ts → assertAiAllowed).
--
-- Checking the limits and recording the use in separate queries let parallel
-- requests pass on the same remaining capacity. This function does all three
-- steps under one transaction-scoped advisory lock, so reservations run one at
-- a time: the global daily cap first (a refused call is never recorded), then
-- the caller's per-kind window, then the insert. Each count runs as its own
-- statement after the lock is taken, so it sees every earlier reservation.
--
-- One global lock serialises all AI reservations — a few milliseconds each,
-- negligible at demo traffic.
--
-- `security invoker` (the default): only service_role may execute it, and
-- service_role already has the table privileges it needs; nothing is elevated.
-- Not executable by `authenticated`/`anon`: a signed-in visitor calling it
-- through the API could otherwise use up the global cap without reaching the
-- model. The ids it receives come from the server session, never a request.
--
-- Every usage_events kind is an AI kind (AI_USAGE_KINDS in lib/config.ts), so
-- the daily cap counts all rows since midnight UTC.

create function public.record_ai_usage_if_allowed(
  p_user_id uuid,
  p_kind text,
  p_limit integer,
  p_window_seconds integer,
  p_daily_cap integer
)
returns text
language plpgsql
set search_path = ''
as $$
begin
  if p_user_id is null or p_kind is null or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1
     or p_daily_cap is null or p_daily_cap < 1 then
    raise exception 'invalid arguments' using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_usage_reservation', 0));

  if (
    select count(*) from public.usage_events
    where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
  ) >= p_daily_cap then
    return 'daily_cap_reached';
  end if;

  if (
    select count(*) from public.usage_events
    where user_id = p_user_id
      and kind = p_kind
      and created_at >= now() - make_interval(secs => p_window_seconds)
  ) >= p_limit then
    return 'rate_limited';
  end if;

  insert into public.usage_events (user_id, kind) values (p_user_id, p_kind);
  return 'ok';
end;
$$;

revoke execute on function public.record_ai_usage_if_allowed(uuid, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_ai_usage_if_allowed(uuid, text, integer, integer, integer)
  to service_role;
