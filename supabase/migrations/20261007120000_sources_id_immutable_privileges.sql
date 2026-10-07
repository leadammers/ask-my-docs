-- prevent_source_id_update() (20261003120000) is trigger-only but was created
-- without a privilege statement, so it kept Postgres's default EXECUTE for
-- PUBLIC. Revoke it like every other trigger function here
-- (conventions/database.md). Triggers run regardless of EXECUTE, so
-- sources_id_immutable keeps firing.
revoke execute on function public.prevent_source_id_update() from public, anon, authenticated;
