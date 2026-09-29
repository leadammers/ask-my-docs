/** A sentence end: punctuation, any closing quote or bracket, then whitespace. */
const BOUNDARY = /([.!?]["')\]]*)(\s+)/g;

/** Only these start a sentence — "See Fig. 3" and "No. 4" end none. */
const STARTS_SENTENCE = /[\p{Lu}"'(\[]/u;

/** Question words shorter than this carry no signal ("in", "a", "of"). */
const MIN_TERM_LENGTH = 2;

type Sentence = { start: number; end: number };

function splitSentences(text: string): Sentence[] {
  // Function-local, so the sticky `lastIndex` of a `g` regex cannot leak between calls.
  const boundary = new RegExp(BOUNDARY.source, 'g');
  const sentences: Sentence[] = [];
  let start = 0;
  let match = boundary.exec(text);

  while (match !== null) {
    const punctuation = match[1];
    const whitespace = match[2];

    if (punctuation !== undefined && whitespace !== undefined) {
      const end = match.index + punctuation.length;
      const next = end + whitespace.length;
      const nextChar = text[next];

      if (nextChar === undefined || STARTS_SENTENCE.test(nextChar)) {
        sentences.push({ start, end });
        start = next;
      }
    }

    match = boundary.exec(text);
  }

  sentences.push({ start, end: text.length });
  return sentences;
}

function questionTerms(question: string): string[] {
  const words = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

  return [...new Set(words)].filter((word) => word.length >= MIN_TERM_LENGTH);
}

function scoreSentence(text: string, sentence: Sentence, terms: string[]): number {
  const body = text.slice(sentence.start, sentence.end).toLowerCase();

  return terms.reduce((score, term) => (body.includes(term) ? score + term.length : score), 0);
}

/**
 * The passage a citation should quote: the sentence of `content` that best answers
 * `question`, never a cut-off prefix of the chunk. Overlapping terms are weighted by
 * length so a rare long word beats a common short one, without needing a stopword list.
 *
 * The quote is not trimmed to a display budget — it is the passage the answer came
 * from, and the chip's tooltip clamps what it shows. It always stays a literal
 * substring of the chunk, so `findQuoteRange` can highlight it in the drawer.
 */
export function extractCitationQuote(content: string, question: string): string {
  const text = content.trim();
  if (text.length === 0) {
    return '';
  }

  const terms = questionTerms(question);
  let best: Sentence | undefined;
  let bestScore = 0;

  for (const sentence of splitSentences(text)) {
    const score = scoreSentence(text, sentence, terms);

    if (best === undefined || score > bestScore) {
      best = sentence;
      bestScore = score;
    }
  }

  if (best === undefined) {
    return text;
  }

  return text.slice(best.start, best.end);
}
