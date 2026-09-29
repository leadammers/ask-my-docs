import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '@/lib/chat/prompt';
import type { Citation } from '@/lib/chat/citations';
import type { RetrievedChunk } from '@/lib/retrieval/search';

function citation(n: number): Citation {
  return {
    n,
    chunkId: `chunk-${n}`,
    sourceId: 'source-1',
    sourceTitle: 'report.pdf',
    pageFrom: n,
    pageTo: n,
    quote: `quote ${n}`,
  };
}

function chunk(n: number): RetrievedChunk {
  return {
    chunkId: `chunk-${n}`,
    sourceId: 'source-1',
    sourceTitle: 'report.pdf',
    content: `content ${n}`,
    pageFrom: n,
    pageTo: n,
    vectorScore: 0.9,
    textRank: 1,
    fusedScore: 0.5,
  };
}

function promptFor(count: number): string {
  const citations = Array.from({ length: count }, (_, index: number) => citation(index + 1));
  return buildSystemPrompt(
    citations,
    citations.map((item: Citation) => chunk(item.n)),
  );
}

describe('buildSystemPrompt', () => {
  it('tells the model which block labels it is allowed to cite', () => {
    const citations = [citation(1), citation(2), citation(3)];

    const prompt = buildSystemPrompt(
      citations,
      citations.map((item: Citation) => chunk(item.n)),
    );
    const range = /\[1\] through \[(\d+)\]/.exec(prompt);

    expect(range?.[1]).toBeDefined();
    expect(Number(range?.[1])).toBe(citations.length);
  });

  it('warns that numbering inside a block is document text, not a citation', () => {
    expect(promptFor(2)).toMatch(/numbering inside a block/i);
  });

  it('labels every block with its number and full content', () => {
    expect(promptFor(2)).toContain('[1] (Source: "report.pdf", p. 1)\ncontent 1');
    expect(promptFor(2)).toContain('[2] (Source: "report.pdf", p. 2)\ncontent 2');
  });
});
