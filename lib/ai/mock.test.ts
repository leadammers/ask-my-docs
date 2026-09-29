// @vitest-environment node
import { embedMany, generateText, streamText } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  hashEmbedding,
  mockChatModel,
  mockEmbeddingModel,
  MOCK_ANSWER,
  MOCK_LEAK_ANSWER,
  MOCK_LEAK_TRIGGER,
  MOCK_SLOW_ANSWER,
  MOCK_SLOW_TRIGGER,
} from '@/lib/ai/mock';

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

describe('hashEmbedding', () => {
  it('is deterministic for the same text and dimensions', () => {
    expect(hashEmbedding('hello world', 8)).toEqual(hashEmbedding('hello world', 8));
  });

  it('differs for different texts', () => {
    expect(hashEmbedding('hello', 8)).not.toEqual(hashEmbedding('goodbye', 8));
  });

  it('returns a vector of the requested length', () => {
    expect(hashEmbedding('hello', 12)).toHaveLength(12);
  });

  it('returns a unit-norm vector', () => {
    const vector = hashEmbedding('hello world', 16);
    const norm = Math.hypot(...vector);
    expect(norm).toBeCloseTo(1, 5);
  });
});

describe('mockEmbeddingModel', () => {
  it('returns vectors of the given dimension via embedMany', async () => {
    const { embeddings } = await embedMany({
      model: mockEmbeddingModel('mock-embed', 8),
      values: ['one', 'two', 'three'],
    });

    expect(embeddings).toHaveLength(3);
    for (const embedding of embeddings) {
      expect(embedding).toHaveLength(8);
    }
  });

  it('produces the same embedding as hashEmbedding for the same text', async () => {
    const { embeddings } = await embedMany({
      model: mockEmbeddingModel('mock-embed', 8),
      values: ['same text'],
    });

    expect(embeddings[0]).toEqual(hashEmbedding('same text', 8));
  });
});

describe('mockChatModel', () => {
  it('generateText returns text containing a citation marker', async () => {
    const result = await generateText({ model: mockChatModel('mock-chat'), prompt: 'anything' });
    expect(result.text).toContain('[1]');
    expect(result.text).toBe(MOCK_ANSWER);
  });

  it('streamText yields a concatenated stream containing a citation marker', async () => {
    const result = streamText({ model: mockChatModel('mock-chat'), prompt: 'anything' });

    let text = '';
    for await (const delta of result.textStream) {
      text += delta;
    }

    expect(text).toContain('[1]');
    expect(text).toBe(MOCK_ANSWER);
  });

  it('answers the leak marker with the leak answer', async () => {
    const result = await generateText({
      model: mockChatModel('mock-chat'),
      prompt: `Tell me about ${MOCK_LEAK_TRIGGER}`,
    });

    expect(result.text).toBe(MOCK_LEAK_ANSWER);
  });

  it('answers the slow marker with an answer that streams much longer', async () => {
    const result = await generateText({
      model: mockChatModel('mock-chat'),
      prompt: `Tell me about ${MOCK_SLOW_TRIGGER}`,
    });

    expect(result.text).toBe(MOCK_SLOW_ANSWER);
    // e2e/workspace.spec.ts clicks Stop while this answer is still arriving, and
    // the margin is the whole reason it exists: the mock streams a token per
    // space, so an edit that shortened this back towards MOCK_ANSWER would turn
    // that test into the race it was written to remove.
    expect(wordCount(MOCK_SLOW_ANSWER)).toBeGreaterThanOrEqual(3 * wordCount(MOCK_ANSWER));
  });
});
