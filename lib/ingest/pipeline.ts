import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { embedDocuments, toBatches, type AiCallContext } from '@/lib/ai/embeddings';
import { CHUNK_INSERT_BATCH_SIZE, EMBED_BATCH_SIZE, MAX_EXTRACTED_CHARS } from '@/lib/config';
import { AppError, userMessage, type ErrorCode } from '@/lib/errors';
import { chunkPages } from '@/lib/ingest/chunk';
import type { Chunk, PageText } from '@/lib/ingest/types';
import type { SourceProgress } from '@/lib/sources';
import type { Database, Json } from '@/lib/supabase/types';

/** Service-role client: the caller has verified ownership and claimed the source. */
type IngestClient = SupabaseClient<Database>;

export type IngestSource = { id: string; notebookId: string; userId: string };

/** Source-kind specific: returns the text per page (non-PDFs are a single page 1). */
export type Extractor = () => Promise<PageText[]>;

/**
 * Runs extract → chunk → embed → store for a source the caller has already
 * claimed (status `processing`). Always ends in `ready` or `failed`; expected
 * failures store their user message on the row, never raw error details.
 */
export async function runIngest(
  supabase: IngestClient,
  source: IngestSource,
  extract: Extractor,
  context: AiCallContext,
  /**
   * Absolute epoch ms past which no further quota wait may start (lib/ai/retry.ts),
   * computed by the route from its own invocation budget. Omitted by a caller that
   * has no such budget, which then gets the unbounded wait.
   */
  deadlineMs?: number,
): Promise<void> {
  const startedAt = Date.now();
  try {
    // A retry after a partial run must not duplicate passages.
    await check(supabase.from('chunks').delete().eq('source_id', source.id));

    await setProgress(supabase, source.id, { stage: 'extracting' });
    const pages = await extract();

    // Bounds the embedding work one upload can buy while holding a single
    // rate-limit reservation. The adapter caps are per-kind (MAX_PDF_PAGES);
    // this one applies to whatever an extractor returns, and it runs before the
    // first embedding batch rather than after (see lib/config.ts).
    const extractedChars = pages.reduce(
      (total: number, page: PageText) => total + page.text.length,
      0,
    );
    if (extractedChars > MAX_EXTRACTED_CHARS) throw new AppError('too_much_text');

    await setProgress(supabase, source.id, { stage: 'chunking' });
    const chunks = chunkPages(pages);
    if (chunks.length === 0) throw new AppError('no_text');

    const batches = toBatches(chunks, EMBED_BATCH_SIZE);
    const embeddings: number[][] = [];
    for (const [index, batch] of batches.entries()) {
      await setProgress(supabase, source.id, {
        stage: 'embedding',
        done: index,
        total: batches.length,
      });
      const batchEmbeddings = await embedDocuments(
        batch.map((chunk: Chunk) => chunk.content),
        context,
        // Each batch gets its own retry loop, so each needs the same deadline:
        // together they must leave room to write this source's outcome.
        { deadlineMs },
      );
      embeddings.push(...batchEmbeddings);
    }

    await setProgress(supabase, source.id, { stage: 'saving' });
    const rows = chunks.map((chunk: Chunk, index: number) => ({
      source_id: source.id,
      notebook_id: source.notebookId,
      // No auth.uid() under the service role, so the column default can't fill it.
      user_id: source.userId,
      ordinal: chunk.ordinal,
      content: chunk.content,
      page_from: chunk.pageFrom,
      page_to: chunk.pageTo,
      token_count: chunk.tokenCount,
      embedding: JSON.stringify(embeddings[index]),
    }));
    for (const batch of toBatches(rows, CHUNK_INSERT_BATCH_SIZE)) {
      await check(supabase.from('chunks').insert(batch));
    }

    await check(
      supabase
        .from('sources')
        .update({
          status: 'ready',
          progress: null,
          error: null,
          page_count: pages.length,
          char_count: extractedChars,
        })
        .eq('id', source.id),
    );
    logIngest(context, source.id, 'ready', startedAt, {
      pages: pages.length,
      chunks: chunks.length,
    });
  } catch (error: unknown) {
    let code: ErrorCode = 'unexpected';
    if (error instanceof AppError) code = error.code;
    logIngest(context, source.id, 'failed', startedAt, { code, ...errorDetails(error) });
    const { error: updateError } = await supabase
      .from('sources')
      .update({ status: 'failed', progress: null, error: userMessage(code) })
      .eq('id', source.id);
    if (updateError) {
      logIngest(context, source.id, 'failed', startedAt, {
        code: 'status_update_failed',
        dbCode: updateError.code,
      });
    }
  }
}

async function setProgress(
  supabase: IngestClient,
  sourceId: string,
  progress: SourceProgress,
): Promise<void> {
  await check(
    supabase
      .from('sources')
      .update({ progress: progress as Json })
      .eq('id', sourceId),
  );
}

async function check(query: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await query;
  if (error) throw new Error('Database write failed during ingest', { cause: error });
}

/** Error names and DB codes only: messages may quote document content. */
function errorDetails(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) return {};
  const details: Record<string, string> = { errorName: error.name };
  const cause: unknown = error.cause;
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    details.dbCode = String(cause.code);
  }
  return details;
}

// Counts and codes only — never document content (security.md §12).
function logIngest(
  context: AiCallContext,
  sourceId: string,
  outcome: 'ready' | 'failed',
  startedAt: number,
  details: Record<string, string | number>,
): void {
  const line = {
    event: 'ingest',
    requestId: context.requestId,
    userId: context.userId,
    sourceId,
    outcome,
    durationMs: Date.now() - startedAt,
    ...details,
  };
  if (outcome === 'ready') {
    console.log(JSON.stringify({ level: 'info', ...line }));
  } else {
    console.warn(JSON.stringify({ level: 'warn', ...line }));
  }
}
