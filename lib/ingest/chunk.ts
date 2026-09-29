import { CHUNK_MIN_CHARS, CHUNK_OVERLAP_TOKENS, CHUNK_TARGET_TOKENS } from '@/lib/config';
import type { Chunk, PageText } from '@/lib/ingest/types';

/** Rough token estimate for the whole ingestion path: one token per four characters. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type ChunkOptions = {
  targetTokens?: number;
  overlapTokens?: number;
  minChars?: number;
};

/** A unit is the smallest piece a chunk is built from: a paragraph, sentence or cut. */
type Unit = {
  text: string;
  page: number;
};

const CHARS_PER_TOKEN = 4;
const UNIT_SEPARATOR = '\n\n';
const BLANK_LINE = /\n{2,}/;
const RUNS_OF_SPACE = /[ \t]+/g;
const RUNS_OF_NEWLINE = /\n{3,}/g;
const SENTENCE = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;

function normalisePageText(text: string): string {
  const withoutCarriageReturns = text.replace(/\r\n/g, '\n');
  const singleSpaced = withoutCarriageReturns.replace(RUNS_OF_SPACE, ' ');
  const trimmedLines = singleSpaced
    .split('\n')
    .map((textLine: string) => textLine.trim())
    .join('\n');
  return trimmedLines.replace(RUNS_OF_NEWLINE, '\n\n').trim();
}

function splitParagraphs(text: string): string[] {
  return text
    .split(BLANK_LINE)
    .map((paragraph: string) => paragraph.trim())
    .filter((paragraph: string) => paragraph.length > 0);
}

function splitSentences(paragraph: string): string[] {
  const matches = paragraph.match(SENTENCE);
  if (matches === null) return [];
  return matches
    .map((sentence: string) => sentence.trim())
    .filter((sentence: string) => sentence.length > 0);
}

/** Cuts text into pieces of at most maxChars, preferring the last word boundary. */
function hardCut(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    const lastSpace = rest.slice(0, maxChars).lastIndexOf(' ');
    let cutAt = maxChars;
    if (lastSpace > 0) cutAt = lastSpace;
    const piece = rest.slice(0, cutAt).trim();
    if (piece.length > 0) pieces.push(piece);
    rest = rest.slice(cutAt).trim();
  }
  if (rest.length > 0) pieces.push(rest);
  return pieces;
}

function splitIntoUnits(text: string, page: number, targetChars: number): Unit[] {
  const units: Unit[] = [];
  for (const paragraph of splitParagraphs(text)) {
    if (paragraph.length <= targetChars) {
      units.push({ text: paragraph, page });
      continue;
    }
    let sentences = splitSentences(paragraph);
    if (sentences.length === 0) sentences = [paragraph];
    for (const sentence of sentences) {
      if (sentence.length <= targetChars) {
        units.push({ text: sentence, page });
        continue;
      }
      for (const piece of hardCut(sentence, targetChars)) {
        units.push({ text: piece, page });
      }
    }
  }
  return units;
}

function unitText(units: readonly Unit[]): string {
  return units.map((unit: Unit) => unit.text).join(UNIT_SEPARATOR);
}

function unitLength(units: readonly Unit[]): number {
  if (units.length === 0) return 0;
  const characters = units.reduce((total: number, unit: Unit) => total + unit.text.length, 0);
  return characters + UNIT_SEPARATOR.length * (units.length - 1);
}

/**
 * The tail of a finished chunk that seeds the next one: whole trailing units that
 * fit the overlap, or the end of a single unit too long to fit.
 */
function buildOverlap(units: readonly Unit[], overlapChars: number): Unit[] {
  if (overlapChars <= 0) return [];
  const newestFirst = [...units].reverse();
  const tail: Unit[] = [];
  let tailChars = 0;
  for (const unit of newestFirst) {
    let separatorChars = 0;
    if (tail.length > 0) separatorChars = UNIT_SEPARATOR.length;
    if (tailChars + separatorChars + unit.text.length > overlapChars) break;
    tail.unshift(unit);
    tailChars += separatorChars + unit.text.length;
  }
  if (tail.length > 0) return tail;

  const lastUnit = newestFirst[0];
  if (lastUnit === undefined) return [];
  const rawTail = lastUnit.text.slice(-overlapChars);
  const firstSpace = rawTail.indexOf(' ');
  let text = rawTail;
  if (firstSpace >= 0) text = rawTail.slice(firstSpace + 1);
  return [{ text, page: lastUnit.page }];
}

type PendingChunk = {
  content: string;
  pageFrom: number;
  pageTo: number;
};

function toPendingChunk(units: readonly Unit[]): PendingChunk {
  return {
    content: unitText(units).trim(),
    pageFrom: Math.min(...units.map((unit: Unit) => unit.page)),
    pageTo: Math.max(...units.map((unit: Unit) => unit.page)),
  };
}

/** Splits pages of text into overlapping chunks of roughly `targetTokens` tokens. */
export function chunkPages(pages: readonly PageText[], options: ChunkOptions = {}): Chunk[] {
  const targetChars = (options.targetTokens ?? CHUNK_TARGET_TOKENS) * CHARS_PER_TOKEN;
  const overlapChars = (options.overlapTokens ?? CHUNK_OVERLAP_TOKENS) * CHARS_PER_TOKEN;
  const minChars = options.minChars ?? CHUNK_MIN_CHARS;

  const units = pages.flatMap((page: PageText) =>
    splitIntoUnits(normalisePageText(page.text), page.page, targetChars),
  );

  const kept: PendingChunk[] = [];
  let current: Unit[] = [];

  const keep = (chunkUnits: readonly Unit[]): void => {
    if (chunkUnits.length === 0) return;
    const chunk = toPendingChunk(chunkUnits);
    if (chunk.content.length < minChars) return;
    kept.push(chunk);
  };

  for (const unit of units) {
    if (current.length > 0 && unitLength([...current, unit]) > targetChars) {
      const finished = current;
      keep(finished);
      current = [...buildOverlap(finished, overlapChars), unit];
    } else {
      current = [...current, unit];
    }
  }
  keep(current);

  return kept.map((chunk: PendingChunk, ordinal: number) => ({
    ordinal,
    content: chunk.content,
    pageFrom: chunk.pageFrom,
    pageTo: chunk.pageTo,
    tokenCount: estimateTokens(chunk.content),
  }));
}
