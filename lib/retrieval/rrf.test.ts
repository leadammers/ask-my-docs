import { describe, expect, it } from 'vitest';
import { rankByScoreDescending, reciprocalRankFusion } from '@/lib/retrieval/rrf';

describe('reciprocalRankFusion', () => {
  it('surfaces an exact-term chunk the vector leg ranks near the bottom, over chunks the text leg never retrieved at all', () => {
    // Same shape as the acceptance criterion: a rare exact term the embedding
    // leg buries at rank 20, but the full-text leg puts it first. c1/c2 rank
    // ahead of it on the vector leg but were never retrieved by FTS at all —
    // absent from a leg scores 0 there, worse than any ranked position.
    const vectorLeg = [
      { id: 'c1', rank: 1 },
      { id: 'c2', rank: 2 },
      { id: 'c3', rank: 20 },
    ];
    const textLeg = [{ id: 'c3', rank: 1 }];

    const scores = reciprocalRankFusion([vectorLeg, textLeg]);

    const byScoreDescending = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    expect(byScoreDescending[0]?.[0]).toBe('c3');
  });

  it('sums 1/(constant + rank) across every leg an item appears in', () => {
    const scores = reciprocalRankFusion([[{ id: 'a', rank: 1 }], [{ id: 'a', rank: 1 }]], 60);
    expect(scores.get('a')).toBeCloseTo(2 / 61, 10);
  });

  it('gives an item only the legs it appears in', () => {
    const scores = reciprocalRankFusion([[{ id: 'a', rank: 1 }], [{ id: 'b', rank: 1 }]], 60);
    expect(scores.get('a')).toBeCloseTo(1 / 61, 10);
    expect(scores.get('b')).toBeCloseTo(1 / 61, 10);
  });
});

describe('rankByScoreDescending', () => {
  it('turns raw scores into 1-based ranks, highest score first', () => {
    expect(rankByScoreDescending([0.2, 0.9, 0.5])).toEqual([
      { id: 1, rank: 1 },
      { id: 2, rank: 2 },
      { id: 0, rank: 3 },
    ]);
  });
});
