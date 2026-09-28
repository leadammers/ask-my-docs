-- T06: hybrid retrieval — vector + full-text fused with Reciprocal Rank
-- Fusion (docs/architecture.md §4.2, docs/decisions.md D-06).
--
-- `security invoker`: runs as the calling role, so the existing RLS policies
-- on `chunks` decide which rows come back — a caller who isn't the
-- notebook's owner (and it isn't the demo notebook) gets zero rows even if
-- p_notebook_id/p_source_ids match real ids, the same as a plain select
-- would. Those parameters only narrow the search space; RLS is what keeps
-- one user's chunks out of another's results.
--
-- Two candidate legs, each top 20, fused with RRF (constant 60):
--   vector: cosine distance between p_query_embedding and chunks.embedding
--   text:   ts_rank against chunks.fts, query via websearch_to_tsquery('simple', ...)
-- An empty p_query_text (the vector-only mode in lib/retrieval/search.ts)
-- makes the text leg match nothing, so only the vector leg contributes.
-- Returns the top p_k rows by fused score.

create function public.match_chunks(
  p_notebook_id uuid,
  p_source_ids uuid[],
  p_query_embedding vector(768),
  p_query_text text,
  p_k int default 8
)
returns table (
  chunk_id uuid,
  source_id uuid,
  content text,
  page_from integer,
  page_to integer,
  vector_score double precision,
  text_rank double precision,
  fused_score double precision
)
language sql
stable
security invoker
-- Unlike the other functions in this repo, this one can't run with an empty
-- search_path: the vector extension's `<=>` operator isn't in pg_catalog, so
-- resolving it unqualified needs `public` on the path. Table references stay
-- schema-qualified regardless.
set search_path = 'public'
as $$
  with vector_matches as (
    select
      c.id,
      c.source_id,
      c.content,
      c.page_from,
      c.page_to,
      1 - (c.embedding <=> p_query_embedding) as vector_score,
      row_number() over (order by c.embedding <=> p_query_embedding) as rank
    from public.chunks c
    where c.notebook_id = p_notebook_id
      and c.source_id = any(p_source_ids)
      and c.embedding is not null
    order by c.embedding <=> p_query_embedding
    limit 20
  ),
  text_matches as (
    select
      c.id,
      c.source_id,
      c.content,
      c.page_from,
      c.page_to,
      ts_rank(c.fts, websearch_to_tsquery('simple', p_query_text)) as text_rank,
      row_number() over (
        order by ts_rank(c.fts, websearch_to_tsquery('simple', p_query_text)) desc
      ) as rank
    from public.chunks c
    where c.notebook_id = p_notebook_id
      and c.source_id = any(p_source_ids)
      and p_query_text <> ''
      and c.fts @@ websearch_to_tsquery('simple', p_query_text)
    order by text_rank desc
    limit 20
  ),
  fused as (
    select
      coalesce(v.id, t.id) as chunk_id,
      coalesce(v.source_id, t.source_id) as source_id,
      coalesce(v.content, t.content) as content,
      coalesce(v.page_from, t.page_from) as page_from,
      coalesce(v.page_to, t.page_to) as page_to,
      v.vector_score,
      t.text_rank,
      coalesce(1.0 / (60 + v.rank), 0.0) + coalesce(1.0 / (60 + t.rank), 0.0) as fused_score
    from vector_matches v
    full outer join text_matches t on t.id = v.id
  )
  select chunk_id, source_id, content, page_from, page_to, vector_score, text_rank, fused_score
  from fused
  order by fused_score desc
  limit greatest(p_k, 0)
$$;

revoke execute on function public.match_chunks(uuid, uuid[], vector, text, int)
  from public, anon;
grant execute on function public.match_chunks(uuid, uuid[], vector, text, int)
  to authenticated;
