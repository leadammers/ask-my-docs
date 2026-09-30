import 'server-only';
import { embed, embedMany } from 'ai';
import { embeddingModel, embeddingProviderOptions } from '@/lib/ai/provider';
import { withRetry } from '@/lib/ai/retry';
import { logUsage } from '@/lib/ai/usage';
import { EMBED_BATCH_SIZE } from '@/lib/config';
import { env } from '@/lib/env';

export type AiCallContext = { requestId: string; userId: string | null };

export function toBatches<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('Batch size must be a positive integer');
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

// The vector(n) column rejects other sizes anyway, but failing here names the
// cause (wrong model or dimension setting) instead of a database error.
function assertDimensions(embeddings: number[][]): number[][] {
  const expected = env.AI_EMBEDDING_DIMENSIONS;
  if (embeddings.some((embedding) => embedding.length !== expected)) {
    throw new Error(`Embedding size does not match AI_EMBEDDING_DIMENSIONS (${expected})`);
  }
  return embeddings;
}

type EmbedDocumentsOptions = {
  /** Texts per request; the pipeline drives batches itself and takes the default. */
  batchSize?: number;
  /** Absolute epoch ms past which no quota wait may start (lib/ai/retry.ts). */
  deadlineMs?: number;
};

/** Embeds document chunks in sequential batches (task type RETRIEVAL_DOCUMENT). */
export async function embedDocuments(
  texts: readonly string[],
  context: AiCallContext,
  { batchSize = EMBED_BATCH_SIZE, deadlineMs }: EmbedDocumentsOptions = {},
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (const batch of toBatches(texts, batchSize)) {
    const startedAt = Date.now();
    const result = await withRetry(
      () =>
        embedMany({
          model: embeddingModel(),
          values: batch,
          maxRetries: 0,
          providerOptions: embeddingProviderOptions('RETRIEVAL_DOCUMENT'),
        }),
      { deadlineMs },
    );
    logUsage({
      ...context,
      operation: 'embed_documents',
      model: env.AI_EMBEDDING_MODEL,
      inputTokens: result.usage.tokens,
      outputTokens: undefined,
      durationMs: Date.now() - startedAt,
    });
    embeddings.push(...result.embeddings);
  }

  return assertDimensions(embeddings);
}

/** Embeds a user question (task type RETRIEVAL_QUERY). */
export async function embedQuery(text: string, context: AiCallContext): Promise<number[]> {
  const startedAt = Date.now();
  const result = await withRetry(
    () =>
      embed({
        model: embeddingModel(),
        value: text,
        maxRetries: 0,
        providerOptions: embeddingProviderOptions('RETRIEVAL_QUERY'),
      }),
    // A reader is waiting on this answer and the chat route is budgeted at 60s,
    // so a spent quota fails fast instead of holding the request for a window.
    { quotaDelayMs: 0 },
  );
  logUsage({
    ...context,
    operation: 'embed_query',
    model: env.AI_EMBEDDING_MODEL,
    inputTokens: result.usage.tokens,
    outputTokens: undefined,
    durationMs: Date.now() - startedAt,
  });
  assertDimensions([result.embedding]);
  return result.embedding;
}
