-- T05 review follow-up: track when a source row last changed, and enforce the
-- per-notebook source limit in the database (createSourceUpload's count-then-
-- insert in app/n/[id]/actions.ts is not atomic under parallel requests).

alter table sources add column updated_at timestamptz not null default now();

create trigger sources_set_updated_at
  before update on sources
  for each row execute function set_updated_at();

-- Mirrors 20260927140000_notebook_limit.sql: a per-notebook advisory lock
-- serialises concurrent inserts so the count below can't be read stale.
-- MAX_SOURCES_PER_NOTEBOOK is an env var (.env.example: 10) — keep this in
-- sync with it by hand, same as MAX_NOTEBOOKS_PER_USER's trigger does for its
-- own hardcoded 5.
create function public.enforce_source_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('source_limit:' || new.notebook_id::text, 0));

  if (select count(*) from public.sources where notebook_id = new.notebook_id) >= 10 then
    raise exception 'source limit reached'
      using errcode = 'check_violation', hint = 'source_limit';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_source_limit() from public, anon, authenticated;

create trigger sources_enforce_limit
  before insert on sources
  for each row execute function public.enforce_source_limit();
