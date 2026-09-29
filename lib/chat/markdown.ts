import type { Citation } from '@/lib/chat/citations';

// Negative lookahead skips a `[n]` that is already a markdown link (`[1](url)`),
// so linkifying never double-wraps existing link syntax.
const CITATION_MARKER = /\[(\d+)\](?!\()/g;

/**
 * Turns validated `[n]` citation markers into markdown links to a synthetic
 * `citation:n` scheme, so `react-markdown`'s own link parsing renders them —
 * no remark/rehype plugin dependency needed. Numbers not in `citations` are
 * left as plain text: the model invented them, so nothing backs the claim
 * (conventions/security.md §6, "unverified citations").
 */
export function linkifyCitations(markdown: string, citations: Citation[]): string {
  const validNumbers = new Set(citations.map((citation) => citation.n));
  return markdown.replace(CITATION_MARKER, (match, digits: string) => {
    const n = Number(digits);
    return validNumbers.has(n) ? `[${n}](citation:${n})` : match;
  });
}
