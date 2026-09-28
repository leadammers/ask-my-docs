import { describe, expect, it } from 'vitest';
import { linkifyCitations } from '@/lib/chat/markdown';
import type { Citation } from '@/lib/chat/citations';

function citation(n: number): Citation {
  return {
    n,
    chunkId: `chunk-${n}`,
    sourceId: `source-${n}`,
    sourceTitle: `Source ${n}`,
    pageFrom: 1,
    pageTo: 1,
    quote: 'quote',
  };
}

describe('linkifyCitations', () => {
  it('links a valid citation marker', () => {
    expect(linkifyCitations('The sky is blue [1].', [citation(1)])).toBe(
      'The sky is blue [1](citation:1).',
    );
  });

  it('leaves an out-of-range marker untouched', () => {
    expect(linkifyCitations('Unsupported claim [5].', [citation(1)])).toBe(
      'Unsupported claim [5].',
    );
  });

  it('links multiple valid markers', () => {
    expect(linkifyCitations('[1] and [2]', [citation(1), citation(2)])).toBe(
      '[1](citation:1) and [2](citation:2)',
    );
  });

  it('does not double-wrap a marker that is already a markdown link', () => {
    expect(linkifyCitations('See [1](https://example.com).', [citation(1)])).toBe(
      'See [1](https://example.com).',
    );
  });

  it('returns the text unchanged when there are no citations', () => {
    expect(linkifyCitations('No markers here.', [])).toBe('No markers here.');
  });
});
