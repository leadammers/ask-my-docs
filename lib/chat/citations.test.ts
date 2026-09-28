import { describe, expect, it } from 'vitest';
import { parseUsedCitations, type Citation } from '@/lib/chat/citations';

function citation(n: number): Citation {
  return {
    n,
    chunkId: `chunk-${n}`,
    sourceId: `source-${n}`,
    sourceTitle: `Source ${n}`,
    pageFrom: n,
    pageTo: n,
    quote: `quote ${n}`,
  };
}

describe('parseUsedCitations', () => {
  it('returns citations for every marker present, in numeric order', () => {
    const available = [citation(1), citation(2), citation(3)];
    const used = parseUsedCitations('This is grounded [2] and also [1].', available);
    expect(used.map((c) => c.n)).toEqual([1, 2]);
  });

  it('drops markers with no matching citation', () => {
    const available = [citation(1)];
    const used = parseUsedCitations('Cited [1] and invented [9].', available);
    expect(used.map((c) => c.n)).toEqual([1]);
  });

  it('deduplicates repeated markers', () => {
    const available = [citation(1)];
    const used = parseUsedCitations('[1] again [1] and again [1].', available);
    expect(used).toHaveLength(1);
  });

  it('ignores malformed or out-of-range markers', () => {
    const available = [citation(1), citation(2)];
    const used = parseUsedCitations('No brackets here, and [0] is out of range.', available);
    expect(used).toHaveLength(0);
  });

  it('returns an empty array when the answer cites nothing', () => {
    expect(parseUsedCitations('No citations at all.', [citation(1)])).toEqual([]);
  });
});
