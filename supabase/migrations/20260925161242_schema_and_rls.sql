-- T02: data model, RLS, storage buckets (docs/architecture.md §3, conventions/database.md)

create extension if not exists vector;

-- updated_at trigger, shared by notebooks and notes
create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- app_settings: single row, holds the demo notebook's owner. Readable by
-- everyone, writable by no one through the API (service role only).
-- ---------------------------------------------------------------------------
create table app_settings (
  id boolean primary key default true,
  demo_owner_id uuid,
  constraint app_settings_singleton check (id)
);

alter table app_settings enable row level security;

create policy app_settings_select_all
  on app_settings for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- notebooks
-- ---------------------------------------------------------------------------
create table notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_notebooks_user_id on notebooks (user_id);

alter table notebooks enable row level security;

create trigger notebooks_set_updated_at
  before update on notebooks
  for each row
  execute function set_updated_at();

create policy notebooks_select_owner
  on notebooks for select
  using (user_id = (select auth.uid()));

create policy notebooks_select_demo
  on notebooks for select
  using (is_demo = true and user_id = (select demo_owner_id from app_settings));

create policy notebooks_insert_owner
  on notebooks for insert
  with check (user_id = (select auth.uid()));

create policy notebooks_update_owner
  on notebooks for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notebooks_delete_owner
  on notebooks for delete
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------
create table sources (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('pdf', 'text', 'markdown', 'url')),
  title text not null,
  storage_path text,
  url text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  progress jsonb,
  error text,
  page_count integer,
  char_count integer,
  created_at timestamptz not null default now()
);

create index idx_sources_notebook_id on sources (notebook_id);
create index idx_sources_user_id on sources (user_id);

alter table sources enable row level security;

create policy sources_select_owner
  on sources for select
  using (user_id = (select auth.uid()));

create policy sources_select_demo
  on sources for select
  using (
    user_id = (select demo_owner_id from app_settings)
    and exists (select 1 from notebooks n where n.id = notebook_id and n.is_demo = true)
  );

create policy sources_insert_owner
  on sources for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))
  );

create policy sources_update_owner
  on sources for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))
  );

create policy sources_delete_owner
  on sources for delete
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- chunks
-- ---------------------------------------------------------------------------
create table chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources (id) on delete cascade,
  notebook_id uuid not null references notebooks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ordinal integer not null,
  content text not null,
  page_from integer,
  page_to integer,
  token_count integer,
  embedding vector(768),
  fts tsvector generated always as (to_tsvector('simple', content)) stored
);

create index idx_chunks_source_id on chunks (source_id);
create index idx_chunks_notebook_id on chunks (notebook_id);
create index idx_chunks_user_id on chunks (user_id);
create index idx_chunks_embedding on chunks using hnsw (embedding vector_cosine_ops);
create index idx_chunks_fts on chunks using gin (fts);

alter table chunks enable row level security;

create policy chunks_select_owner
  on chunks for select
  using (user_id = (select auth.uid()));

create policy chunks_select_demo
  on chunks for select
  using (
    user_id = (select demo_owner_id from app_settings)
    and exists (select 1 from notebooks n where n.id = notebook_id and n.is_demo = true)
  );

create policy chunks_insert_owner
  on chunks for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))
  );

create policy chunks_update_owner
  on chunks for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))
  );

create policy chunks_delete_owner
  on chunks for delete
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- messages: chat log. Anyone may chat with the demo notebook, but each
-- visitor only ever sees their own messages (no demo select policy needed).
-- ---------------------------------------------------------------------------
create table messages (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);

create index idx_messages_notebook_id on messages (notebook_id);
create index idx_messages_user_id on messages (user_id);

alter table messages enable row level security;

create policy messages_select_owner
  on messages for select
  using (user_id = (select auth.uid()));

create policy messages_insert_owner
  on messages for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from notebooks n
      where n.id = notebook_id
        and (n.user_id = (select auth.uid()) or n.is_demo = true)
    )
  );

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
create table notes (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  content text not null,
  citations jsonb,
  origin text not null check (origin in ('manual', 'chat')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_notes_notebook_id on notes (notebook_id);
create index idx_notes_user_id on notes (user_id);

alter table notes enable row level security;

create trigger notes_set_updated_at
  before update on notes
  for each row
  execute function set_updated_at();

create policy notes_select_owner
  on notes for select
  using (user_id = (select auth.uid()));

create policy notes_insert_owner
  on notes for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))
  );

create policy notes_update_owner
  on notes for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))
  );

create policy notes_delete_owner
  on notes for delete
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- notebook_guides: one row per notebook, notebook_id is the primary key
-- ---------------------------------------------------------------------------
create table notebook_guides (
  notebook_id uuid primary key references notebooks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  summary text,
  topics jsonb,
  questions jsonb,
  source_fingerprint text,
  created_at timestamptz not null default now()
);

create index idx_notebook_guides_user_id on notebook_guides (user_id);

alter table notebook_guides enable row level security;

create policy notebook_guides_select_owner
  on notebook_guides for select
  using (user_id = (select auth.uid()));

create policy notebook_guides_select_demo
  on notebook_guides for select
  using (
    user_id = (select demo_owner_id from app_settings)
    and exists (select 1 from notebooks n where n.id = notebook_id and n.is_demo = true)
  );

create policy notebook_guides_insert_owner
  on notebook_guides for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))
  );

create policy notebook_guides_update_owner
  on notebook_guides for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))
  );

create policy notebook_guides_delete_owner
  on notebook_guides for delete
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- audio_overviews
-- ---------------------------------------------------------------------------
create table audio_overviews (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  progress jsonb,
  script jsonb,
  storage_path text,
  duration_seconds integer,
  error text,
  source_fingerprint text,
  created_at timestamptz not null default now()
);

create index idx_audio_overviews_notebook_id on audio_overviews (notebook_id);
create index idx_audio_overviews_user_id on audio_overviews (user_id);

alter table audio_overviews enable row level security;

create policy audio_overviews_select_owner
  on audio_overviews for select
  using (user_id = (select auth.uid()));

create policy audio_overviews_select_demo
  on audio_overviews for select
  using (
    user_id = (select demo_owner_id from app_settings)
    and exists (select 1 from notebooks n where n.id = notebook_id and n.is_demo = true)
  );

create policy audio_overviews_insert_owner
  on audio_overviews for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))
  );

create policy audio_overviews_update_owner
  on audio_overviews for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))
  );

create policy audio_overviews_delete_owner
  on audio_overviews for delete
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- usage_events: append-only, for rate limiting
-- ---------------------------------------------------------------------------
create table usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);

create index idx_usage_events_user_id on usage_events (user_id);

alter table usage_events enable row level security;

create policy usage_events_select_owner
  on usage_events for select
  using (user_id = (select auth.uid()));

create policy usage_events_insert_owner
  on usage_events for insert
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- storage: private buckets `sources` and `audio`
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('sources', 'sources', false), ('audio', 'audio', false)
on conflict (id) do nothing;

create policy sources_bucket_select_owner
  on storage.objects for select
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy sources_bucket_select_demo
  on storage.objects for select
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = 'demo');

create policy sources_bucket_insert_owner
  on storage.objects for insert
  with check (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy sources_bucket_update_owner
  on storage.objects for update
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy sources_bucket_delete_owner
  on storage.objects for delete
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy audio_bucket_select_owner
  on storage.objects for select
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy audio_bucket_select_demo
  on storage.objects for select
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = 'demo');

create policy audio_bucket_insert_owner
  on storage.objects for insert
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy audio_bucket_update_owner
  on storage.objects for update
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy audio_bucket_delete_owner
  on storage.objects for delete
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid()::text));
