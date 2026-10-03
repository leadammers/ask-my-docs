-- PR #49 review (CodeRabbit): the sources bucket policies tie an object name to
-- `user_id/id.pdf` of a `sources` row, which only holds if `id` never changes.
-- `authenticated` holds a table-level UPDATE on `sources`, so an owner could set
-- `id` and `storage_path` together to any name in their own folder. Nothing in
-- the app updates `id`; make it immutable so the binding is real.
create function public.prevent_source_id_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'sources.id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger sources_id_immutable
  before update of id on public.sources
  for each row execute function public.prevent_source_id_update();
