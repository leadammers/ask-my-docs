import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type AiCallContext, embedQuery } from '@/lib/ai/embeddings';
import { env } from '@/lib/env';
import type { Database } from '@/lib/supabase/types';

export type RetrievalMode = 'hybrid' | 'vector';

export type RetrieveParams = {
  notebookId: string;
  sourceIds: string[];
  question: string;
  k?: number;
  mode?: RetrievalMode;
};

export type RetrievedChunk = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  content: string;
  pageFrom: number | null;
  pageTo: number | null;
  vectorScore: number | null;
  textRank: number | null;
  fusedScore: number;
};

export type RetrieveResult = {
  chunks: RetrievedChunk[];
  hasRelevantContext: boolean;
};

const matchRowSchema = z.object({
  chunk_id: z.string(),
  source_id: z.string(),
  content: z.string(),
  page_from: z.number().nullable(),
  page_to: z.number().nullable(),
  vector_score: z.number().nullable(),
  text_rank: z.number().nullable(),
  fused_score: z.number(),
});

const DEFAULT_K = 8;

/**
 * Retrieves the chunks most relevant to a question, fused from a vector leg
 * and a full-text leg (match_chunks, RRF). `mode: 'vector'` sends an empty
 * query text so only the vector leg contributes — used by T13's evaluation
 * to compare hybrid against vector-only (docs/decisions.md D-06).
 *
 * `client` must be the caller's RLS-scoped client: match_chunks runs
 * `security invoker`, so it only ever returns rows that client can already
 * see through the chunks table's own policies.
 */
export async function retrieve(
  client: SupabaseClient<Database>,
  { notebookId, sourceIds, question, k = DEFAULT_K, mode = 'hybrid' }: RetrieveParams,
  context: AiCallContext,
): Promise<RetrieveResult> {
  if (sourceIds.length === 0) return { chunks: [], hasRelevantContext: false };

  const embedding = await embedQuery(question, context);

  const { data, error } = await client.rpc('match_chunks', {
    p_notebook_id: notebookId,
    p_source_ids: sourceIds,
    p_query_embedding: JSON.stringify(embedding),
    p_query_text: mode === 'hybrid' ? question : '',
    p_k: k,
  });
  if (error) throw new Error('Failed to retrieve chunks', { cause: error });

  const rows = z.array(matchRowSchema).parse(data ?? []);

  const { data: sources, error: sourcesError } = await client
    .from('sources')
    .select('id, title')
    .in('id', sourceIds);
  if (sourcesError) throw new Error('Failed to load source titles', { cause: sourcesError });
  const titleById = new Map((sources ?? []).map((source) => [source.id, source.title]));

  const chunks: RetrievedChunk[] = rows.map((row): RetrievedChunk => ({
    chunkId: row.chunk_id,
    sourceId: row.source_id,
    sourceTitle: titleById.get(row.source_id) ?? 'Untitled',
    content: row.content,
    pageFrom: row.page_from,
    pageTo: row.page_to,
    vectorScore: row.vector_score,
    textRank: row.text_rank,
    fusedScore: row.fused_score,
  }));

  const hasRelevantContext = chunks.some(
    (chunk: RetrievedChunk): boolean => (chunk.vectorScore ?? 0) >= env.MIN_VECTOR_SIMILARITY,
  );

  return { chunks, hasRelevantContext };
}
