import { describe, expect, it } from 'vitest';
import { CHUNK_OVERLAP_TOKENS, CHUNK_TARGET_TOKENS } from '@/lib/config';
import { chunkPages, estimateTokens } from '@/lib/ingest/chunk';
import type { Chunk, PageText } from '@/lib/ingest/types';

/** Small budgets keep the fixtures short: 80 chars per chunk, 20 chars of overlap. */
const SMALL = { targetTokens: 20, overlapTokens: 5, minChars: 10 };
const MAX_CHUNK_CHARS = (SMALL.targetTokens + SMALL.overlapTokens) * 4;

function buildParagraphs(count: number): string[] {
  const paragraphs: string[] = [];
  for (let index = 0; index < count; index += 1) {
    paragraphs.push(`Paragraph ${index} covers one topic in enough words to fill a chunk.`);
  }
  return paragraphs;
}

function consecutivePairs(chunks: readonly Chunk[]): { previous: Chunk; current: Chunk }[] {
  const pairs: { previous: Chunk; current: Chunk }[] = [];
  chunks.forEach((current, index) => {
    const previous = chunks[index - 1];
    if (previous !== undefined) pairs.push({ previous, current });
  });
  return pairs;
}

describe('estimateTokens', () => {
  it('counts one token per four characters, rounded up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('chunkPages', () => {
  it('returns nothing for no pages', () => {
    expect(chunkPages([])).toEqual([]);
  });

  it('returns nothing for pages that only hold whitespace', () => {
    expect(chunkPages([{ page: 1, text: '  \n\n\t  ' }])).toEqual([]);
  });

  it('keeps a short page as one chunk with its page number', () => {
    const text = 'Alpha report covers the first quarter in detail today.';

    const chunks = chunkPages([{ page: 4, text }]);

    expect(chunks).toEqual([
      {
        ordinal: 0,
        content: text,
        pageFrom: 4,
        pageTo: 4,
        tokenCount: estimateTokens(text),
      },
    ]);
  });

  it('drops text shorter than the minimum chunk size', () => {
    expect(chunkPages([{ page: 1, text: 'Too short to keep.' }])).toEqual([]);
  });

  it('bounds every chunk, numbers them in order and overlaps neighbours', () => {
    const pages: PageText[] = [{ page: 1, text: buildParagraphs(12).join('\n\n') }];

    const chunks = chunkPages(pages, SMALL);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, index) => expect(chunk.ordinal).toBe(index));
    expect(chunks.every((chunk) => chunk.content.length <= MAX_CHUNK_CHARS)).toBe(true);
    expect(consecutivePairs(chunks).length).toBe(chunks.length - 1);

    for (const { previous, current } of consecutivePairs(chunks)) {
      const [firstPiece] = current.content.split('\n\n');
      expect(firstPiece).toBeDefined();
      expect(previous.content).toContain(firstPiece);
    }
  });

  it('splits one long paragraph without blank lines at sentence boundaries', () => {
    const sentences: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      sentences.push(`Sentence ${index} has a few words.`);
    }

    const chunks = chunkPages([{ page: 1, text: sentences.join(' ') }], SMALL);
    const pieces = chunks.flatMap((chunk) => chunk.content.split('\n\n'));

    expect(chunks.length).toBeGreaterThan(1);
    expect(pieces.every((piece) => piece.endsWith('.'))).toBe(true);
    expect(chunks.map((chunk) => chunk.content).join('\n')).toContain(
      'Sentence 0 has a few words.',
    );
  });

  it('hard-cuts text with no spaces and keeps all of it', () => {
    const word = 'a'.repeat(250);

    const chunks = chunkPages([{ page: 1, text: word }], {
      targetTokens: 25,
      overlapTokens: 0,
      minChars: 10,
    });

    expect(chunks.map((chunk) => chunk.content.length)).toEqual([100, 100, 50]);
    expect(chunks.map((chunk) => chunk.content).join('')).toBe(word);
    expect(chunks.every((chunk) => chunk.pageFrom === 1 && chunk.pageTo === 1)).toBe(true);
  });

  it('loses no text when overlap is off', () => {
    const source = buildParagraphs(30).join(' ');

    const chunks = chunkPages([{ page: 1, text: source }], {
      targetTokens: 25,
      overlapTokens: 0,
      minChars: 1,
    });

    const rebuilt = chunks.map((chunk) => chunk.content).join(' ');

    expect(rebuilt.replace(/\s+/g, ' ')).toBe(source);
  });

  it('keeps a chunk on one page when overlap is off', () => {
    const chunks = chunkPages(
      [
        { page: 1, text: 'Alpha page text that fills a good part of a chunk on its own.' },
        { page: 2, text: 'Beta page text that continues the same topic in more words.' },
      ],
      { ...SMALL, overlapTokens: 0 },
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ pageFrom: 1, pageTo: 1 });
    expect(chunks[1]).toMatchObject({ pageFrom: 2, pageTo: 2 });
  });

  it('reports both pages of a chunk that starts in the overlap of the previous one', () => {
    const chunks = chunkPages(
      [
        { page: 1, text: 'Alpha page text that fills a good part of a chunk on its own.' },
        { page: 2, text: 'Beta page text that continues the same topic in more words.' },
      ],
      SMALL,
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ pageFrom: 1, pageTo: 1 });
    expect(chunks[1]).toMatchObject({ pageFrom: 1, pageTo: 2 });
    expect(chunks.every((chunk) => chunk.pageFrom <= chunk.pageTo)).toBe(true);
  });

  it('normalises carriage returns, runs of spaces and blank lines', () => {
    const chunks = chunkPages(
      [{ page: 1, text: 'Alpha   report.\r\n\r\n\r\n\r\nBeta    findings.' }],
      { minChars: 1 },
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe('Alpha report.\n\nBeta findings.');
  });

  it('builds the same chunks every time', () => {
    const pages: PageText[] = [
      { page: 1, text: buildParagraphs(6).join('\n\n') },
      { page: 2, text: buildParagraphs(6).join('\n\n') },
    ];

    expect(chunkPages(pages, SMALL)).toEqual(chunkPages(pages, SMALL));
  });

  it('uses the configured target and overlap when called without options', () => {
    const sentence = 'This sentence exists to fill the page with words. ';
    const text = sentence.repeat(70);

    const chunks = chunkPages([{ page: 1, text }]);
    const maxChars = (CHUNK_TARGET_TOKENS + CHUNK_OVERLAP_TOKENS) * 4;

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= maxChars)).toBe(true);
  });
});
