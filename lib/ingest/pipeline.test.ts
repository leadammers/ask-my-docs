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

// The embedding call is replaced so a test can see the deadline the pipeline
// hands it; the SDK itself is exercised in lib/ai/embeddings.test.ts.
const { embedDocumentsMock } = vi.hoisted(() => ({ embedDocumentsMock: vi.fn() }));

vi.mock('@/lib/ai/embeddings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/embeddings')>();
  return { ...actual, embedDocuments: (...args: unknown[]) => embedDocumentsMock(...args) };
});

const SOURCE: IngestSource = {
  id: '11111111-1111-4111-8111-111111111111',
  notebookId: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333',
};

const CONTEXT: AiCallContext = { requestId: 'req-test', userId: SOURCE.userId };

type SourceUpdate = Record<string, unknown>;

type ErrorResult = { error: null };
/** What the pipeline expects back from an `eq()`-terminated write. */
type ErrorQuery = { eq: () => Promise<ErrorResult> };
/** The slice of the client the pipeline calls, so the mock is typed as it is shaped. */
type FakeTable = {
  delete: () => ErrorQuery;
  update: (payload: SourceUpdate) => ErrorQuery;
  insert: (payload: unknown) => Promise<ErrorResult>;
};
type Progress = { stage?: string } | null | undefined;

/** Records what the pipeline writes, so a test can assert on the stages it reached. */
function fakeClient(
  sourceUpdates: SourceUpdate[],
  chunkInserts: unknown[],
): SupabaseClient<Database> {
  const noError: ErrorResult = { error: null };
  const client = {
    from: (table: string): FakeTable => ({
      delete: (): ErrorQuery => ({ eq: async (): Promise<ErrorResult> => noError }),
      update: (payload: SourceUpdate): ErrorQuery => {
        if (table === 'sources') sourceUpdates.push(payload);
        return { eq: async (): Promise<ErrorResult> => noError };
      },
      insert: async (payload: unknown): Promise<ErrorResult> => {
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
    .map((update: SourceUpdate): Progress => update.progress as Progress)
    .filter((progress: Progress): boolean => progress != null)
    .map((progress: Progress): string => progress?.stage ?? '');
}

afterEach((): void => {
  vi.restoreAllMocks();
});

describe('runIngest extracted-text budget', (): void => {
  it('fails the source before chunking or embedding when the text exceeds the budget', async (): Promise<void> => {
    // The AI SDK is never reached: this is the embedding-quota guard, so a
    // failed assertion here must not depend on a model call being attempted.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sourceUpdates: SourceUpdate[] = [];
    const chunkInserts: unknown[] = [];
    const pages: PageText[] = [{ page: 1, text: 'a'.repeat(MAX_EXTRACTED_CHARS + 1) }];

    await runIngest(
      fakeClient(sourceUpdates, chunkInserts),
      SOURCE,
      async (): Promise<PageText[]> => pages,
      CONTEXT,
    );

    expect(chunkInserts).toEqual([]);
    expect(stages(sourceUpdates)).toEqual(['extracting']);
    expect(sourceUpdates.at(-1)).toMatchObject({
      status: 'failed',
      progress: null,
      error: userMessage('too_much_text'),
    });
  });
});

describe('runIngest embedding deadline', (): void => {
  it('hands the deadline it was given to each embedding batch', async (): Promise<void> => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    embedDocumentsMock.mockResolvedValue([[0.5], [0.6]]);
    const sourceUpdates: SourceUpdate[] = [];
    const chunkInserts: unknown[] = [];
    const pages: PageText[] = [
      { page: 1, text: 'alpha '.repeat(400) },
      { page: 2, text: 'beta '.repeat(400) },
    ];
    const deadlineMs = Date.now() + 240_000;

    await runIngest(
      fakeClient(sourceUpdates, chunkInserts),
      SOURCE,
      async (): Promise<PageText[]> => pages,
      CONTEXT,
      deadlineMs,
    );

    // Every batch is bounded by the same deadline, so the run can still write its
    // outcome inside the route's budget instead of being killed mid-retry.
    expect(embedDocumentsMock).toHaveBeenCalledWith(expect.any(Array), CONTEXT, { deadlineMs });
    expect(sourceUpdates.at(-1)).toMatchObject({ status: 'ready' });
  });
});
