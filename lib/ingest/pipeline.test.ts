import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_EXTRACTED_CHARS } from '@/lib/config';
import { userMessage } from '@/lib/errors';
import { runIngest, type IngestSource } from '@/lib/ingest/pipeline';
import type { AiCallContext } from '@/lib/ai/embeddings';
import type { PageText } from '@/lib/ingest/types';
import type { Database } from '@/lib/supabase/types';

// The client is injected, so the orchestration (which stage runs, what reaches
// the row) is what these tests exercise; the real client against the local
// stack is covered by the integration suite and E2E.

const SOURCE: IngestSource = {
  id: '11111111-1111-4111-8111-111111111111',
  notebookId: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333',
};

const CONTEXT: AiCallContext = { requestId: 'req-test', userId: SOURCE.userId };

type SourceUpdate = Record<string, unknown>;

/** Records what the pipeline writes, so a test can assert on the stages it reached. */
function fakeClient(
  sourceUpdates: SourceUpdate[],
  chunkInserts: unknown[],
): SupabaseClient<Database> {
  const noError = { error: null };
  const client = {
    from: (table: string) => ({
      delete: () => ({ eq: async () => noError }),
      update: (payload: SourceUpdate) => {
        if (table === 'sources') sourceUpdates.push(payload);
        return { eq: async () => noError };
      },
      insert: async (payload: unknown) => {
        chunkInserts.push(payload);
        return noError;
      },
    }),
  };
  return client as unknown as SupabaseClient<Database>;
}

/** The `stage` of every progress write, in order — one entry per stage reached. */
function stages(sourceUpdates: SourceUpdate[]): string[] {
  return sourceUpdates
    .map((update) => update.progress as { stage?: string } | null | undefined)
    .filter((progress) => progress != null)
    .map((progress) => progress.stage ?? '');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runIngest extracted-text budget', () => {
  it('fails the source before chunking or embedding when the text exceeds the budget', async () => {
    // The AI SDK is never reached: this is the embedding-quota guard, so a
    // failed assertion here must not depend on a model call being attempted.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sourceUpdates: SourceUpdate[] = [];
    const chunkInserts: unknown[] = [];
    const pages: PageText[] = [{ page: 1, text: 'a'.repeat(MAX_EXTRACTED_CHARS + 1) }];

    await runIngest(fakeClient(sourceUpdates, chunkInserts), SOURCE, async () => pages, CONTEXT);

    expect(chunkInserts).toEqual([]);
    expect(stages(sourceUpdates)).toEqual(['extracting']);
    expect(sourceUpdates.at(-1)).toMatchObject({
      status: 'failed',
      progress: null,
      error: userMessage('too_much_text'),
    });
  });
});
