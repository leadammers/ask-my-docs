-- T03: enforce the per-user notebook limit in the database.
--
-- createNotebook (app/(app)/actions.ts) checks the limit before inserting, but
-- `notebooks_insert_owner` lets any signed-in user insert through the API
-- directly, skipping the action — and two parallel creates can both pass the
-- action's count. This trigger is the real enforcement; the action's check only
-- gives a quick, friendly error.
--
-- The limit (5) mirrors MAX_NOTEBOOKS_PER_USER in lib/config.ts — change both
-- together. `security invoker` (the default): the count runs under the caller's
-- RLS, which shows exactly their own notebooks for `user_id = new.user_id`.
-- A per-user transaction advisory lock serialises concurrent inserts, so the
-- count can't be read stale.

create function public.enforce_notebook_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('notebook_limit:' || new.user_id::text, 0));

  if (select count(*) from public.notebooks where user_id = new.user_id) >= 5 then
    raise exception 'notebook limit reached'
      using errcode = 'check_violation', hint = 'notebook_limit';
  end if;

  return new;
end;
$$;

-- Trigger functions can't be called directly; revoke anyway so no role holds a
-- pointless EXECUTE (conventions/database.md: explicit grants).
revoke execute on function public.enforce_notebook_limit() from public, anon, authenticated;

create trigger notebooks_enforce_limit
  before insert on notebooks
  for each row execute function public.enforce_notebook_limit();
