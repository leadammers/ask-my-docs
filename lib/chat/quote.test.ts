import { describe, expect, it } from 'vitest';
import { buildCitationMap } from '@/lib/chat/prompt';
import { extractCitationQuote } from '@/lib/chat/quote';
import type { RetrievedChunk } from '@/lib/retrieval/search';

const OPENING = 'Introduction to the annual report.';
// Long enough that the question's sentence sits well past the top of the chunk, as
// it does in a real 800-token chunk.
const CONTEXT =
  'This document covers the third quarter of the year, the two quarters preceding it, and a short methodological note. It also lists the underlying figures, the assumptions behind them, and every correction applied since the previous edition of the report was circulated to the board.';
const RELEVANT = 'Revenue grew by 12 percent, driven by the enterprise segment.';
const AFTER = 'Costs stayed flat over the same period.';
const TAIL = 'Outlook remains cautious for the coming year.';

const CHUNK = `${OPENING} ${CONTEXT}\n\n${RELEVANT} ${AFTER}\n\n${TAIL}`;

function chunkWith(content: string): RetrievedChunk {
  return {
    chunkId: 'chunk-1',
    sourceId: 'source-1',
    sourceTitle: 'Annual report',
    content,
    pageFrom: 1,
    pageTo: 1,
    vectorScore: 0.9,
    textRank: null,
    fusedScore: 1,
  };
}

describe('extractCitationQuote', () => {
  it('quotes the sentence that answers the question, not the top of the chunk', () => {
    expect(extractCitationQuote(CHUNK, 'How did revenue develop?')).toBe(RELEVANT);
  });

  it('does not trim the sentence to a display-sized budget', () => {
    // A whole sentence, far longer than a tooltip could show. The tooltip clamps
    // what it displays; the stored quote stays the passage the answer came from.
    const longSentence = `Alpha ${'beta '.repeat(240)}gamma.`;

    expect(extractCitationQuote(longSentence, 'gamma')).toBe(longSentence);
  });

  it('starts at the top of the chunk when the question matches nothing in it', () => {
    expect(extractCitationQuote(CHUNK, 'Wer gewann die Fussballweltmeisterschaft?')).toBe(OPENING);
  });

  it('does not stop at an abbreviation that ends no sentence', () => {
    const content = 'See Fig. 3 for details. Revenue rose sharply in April.';

    // A boundary scan that trusted every "." would return "Fig. 3 for details."
    expect(extractCitationQuote(content, 'details')).toBe('See Fig. 3 for details.');
  });

  it('returns text with no sentence end whole', () => {
    const wall = 'alpha '.repeat(80);

    expect(extractCitationQuote(wall, 'alpha')).toBe(wall.trim());
  });

  it('returns a short chunk whole', () => {
    expect(extractCitationQuote('Short and sweet.', 'sweet')).toBe('Short and sweet.');
  });

  it('returns an empty quote for empty content', () => {
    expect(extractCitationQuote('', 'anything')).toBe('');
    expect(extractCitationQuote('   \n  ', 'anything')).toBe('');
  });
});

describe('buildCitationMap', () => {
  it('quotes the passage the question asked about', () => {
    const [citation] = buildCitationMap([chunkWith(CHUNK)], 'How did revenue develop?');

    expect(citation?.quote).toBe(RELEVANT);
  });
});
