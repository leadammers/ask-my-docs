-- T03: explicit table privileges for the hosted project.
--
-- The T02 migration (20260925161242_schema_and_rls.sql) enables RLS and
-- defines policies, but never GRANTs the underlying table privileges those
-- policies gate. The local stack's automatic default-privilege bootstrap
-- masked this: `authenticated` and `service_role` already had broad grants
-- there. The hosted project has no such bootstrap, so every query failed
-- with "permission denied for table notebooks" before RLS ever ran.
--
-- Start from a clean slate (`revoke all`) rather than layering grants on
-- top of whatever a given environment's bootstrap already set up, so the
-- result is identical on both. Grants match exactly what each table's RLS
-- policies allow for `authenticated` (conventions/database.md). `anon` gets
-- nothing: every real user is `authenticated` via anonymous auth
-- (security.md §2). `service_role` bypasses RLS but still needs grants
-- (scripts/, T08 seed) — full DML, no truncate/references/trigger.

revoke all on
  app_settings,
  notebooks,
  sources,
  chunks,
  messages,
  notes,
  notebook_guides,
  audio_overviews,
  usage_events
from anon, authenticated, service_role;

grant usage on schema public to authenticated, service_role;

grant select on app_settings to authenticated;

grant select, insert, update, delete on
  notebooks,
  sources,
  chunks,
  notes,
  notebook_guides
to authenticated;

grant select, insert on messages to authenticated;

grant select, delete on audio_overviews to authenticated;

grant select on usage_events to authenticated;

grant select, insert, update, delete on
  app_settings,
  notebooks,
  sources,
  chunks,
  messages,
  notes,
  notebook_guides,
  audio_overviews,
  usage_events
to service_role;
