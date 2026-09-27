// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashEmbedding } from '@/lib/ai/mock';
import { toBatches, type AiCallContext } from '@/lib/ai/embeddings';

describe('toBatches', () => {
  it('splits evenly sized input into equal batches', () => {
    expect(toBatches([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('puts the remainder in a shorter final batch', () => {
    expect(toBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns no batches for empty input', () => {
    expect(toBatches([], 3)).toEqual([]);
  });

  it('returns a single batch when the size is at least the input length', () => {
    expect(toBatches(['a', 'b'], 10)).toEqual([['a', 'b']]);
  });

  it('throws for a zero batch size', () => {
    expect(() => toBatches([1, 2], 0)).toThrow();
  });

  it('throws for a negative batch size', () => {
    expect(() => toBatches([1, 2], -1)).toThrow();
  });

  it('throws for a non-integer batch size', () => {
    expect(() => toBatches([1, 2], 1.5)).toThrow();
  });
});

// These use the mock provider end-to-end through embedDocuments/embedQuery.
describe('embedDocuments / embedQuery (mock provider)', () => {
  const context: AiCallContext = { requestId: 'req-1', userId: 'user-1' };

  beforeEach(() => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('AI_EMBEDDING_MODEL', 'mock-embed');
    vi.stubEnv('AI_EMBEDDING_DIMENSIONS', '8');
    vi.stubEnv('AI_CHAT_MODEL', 'mock-chat');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('embeds each input, one vector per input, in the configured dimension, order preserved', async () => {
    const { embedDocuments } = await import('@/lib/ai/embeddings');
    const texts = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];

    const embeddings = await embedDocuments(texts, context, 2);

    expect(embeddings).toHaveLength(texts.length);
    texts.forEach((text, index) => {
      expect(embeddings[index]).toHaveLength(8);
      expect(embeddings[index]).toEqual(hashEmbedding(text, 8));
    });
  });

  it('logs a usage line per batch with counts only, never the input text', async () => {
    const { embedDocuments } = await import('@/lib/ai/embeddings');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const texts = ['alpha', 'beta', 'gamma'];

    await embedDocuments(texts, context, 2);

    expect(logSpy.mock.calls.length).toBeGreaterThan(0);
    for (const [line] of logSpy.mock.calls) {
      const parsed = JSON.parse(line as string);
      expect(parsed).toMatchObject({ operation: 'embed_documents', model: 'mock-embed' });
      expect(typeof parsed.inputTokens).toBe('number');
      for (const text of texts) {
        expect(line as string).not.toContain(text);
      }
    }
  });

  it('embeds a query into the configured dimension, matching hashEmbedding', async () => {
    const { embedQuery } = await import('@/lib/ai/embeddings');
    const text = 'what is the capital of france?';

    const embedding = await embedQuery(text, context);

    expect(embedding).toHaveLength(8);
    expect(embedding).toEqual(hashEmbedding(text, 8));
  });

  it('logs a usage line for the query without leaking the question text', async () => {
    const { embedQuery } = await import('@/lib/ai/embeddings');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const text = 'what is the capital of france?';

    await embedQuery(text, context);

    expect(logSpy.mock.calls.length).toBeGreaterThan(0);
    const [line] = logSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ operation: 'embed_query', model: 'mock-embed' });
    expect(typeof parsed.inputTokens).toBe('number');
    expect(line).not.toContain(text);
  });
});
