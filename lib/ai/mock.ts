import 'server-only';
import { simulateReadableStream } from 'ai';
import { MockEmbeddingModelV4, MockLanguageModelV4 } from 'ai/test';

// Deterministic stand-ins for E2E tests and CI (AI_PROVIDER=mock). lib/env.ts
// refuses this provider in Vercel production.

export const MOCK_ANSWER = 'According to your sources, this is a mock answer [1].';

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same text → same unit-length vector, so retrieval in E2E tests is stable. */
export function hashEmbedding(text: string, dimensions: number): number[] {
  const random = mulberry32(fnv1a(text));
  const vector = Array.from({ length: dimensions }, () => random() * 2 - 1);
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: {
    total: countWords(MOCK_ANSWER),
    text: countWords(MOCK_ANSWER),
    reasoning: undefined,
  },
};

export function mockChatModel(modelId: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId,
    doGenerate: async () => ({
      content: [{ type: 'text', text: MOCK_ANSWER }],
      finishReason: { unified: 'stop', raw: undefined },
      usage,
      warnings: [],
    }),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 'text-1' },
          ...MOCK_ANSWER.split(/(?<= )/).map((delta) => ({
            type: 'text-delta' as const,
            id: 'text-1',
            delta,
          })),
          { type: 'text-end', id: 'text-1' },
          { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage },
        ],
      }),
    }),
  });
}

export function mockEmbeddingModel(modelId: string, dimensions: number): MockEmbeddingModelV4 {
  return new MockEmbeddingModelV4({
    provider: 'mock',
    modelId,
    maxEmbeddingsPerCall: null,
    doEmbed: async ({ values }) => ({
      embeddings: values.map((value) => hashEmbedding(value, dimensions)),
      usage: { tokens: values.reduce((sum, value) => sum + countWords(value), 0) },
      warnings: [],
    }),
  });
}
