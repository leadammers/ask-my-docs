/**
 * Reciprocal Rank Fusion: combines several ranked lists into one score per
 * item, weighting rank 1 in any leg far above a middling rank in all of
 * them. Mirrors the SQL in match_chunks (constant 60) so a fixture can
 * check the two against each other (docs/decisions.md D-06).
 */

export type RankedItem<Id> = { id: Id; rank: number };

const DEFAULT_RRF_CONSTANT = 60;

export function reciprocalRankFusion<Id>(
  legs: readonly RankedItem<Id>[][],
  constant: number = DEFAULT_RRF_CONSTANT,
): Map<Id, number> {
  const scores = new Map<Id, number>();
  for (const leg of legs) {
    for (const { id, rank } of leg) {
      const previous = scores.get(id) ?? 0;
      scores.set(id, previous + 1 / (constant + rank));
    }
  }
  return scores;
}

export function rankByScoreDescending(scores: number[]): RankedItem<number>[] {
  return scores
    .map((score, index): { index: number; score: number } => ({ index, score }))
    .sort((a: { score: number }, b: { score: number }): number => b.score - a.score)
    .map(({ index }, position): RankedItem<number> => ({ id: index, rank: position + 1 }));
}
