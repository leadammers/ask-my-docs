-- T08b: the retention claim — deciding and recording in one statement.
--
-- Closes two gaps left by 20260927200000_user_activity_and_retention.sql, both
-- found in review:
--
-- 1. list_retention_candidates() returned the same 100 oldest users every run.
--    A user whose storage cleanup always fails kept their slot forever and
--    nothing newer was ever reached: retention stalled while looking healthy.
--    Attempted users now rotate behind never-attempted ones, so a stuck user
--    cannot block the queue.
--
-- 2. runRetention selected a user, removed their files, then deleted them. A
--    visit in that window wrote user_activity but did not stop the deletion, so
--    a returning user lost their files and rows anyway. claim_retention_user()
--    settles it in one statement: re-check that the user is still stale and
--    anonymous, and record the attempt under the same commit.
--
-- retention_state is bookkeeping, not activity. user_activity's row *is* the
-- claim "this user has been seen" and its last_seen_at is `not null`, so
-- recording an attempt there would need either a nullability change or a fake
-- timestamp that made an idle user look active — that is, never deletable.
-- Two facts, two homes.
--
-- Residual window, accepted and documented like the other ones (security.md
-- §7, §8): the claim closes the window from "selected" to "claimed", but the
-- irreversible step is the Storage removal, which no Postgres transaction
-- covers. A user idle for RETENTION_DAYS who returns in the few seconds
-- between their claim and their file removal can still lose their files. A
-- lock shared with touch_last_seen would not close it — it would only block
-- every page view of a user whose deletion had already been committed — so
-- touch_last_seen is deliberately unchanged.
--
-- The claim re-checks anonymity and staleness but *not* the demo owner: that is
-- a config value (app_settings.demo_owner_id), not a fact about the user, and
-- lib/retention.ts already excludes it before any claim is issued. The
-- asymmetry is deliberate, not an oversight.

create table retention_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

alter table retention_state enable row level security;
-- No policies. Unusually, no grants either — not even the service_role SELECT
-- that user_activity has: nothing reads this table through the API, only the
-- security-definer function below touches it. That is a deliberate narrower
-- reading of database.md's "service_role gets full DML", which is about tables
-- the app queries through supabase-js. The pgTAP test pins the empty grant.

revoke all on retention_state from anon, authenticated, service_role;

-- security definer justification (conventions/database.md): this reads
-- auth.users and user_activity, neither of which is readable through the API,
-- so it runs as the owner with `set search_path = ''` and fully qualified names.
create or replace function public.list_retention_candidates(
  p_inactive_before timestamptz,
  p_limit integer
)
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
    left join public.retention_state rs on rs.user_id = u.id
    where u.is_anonymous
      and coalesce(a.last_seen_at, u.created_at) < p_inactive_before
    -- `nulls first` is the fix, not a style choice: ASC defaults to NULLS LAST,
    -- which would put every never-attempted user *behind* the failures and
    -- starve the queue exactly as before. Within a cohort the order is still
    -- oldest activity first, and u.id makes it total so a batch is stable.
    order by rs.attempted_at asc nulls first,
             coalesce(a.last_seen_at, u.created_at) asc,
             u.id asc
    limit p_limit;
end;
$$;

revoke execute on function public.list_retention_candidates(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.list_retention_candidates(timestamptz, integer)
  to service_role;

create function public.claim_retention_user(
  p_user_id uuid,
  p_inactive_before timestamptz,
  p_retry_after interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  -- A negative window would make `attempted_at < now() - p_retry_after` always
  -- true and drop the guard entirely, so it is rejected rather than trusted.
  if p_user_id is null
    or p_inactive_before is null
    or p_retry_after is null
    or p_retry_after <= interval '0' then
    raise exception 'invalid arguments' using errcode = 'invalid_parameter_value';
  end if;

  -- One statement decides and records. Two overlapping runs cannot both win:
  -- the second's `do update` blocks on the first's row lock, re-reads the
  -- updated row and finds the window not yet passed.
  --
  -- `where u.id = p_user_id` is load-bearing twice: it is the eligibility
  -- filter, and it is what keeps `insert ... select` to at most one row.
  -- Widening this to a batch would need that deduplication added first.
  insert into public.retention_state (user_id)
  select u.id
  from auth.users u
  left join public.user_activity a on a.user_id = u.id
  where u.id = p_user_id
    and u.is_anonymous
    and coalesce(a.last_seen_at, u.created_at) < p_inactive_before
  on conflict (user_id) do update
    set attempted_at = now()
    where public.retention_state.attempted_at < now() - p_retry_after;

  -- Rows inserted or updated: 0 when the user turned out to be active, and 0
  -- when the conflict clause refused to refresh a claim still inside its
  -- window. Both mean "someone else has this user, or they are not ours to
  -- delete" and are reported as a plain false.
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke execute on function public.claim_retention_user(uuid, timestamptz, interval)
  from public, anon, authenticated;
grant execute on function public.claim_retention_user(uuid, timestamptz, interval)
  to service_role;
