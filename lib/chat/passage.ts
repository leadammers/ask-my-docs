export type QuoteRange = { start: number; end: number };

const WHITESPACE = /\s/;

type CollapsedText = { text: string; sourceIndexes: number[] };

/**
 * Collapses every run of whitespace to one space, keeping a map from each
 * character of the result back to its index in the original string — the
 * mapping is what lets a whitespace-insensitive match report offsets into the
 * chunk the caller still holds.
 */
function collapseWhitespace(text: string): CollapsedText {
  let collapsed = '';
  const sourceIndexes: number[] = [];
  let index = 0;

  while (index < text.length) {
    const character = text[index];
    if (character !== undefined && WHITESPACE.test(character)) {
      let runEnd = index;
      while (runEnd < text.length && WHITESPACE.test(text[runEnd] ?? '')) runEnd += 1;
      collapsed += ' ';
      sourceIndexes.push(index);
      index = runEnd;
      continue;
    }
    collapsed += character;
    sourceIndexes.push(index);
    index += 1;
  }

  return { text: collapsed, sourceIndexes };
}

function rangeFromPositions(
  sourceIndexes: number[],
  start: number,
  length: number,
): QuoteRange | null {
  const startIndex = sourceIndexes[start];
  const endIndex = sourceIndexes[start + length - 1];
  if (startIndex === undefined || endIndex === undefined) return null;
  return { start: startIndex, end: endIndex + 1 };
}

/**
 * Locates `quote` inside `chunkText` and returns the half-open range into
 * `chunkText` — never into a normalised copy, so the caller can slice the
 * original text. An exact match wins; otherwise the comparison retries with
 * runs of whitespace collapsed on both sides, because retrieval and the model
 * routinely reflow the passage they quote. Returns `null` when the quote is
 * absent (an honest "no highlight" beats a fabricated one) or empty.
 */
export function findQuoteRange(chunkText: string, quote: string): QuoteRange | null {
  const trimmedQuote = quote.trim();
  if (trimmedQuote.length === 0) return null;

  const exactStart = chunkText.indexOf(trimmedQuote);
  if (exactStart !== -1) {
    return { start: exactStart, end: exactStart + trimmedQuote.length };
  }

  const chunk = collapseWhitespace(chunkText);
  const needle = collapseWhitespace(trimmedQuote).text.trim();
  if (needle.length === 0) return null;

  const collapsedStart = chunk.text.indexOf(needle);
  if (collapsedStart === -1) return null;

  return rangeFromPositions(chunk.sourceIndexes, collapsedStart, needle.length);
}
