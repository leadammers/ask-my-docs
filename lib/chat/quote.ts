/** A sentence end: punctuation, any closing quote or bracket, then whitespace. */
const BOUNDARY = /([.!?]["')\]]*)(\s+)/g;

/** Only these start a sentence — "See Fig. 3" and "No. 4" end none. */
const STARTS_SENTENCE = /[\p{Lu}"'(\[]/u;

/** Question words shorter than this carry no signal ("in", "a", "of"). */
const MIN_TERM_LENGTH = 2;

/** A chunk needs this many candidates before how often a word occurs in it means anything. */
const MIN_CANDIDATES_FOR_FREQUENCY = 3;

/** The text before a heading line's number: "6. Regulatory Milestones". */
const SECTION_NUMBER_LINE = /^[ \t]*\d{1,3}$/;

/** Sentence punctuation, with any closing quote or bracket after it. */
const SENTENCE_END = /[.!?]["')\]]*$/;

/** A chunk opening on a lowercase letter opens on the tail of someone else's sentence. */
const STARTS_MID_SENTENCE = /^\p{Ll}/u;

type Candidate = { start: number; end: number };

type QueryTerm = { word: string; pattern: RegExp };

function trimEndIndex(text: string, end: number): number {
  let index = end;

  while (index > 0 && /\s/.test(text[index - 1] ?? '')) {
    index -= 1;
  }

  return index;
}

function endOfLine(text: string, from: number): number {
  const index = text.indexOf('\n', from);

  return index === -1 ? text.length : index;
}

/** True for the "." of a section number that opens its line, not for one that ends a sentence. */
function isSectionNumber(text: string, dotIndex: number): boolean {
  const lineStart = text.lastIndexOf('\n', dotIndex - 1) + 1;

  return SECTION_NUMBER_LINE.test(text.slice(lineStart, dotIndex));
}

/**
 * Every passage of `text` a citation may quote, in reading order. A section number
 * ends a line rather than a sentence, so the block above it and the heading line
 * itself become candidates of their own — neither reads as a sentence.
 */
function splitCandidates(text: string): Candidate[] {
  // Function-local, so the sticky `lastIndex` of a `g` regex cannot leak between calls.
  const boundary = new RegExp(BOUNDARY.source, 'g');
  const candidates: Candidate[] = [];
  let start = 0;
  let match = boundary.exec(text);

  while (match !== null) {
    const punctuation = match[1];
    const whitespace = match[2];

    if (punctuation !== undefined && whitespace !== undefined) {
      const end = match.index + punctuation.length;

      if (isSectionNumber(text, match.index)) {
        const lineStart = text.lastIndexOf('\n', match.index - 1) + 1;
        const lineEnd = endOfLine(text, match.index);

        candidates.push({ start, end: trimEndIndex(text, lineStart) });
        candidates.push({ start: lineStart, end: lineEnd });
        start = lineEnd;
      } else {
        const next = end + whitespace.length;
        const nextChar = text[next];

        if (nextChar === undefined || STARTS_SENTENCE.test(nextChar)) {
          candidates.push({ start, end });
          start = next;
        }
      }
    }

    match = boundary.exec(text);
  }

  candidates.push({ start, end: text.length });
  return candidates;
}

function endsSentence(text: string, candidate: Candidate): boolean {
  return SENTENCE_END.test(text.slice(candidate.start, candidate.end).trimEnd());
}

/**
 * The candidates a quote may be chosen from: sentences, plus the one passage a
 * chunk of nothing but headings and title lines has to offer. The fragment an
 * overlapping chunk starts with is dropped — it is the tail of a sentence that
 * lives in the chunk before it.
 */
function sentencePool(text: string): Candidate[] {
  const candidates = splitCandidates(text);
  const sentences = candidates.filter((candidate) => endsSentence(text, candidate));
  const pool = sentences.length > 0 ? sentences : candidates;
  const first = pool[0];

  if (
    pool.length > 1 &&
    first !== undefined &&
    STARTS_MID_SENTENCE.test(text.slice(first.start, first.end).trimStart())
  ) {
    return pool.slice(1);
  }

  return pool;
}

/** A term only counts where it stands as a word: "the" is not in "Synthetic". */
function wordPattern(word: string): RegExp {
  // queryTerms builds words out of \p{L}\p{N} only, so nothing here needs escaping.
  return new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, 'iu');
}

function queryTerms(question: string): QueryTerm[] {
  const words = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

  return [...new Set(words)]
    .filter((word) => word.length >= MIN_TERM_LENGTH)
    .map((word) => ({ word, pattern: wordPattern(word) }));
}

/**
 * Drops the terms nearly every candidate shares: in a chunk where "the" and "is"
 * open almost every sentence they score everywhere, and the sentence that actually
 * answers the question loses the tie to whichever sentence came first. Frequency
 * within the chunk needs no stopword list, so it holds for any language.
 */
function discriminativeTerms(text: string, pool: Candidate[], terms: QueryTerm[]): QueryTerm[] {
  if (pool.length < MIN_CANDIDATES_FOR_FREQUENCY) {
    return terms;
  }

  return terms.filter((term) => {
    const shared = pool.filter((candidate) =>
      term.pattern.test(text.slice(candidate.start, candidate.end)),
    ).length;

    return shared * 2 <= pool.length;
  });
}

function scoreCandidate(text: string, candidate: Candidate, terms: QueryTerm[]): number {
  const body = text.slice(candidate.start, candidate.end);

  return terms.reduce(
    (score, term) => (term.pattern.test(body) ? score + term.word.length : score),
    0,
  );
}

/**
 * The passage a citation should quote: the sentence of `content` that best answers
 * `question`, never a cut-off prefix of the chunk. Overlapping terms are weighted by
 * length so a rare long word beats a common short one, and terms the whole chunk
 * shares are dropped before scoring.
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

  const pool = sentencePool(text);
  const terms = discriminativeTerms(text, pool, queryTerms(question));
  let best: Candidate | undefined;
  let bestScore = 0;

  for (const candidate of pool) {
    const score = scoreCandidate(text, candidate, terms);

    if (best === undefined || score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  const chosen = best ?? pool[0];

  if (chosen === undefined) {
    return text;
  }

  return text.slice(chosen.start, chosen.end).trim();
}
