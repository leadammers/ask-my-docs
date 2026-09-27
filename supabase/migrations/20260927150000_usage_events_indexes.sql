-- T04: indexes for the rate limiter and the global daily cap (lib/rate-limit.ts).
--
-- Both run on every AI call:
--   per user:  where user_id = $1 and kind = $2 and created_at >= $3
--   global:    where kind in (...) and created_at >= <midnight UTC>
--
-- No new function or grant: the counts and the insert use the service-role
-- client, which already has full DML on usage_events
-- (20260927130918_explicit_grants.sql). A `security definer` count/record
-- function executable by `authenticated` was rejected — any signed-in visitor
-- could call it through the API and use up the global cap without ever
-- reaching the model. `authenticated` keeps read-only access to its own rows.

create index idx_usage_events_user_kind_created
  on usage_events (user_id, kind, created_at);

create index idx_usage_events_created_at
  on usage_events (created_at);

-- The composite index leads with user_id, so it also serves the FK cascade
-- from auth.users; the single-column index is redundant.
drop index idx_usage_events_user_id;
