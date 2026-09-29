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

/** The header block a PDF page carries, in front of the prose that answers questions. */
const TITLED = [
  'Synthetic Biology Sector',
  'Document ID: ISBR-2026-VOL2',
  'Author: Bio-Engineering Global Insights Group',
  '1. Introduction to Synthetic Biology',
  '',
  'Engineered organisms are grown in closed bioreactors. The EU regulates deliberate release under Directive 2001/18.',
].join('\n');

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

  it('quotes the first body sentence when the question matches nothing in the chunk', () => {
    // The header block and the section heading are not sentence candidates; without
    // that, a question sharing no term with the chunk quotes the document title.
    expect(extractCitationQuote(TITLED, 'Wer gewann die Fussballweltmeisterschaft?')).toBe(
      'Engineered organisms are grown in closed bioreactors.',
    );
  });

  it('matches a query word only where it stands as a whole word', () => {
    const content =
      'Neurobiology reshapes the field.\n\nBiology is regulated by the EU under Directive 2001/18.';

    // "biology" is a substring of "Neurobiology" but not a word of it.
    expect(extractCitationQuote(content, 'What does biology regulation cover?')).toBe(
      'Biology is regulated by the EU under Directive 2001/18.',
    );
  });

  it('ignores query words that nearly every sentence of the chunk shares', () => {
    const content = [
      'The framework is broad.',
      'The scope is narrow.',
      'The EU coordinates the response.',
      'The budget is set annually.',
    ].join('\n\n');

    // "the" and "is" carry no signal here — every sentence has them, so without the
    // frequency filter the earliest sentence wins the tie and the answer is missed.
    expect(extractCitationQuote(content, "What is the EU's role?")).toBe(
      'The EU coordinates the response.',
    );
  });

  it('does not end a sentence at a section number', () => {
    // "1." opens a heading line; a boundary scan that trusted the "." ends a
    // sentence there and hands the header block to the citation as its quote.
    expect(extractCitationQuote(TITLED, 'How is the EU involved?')).toBe(
      'The EU regulates deliberate release under Directive 2001/18.',
    );
  });

  it('does not quote the sentence fragment a chunk starts with', () => {
    // Chunks overlap, so a chunk can open with the tail of a sentence from the one
    // before it — a passage that never stands on its own.
    const content = 'regulations in the EU. The framework does not name a coordinator.';

    expect(extractCitationQuote(content, 'How is the EU involved?')).toBe(
      'The framework does not name a coordinator.',
    );
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
