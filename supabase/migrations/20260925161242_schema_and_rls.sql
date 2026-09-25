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
  title text not null check (char_length(title) <= 200),
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
  to authenticated
  using (user_id = (select auth.uid()));

create policy notebooks_select_demo
  on notebooks for select
  to authenticated
  using (is_demo = true and user_id = (select demo_owner_id from app_settings));

create policy notebooks_insert_owner
  on notebooks for insert
  to authenticated
  with check (user_id = (select auth.uid()) and is_demo = false);

create policy notebooks_update_owner
  on notebooks for update
  to authenticated
  using (user_id = (select auth.uid()) and is_demo = false)
  with check (user_id = (select auth.uid()) and is_demo = false);

create policy notebooks_delete_owner
  on notebooks for delete
  to authenticated
  using (user_id = (select auth.uid()) and is_demo = false);

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------
create table sources (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('pdf', 'text', 'markdown', 'url')),
  title text not null check (char_length(title) <= 200),
  storage_path text,
  url text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  progress jsonb,
  error text,
  page_count integer,
  char_count integer,
  created_at timestamptz not null default now(),
  constraint sources_id_notebook_id_key unique (id, notebook_id)
);

create index idx_sources_notebook_id on sources (notebook_id);
create index idx_sources_user_id on sources (user_id);

alter table sources enable row level security;

create policy sources_select_owner
  on sources for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy sources_select_demo
  on sources for select
  to authenticated
  using (
    user_id = (select demo_owner_id from app_settings)
    and exists (select 1 from notebooks n where n.id = notebook_id and n.is_demo = true)
  );

create policy sources_insert_owner
  on sources for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (storage_path is null or starts_with(storage_path, user_id::text || '/'))
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()) and n.is_demo = false)
  );

create policy sources_update_owner
  on sources for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (storage_path is null or starts_with(storage_path, user_id::text || '/'))
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()) and n.is_demo = false)
  );

create policy sources_delete_owner
  on sources for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- chunks
-- ---------------------------------------------------------------------------
create table chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  notebook_id uuid not null references notebooks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ordinal integer not null,
  content text not null,
  page_from integer,
  page_to integer,
  token_count integer,
  embedding vector(768),
  fts tsvector generated always as (to_tsvector('simple', content)) stored,
  constraint chunks_source_notebook_fkey foreign key (source_id, notebook_id) references sources (id, notebook_id) on delete cascade
);

create index idx_chunks_source_id on chunks (source_id);
create index idx_chunks_notebook_id on chunks (notebook_id);
create index idx_chunks_user_id on chunks (user_id);
create index idx_chunks_embedding on chunks using hnsw (embedding vector_cosine_ops);
create index idx_chunks_fts on chunks using gin (fts);

alter table chunks enable row level security;

create policy chunks_select_owner
  on chunks for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy chunks_select_demo
  on chunks for select
  to authenticated
  using (
    user_id = (select demo_owner_id from app_settings)
    and exists (select 1 from notebooks n where n.id = notebook_id and n.is_demo = true)
  );

create policy chunks_insert_owner
  on chunks for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()) and n.is_demo = false)
  );

create policy chunks_update_owner
  on chunks for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()) and n.is_demo = false)
  );

create policy chunks_delete_owner
  on chunks for delete
  to authenticated
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
  to authenticated
  using (user_id = (select auth.uid()));

create policy messages_insert_owner
  on messages for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from notebooks n
      where n.id = notebook_id
        and (
          n.user_id = (select auth.uid())
          or (n.is_demo = true and n.user_id = (select demo_owner_id from app_settings))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
create table notes (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) <= 200),
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
  to authenticated
  using (user_id = (select auth.uid()));

create policy notes_insert_owner
  on notes for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()) and n.is_demo = false)
  );

create policy notes_update_owner
  on notes for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()) and n.is_demo = false)
  );

create policy notes_delete_owner
  on notes for delete
  to authenticated
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
  to authenticated
  using (user_id = (select auth.uid()));

create policy notebook_guides_select_demo
  on notebook_guides for select
  to authenticated
  using (
    user_id = (select demo_owner_id from app_settings)
    and exists (select 1 from notebooks n where n.id = notebook_id and n.is_demo = true)
  );

create policy notebook_guides_insert_owner
  on notebook_guides for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()) and n.is_demo = false)
  );

create policy notebook_guides_update_owner
  on notebook_guides for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()) and n.is_demo = false)
  );

create policy notebook_guides_delete_owner
  on notebook_guides for delete
  to authenticated
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
  to authenticated
  using (user_id = (select auth.uid()));

create policy audio_overviews_select_demo
  on audio_overviews for select
  to authenticated
  using (
    user_id = (select demo_owner_id from app_settings)
    and exists (select 1 from notebooks n where n.id = notebook_id and n.is_demo = true)
  );

-- audio_overviews are generated by the server (service role, which bypasses
-- RLS) — no client insert/update policy. Clients only read and delete.

create policy audio_overviews_delete_owner
  on audio_overviews for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- usage_events: append-only, for rate limiting. Recorded by the server
-- (service role) only — a client insert policy would let users bypass their
-- own rate limits, so none exists here.
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
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- storage: private buckets `sources` and `audio`
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('sources', 'sources', false, 52428800, array['application/pdf']),
  ('audio', 'audio', false, 52428800, array['audio/mpeg', 'audio/wav'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy sources_bucket_select_owner
  on storage.objects for select
  to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy sources_bucket_select_demo
  on storage.objects for select
  to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = 'demo');

create policy sources_bucket_insert_owner
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy sources_bucket_update_owner
  on storage.objects for update
  to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy sources_bucket_delete_owner
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy audio_bucket_select_owner
  on storage.objects for select
  to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy audio_bucket_select_demo
  on storage.objects for select
  to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = 'demo');

-- audio objects are written by the server (service role) only — no client
-- insert/update policy, matching the audio_overviews table above.

create policy audio_bucket_delete_owner
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid()::text));
