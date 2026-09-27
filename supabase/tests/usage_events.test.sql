-- T04: usage_events supports the rate limiter and the global cap
-- (lib/rate-limit.ts) without widening what signed-in users can do.
begin;
select plan(5);

select has_index('public', 'usage_events', 'idx_usage_events_user_kind_created',
  array['user_id', 'kind', 'created_at'], 'per-user window counts are indexed');
select has_index('public', 'usage_events', 'idx_usage_events_created_at',
  array['created_at'], 'global daily counts are indexed');
select hasnt_index('public', 'usage_events', 'idx_usage_events_user_id',
  'redundant single-column user_id index is dropped');

-- Users can't record usage themselves, so they can't burn the global cap
-- or reset their own count; only the server (service_role) writes.
select table_privs_are('public', 'usage_events', 'authenticated', array['SELECT'],
  'authenticated can only read usage_events');
select table_privs_are('public', 'usage_events', 'service_role',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role records usage');

select * from finish();
rollback;
