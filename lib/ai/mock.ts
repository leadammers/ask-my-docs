import 'server-only';
import { simulateReadableStream } from 'ai';
import { MockEmbeddingModelV4, MockLanguageModelV4 } from 'ai/test';

type Prompt = Parameters<MockLanguageModelV4['doStream']>[0]['prompt'];

// Deterministic stand-ins for E2E tests and CI (AI_PROVIDER=mock). lib/env.ts
// refuses this provider in Vercel production.

/**
 * Time between two streamed tokens. `simulateReadableStream` emits instantly by
 * default, which makes the answer land in a single render: nothing can observe
 * the stream while it is in flight, so streaming-only behaviour (the stop
 * button, a tab switch mid-answer) is untestable and the mock never exercises
 * the code path a real provider does. Ten tokens at this delay is about a
 * second and a half — slow enough to observe, quick enough to not slow the
 * suite down.
 */
const STREAM_CHUNK_DELAY_MS = 150;

export const MOCK_ANSWER = 'According to your sources, this is a mock answer [1].';

// A question containing this marker makes the mock model answer with an
// injected image markdown link, so E2E can assert the client never turns it
// into a network request (conventions/security.md §9) without needing a real
// provider to reproduce an attacker-controlled source.
export const MOCK_LEAK_TRIGGER = 'mock-leak-test';
export const MOCK_LEAK_ANSWER =
  'Here is what your source says [1]: ![x](https://example.com/leak?q=test)';

function lastUserQuestion(prompt: Prompt): string {
  const lastUserMessage = [...prompt].reverse().find((message) => message.role === 'user');
  if (!lastUserMessage) return '';
  return lastUserMessage.content
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

function answerFor(prompt: Prompt): string {
  return lastUserQuestion(prompt).includes(MOCK_LEAK_TRIGGER) ? MOCK_LEAK_ANSWER : MOCK_ANSWER;
}

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

function usageFor(answer: string) {
  return {
    inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: countWords(answer), text: countWords(answer), reasoning: undefined },
  };
}

export function mockChatModel(modelId: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId,
    doGenerate: async ({ prompt }) => {
      const answer = answerFor(prompt);
      return {
        content: [{ type: 'text', text: answer }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: usageFor(answer),
        warnings: [],
      };
    },
    doStream: async ({ prompt }) => {
      const answer = answerFor(prompt);
      return {
        stream: simulateReadableStream({
          chunkDelayInMs: STREAM_CHUNK_DELAY_MS,
          chunks: [
            { type: 'text-start', id: 'text-1' },
            ...answer.split(/(?<= )/).map((delta) => ({
              type: 'text-delta' as const,
              id: 'text-1',
              delta,
            })),
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: undefined },
              usage: usageFor(answer),
            },
          ],
        }),
      };
    },
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
