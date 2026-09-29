import { z } from 'zod';

export const citationSchema = z.object({
  n: z.number().int().positive(),
  chunkId: z.string(),
  sourceId: z.string(),
  sourceTitle: z.string(),
  pageFrom: z.number().nullable(),
  pageTo: z.number().nullable(),
  quote: z.string(),
});
export type Citation = z.infer<typeof citationSchema>;

const CITATION_MARKER = /\[(\d+)\]/g;

/**
 * The one place a page range becomes user-facing text, so the citation chip and
 * the citation drawer can never label the same chunk differently. `pageFrom` is
 * null for sources without pages; an unknown `pageTo` reads as a single page
 * rather than as the literal string "null".
 */
export function formatCitationPages(pageFrom: number | null, pageTo: number | null): string {
  if (pageFrom === null) return '';
  if (pageTo === null || pageTo === pageFrom) return `p. ${pageFrom}`;
  return `p. ${pageFrom}-${pageTo}`;
}

/**
 * Extracts every `[n]` marker used in an answer, validated against the
 * citations actually offered to the model (`available`, keyed by n). Markers
 * for numbers outside that map are dropped: the model invented them, so
 * nothing backs the claim (conventions/security.md §6, "unverified citations").
 */
export function parseUsedCitations(answer: string, available: Citation[]): Citation[] {
  const byNumber = new Map(available.map((citation) => [citation.n, citation]));
  const used = new Map<number, Citation>();

  for (const match of answer.matchAll(CITATION_MARKER)) {
    const n = Number(match[1]);
    if (used.has(n)) continue;
    const citation = byNumber.get(n);
    if (citation) used.set(n, citation);
  }

  return [...used.values()].sort((a, b) => a.n - b.n);
}
