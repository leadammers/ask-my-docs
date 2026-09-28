import { describe, expect, it } from 'vitest';
import { findQuoteRange } from '@/lib/chat/passage';

describe('findQuoteRange', () => {
  it('locates an exact quote', () => {
    const chunk = 'Die Wartung kostet 42.000 EUR laut Plan.';
    expect(findQuoteRange(chunk, 'kostet 42.000 EUR')).toEqual({ start: 12, end: 29 });
  });

  it('locates a quote whose whitespace differs from the chunk', () => {
    const chunk = 'Die Wartung\n  kostet   42.000 EUR\nlaut Plan.';
    // The quote carries the normalised spacing a model would return.
    const range = findQuoteRange(chunk, 'kostet 42.000 EUR laut Plan.');
    if (range === null) throw new Error('expected a match');
    expect(chunk.slice(range.start, range.end)).toBe('kostet   42.000 EUR\nlaut Plan.');
  });

  it('returns null when the quote is not in the chunk', () => {
    expect(findQuoteRange('Ein kurzer Absatz.', 'etwas ganz anderes')).toBeNull();
  });

  it('returns null for an empty or whitespace-only quote', () => {
    expect(findQuoteRange('Ein kurzer Absatz.', '')).toBeNull();
    expect(findQuoteRange('Ein kurzer Absatz.', '   \n  ')).toBeNull();
  });

  it('ignores surrounding whitespace in the quote', () => {
    const chunk = 'Die Wartung kostet 42.000 EUR.';
    expect(findQuoteRange(chunk, '  Wartung kostet  ')).toEqual({ start: 4, end: 18 });
  });

  it('finds the first occurrence when the quote repeats', () => {
    const chunk = 'alpha beta alpha beta';
    expect(findQuoteRange(chunk, 'beta')).toEqual({ start: 6, end: 10 });
  });
});
