-- T08b: last activity per user and the candidates for the retention cleanup.
--
-- Anonymous users who stop coming back are deleted after RETENTION_DAYS
-- (lib/config.ts) by the daily cron route (app/api/cron/retention). This
-- migration adds what that needs:
--
-- 1. user_activity.last_seen_at — written only by touch_last_seen(), which
--    proxy.ts calls at most once a day per browser. Users get no table
--    privileges, so they can't set their own timestamp to dodge deletion.
--
-- 2. list_retention_candidates() — anonymous users whose last activity
--    (last_seen_at, or account creation if they never got a touch) is older
--    than a cutoff. Reads auth.users, so it is `security definer`; executable
--    by service_role only. The final selection (demo owner excluded, anonymous
--    only) happens again in lib/retention.ts.
--
-- Both functions are `security definer` with `set search_path = ''` and fully
-- qualified names (conventions/database.md): touch_last_seen because
-- `authenticated` has no privileges on user_activity by design,
-- list_retention_candidates because auth.users isn't readable through the API.

create table user_activity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table user_activity enable row level security;
-- No policies: nobody reads or writes this table through the API except via
-- the functions below (default deny).

revoke all on user_activity from anon, authenticated, service_role;
grant select on user_activity to service_role;

create function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  insert into public.user_activity (user_id)
  values (auth.uid())
  on conflict (user_id) do update
    set last_seen_at = now()
    where public.user_activity.last_seen_at < now() - interval '1 day';
end;
$$;

revoke execute on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

create function public.list_retention_candidates(p_inactive_before timestamptz, p_limit integer)
returns table (user_id uuid, is_anonymous boolean, last_active_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_inactive_before is null or p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid arguments' using errcode = 'invalid_parameter_value';
  end if;

  return query
    select u.id, u.is_anonymous, coalesce(a.last_seen_at, u.created_at)
    from auth.users u
    left join public.user_activity a on a.user_id = u.id
    where u.is_anonymous
      and coalesce(a.last_seen_at, u.created_at) < p_inactive_before
    order by coalesce(a.last_seen_at, u.created_at)
    limit p_limit;
end;
$$;

revoke execute on function public.list_retention_candidates(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.list_retention_candidates(timestamptz, integer)
  to service_role;
