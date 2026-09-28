-- T03: table privilege tests (conventions/database.md).
-- Asserts the exact grants each role holds on every table, so local and the
-- hosted project can't silently drift apart again (see
-- 20260927130918_explicit_grants.sql for why this matters).
begin;
select plan(27);

select table_privs_are('public', 'app_settings', 'anon', array[]::text[], 'anon has no privileges on app_settings');
select table_privs_are('public', 'app_settings', 'authenticated', array['SELECT'], 'authenticated can only select app_settings');
select table_privs_are('public', 'app_settings', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role has full DML on app_settings');

select table_privs_are('public', 'notebooks', 'anon', array[]::text[], 'anon has no privileges on notebooks');
select table_privs_are('public', 'notebooks', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated has full DML on notebooks');
select table_privs_are('public', 'notebooks', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role has full DML on notebooks');

select table_privs_are('public', 'sources', 'anon', array[]::text[], 'anon has no privileges on sources');
select table_privs_are('public', 'sources', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated has full DML on sources');
select table_privs_are('public', 'sources', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role has full DML on sources');

select table_privs_are('public', 'chunks', 'anon', array[]::text[], 'anon has no privileges on chunks');
select table_privs_are('public', 'chunks', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated has full DML on chunks');
select table_privs_are('public', 'chunks', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role has full DML on chunks');

select table_privs_are('public', 'messages', 'anon', array[]::text[], 'anon has no privileges on messages');
select table_privs_are('public', 'messages', 'authenticated', array['SELECT', 'INSERT', 'DELETE'], 'authenticated can select, insert and delete messages, not update');
select table_privs_are('public', 'messages', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role has full DML on messages');

select table_privs_are('public', 'notes', 'anon', array[]::text[], 'anon has no privileges on notes');
select table_privs_are('public', 'notes', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated has full DML on notes');
select table_privs_are('public', 'notes', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role has full DML on notes');

select table_privs_are('public', 'notebook_guides', 'anon', array[]::text[], 'anon has no privileges on notebook_guides');
select table_privs_are('public', 'notebook_guides', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated has full DML on notebook_guides');
select table_privs_are('public', 'notebook_guides', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role has full DML on notebook_guides');

select table_privs_are('public', 'audio_overviews', 'anon', array[]::text[], 'anon has no privileges on audio_overviews');
select table_privs_are('public', 'audio_overviews', 'authenticated', array['SELECT', 'DELETE'], 'authenticated can select and delete audio_overviews, not insert or update');
select table_privs_are('public', 'audio_overviews', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role has full DML on audio_overviews');

select table_privs_are('public', 'usage_events', 'anon', array[]::text[], 'anon has no privileges on usage_events');
select table_privs_are('public', 'usage_events', 'authenticated', array['SELECT'], 'authenticated can only select usage_events');
select table_privs_are('public', 'usage_events', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role has full DML on usage_events');

select * from finish();
rollback;
