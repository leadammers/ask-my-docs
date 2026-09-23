# T06 — Hybrid retrieval (vector + full-text, RRF)

**Mode:** hand-off · **Priority:** P0 · **Depends on:** T05 · **Estimate:** 1h · **Your time:** 10 min

## Goal
Given a notebook, a set of selected sources and a question, return the most relevant chunks using vector and full-text search fused with Reciprocal Rank Fusion.

## Context
`docs/architecture.md` §4.2. `docs/decisions.md` D-06.

## Scope
- Migration: SQL function `match_chunks(p_notebook_id uuid, p_source_ids uuid[], p_query_embedding vector(768), p_query_text text, p_k int default 8)` returning chunk id, source id, content, page_from, page_to, vector score, text rank, fused score
  - vector leg: top 20 by cosine distance
  - text leg: top 20 by `ts_rank` using `websearch_to_tsquery('simple', p_query_text)`
  - RRF with constant 60, return top `p_k`
  - `security invoker` so RLS applies
- `lib/retrieval/search.ts`: `retrieve({ notebookId, sourceIds, question, k })` → embeds the query, calls the RPC, joins source titles, returns typed results
- A `mode` option: `hybrid` (default) | `vector` — needed for the evaluation in T13
- `MIN_VECTOR_SIMILARITY` threshold (env var, default 0.5; add to `lib/env.ts`); `retrieve` reports `hasRelevantContext: boolean`
- Unit test for a TypeScript reference implementation of RRF (used to check the SQL on a fixture)

## Out of scope
Chat, prompts, UI.

## Acceptance criteria
- [ ] For a demo PDF, a question containing an exact rare term returns the chunk with that term in the top 3, even when the vector leg ranks it lower
- [ ] Deselected sources never appear in results
- [ ] Function runs as `security invoker` (RLS respected — another user gets zero rows)
- [ ] `scripts/search.ts "<question>"` (run with `pnpm script`) prints ranked results with both leg scores for manual inspection

## Verification
```bash
pnpm db:reset && pnpm db:types && pnpm db:test
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm script scripts/search.ts "your question"
```

## Notes for the agent
- Filtered HNSW queries (`where notebook_id = …`) can return fewer than the requested rows when many users' chunks share the index. At demo scale this is fine. If the installed pgvector is ≥ 0.8, set `hnsw.iterative_scan = relaxed_order` inside the function; otherwise document it as a known limitation.
- Add a pgTAP test: another user calling `match_chunks` gets zero rows.
