-- T04: indexes for the rate limiter and the global daily cap (lib/rate-limit.ts).
--
-- Both counts run on every AI call, inside record_ai_usage_if_allowed
-- (20260927190000_record_ai_usage_if_allowed.sql):
--   per user:  where user_id = $1 and kind = $2 and created_at >= $3
--   global:    where created_at >= <midnight UTC>
--
-- No grants change here: `authenticated` keeps read-only access to its own
-- rows; only the server (service_role) records usage.

create index idx_usage_events_user_kind_created
  on usage_events (user_id, kind, created_at);

create index idx_usage_events_created_at
  on usage_events (created_at);

-- The composite index leads with user_id, so it also serves the FK cascade
-- from auth.users; the single-column index is redundant.
drop index idx_usage_events_user_id;
