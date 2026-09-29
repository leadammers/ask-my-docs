// Enforced in the database by the notebooks_enforce_limit trigger
// (supabase/migrations/20260927140000_notebook_limit.sql) — change both together.
export const MAX_NOTEBOOKS_PER_USER = 5;
export const NOTEBOOK_TITLE_MAX_LENGTH = 200;

/** Texts per embedding request; batches run sequentially to respect free-tier rate limits. */
export const EMBED_BATCH_SIZE = 50;

/** Every AI-calling operation records one `usage_events` row of its kind. */
export const AI_USAGE_KINDS = ['chat', 'ingest', 'guide', 'audio'] as const;
export type AiUsageKind = (typeof AI_USAGE_KINDS)[number];

export const AI_RETRY_ATTEMPTS = 3;
export const AI_RETRY_BASE_DELAY_MS = 500;

export const CHAT_MAX_OUTPUT_TOKENS = 1024;
export const CHAT_QUESTION_MAX_CHARS = 4000;
export const CHAT_MAX_SOURCE_IDS = 10;
/**
 * Ceiling on the assembled context blocks sent to the model, enforced in
 * `buildSystemPrompt`. A normal retrieval is `DEFAULT_K` (8) chunks of at most
 * `CHUNK_TARGET_TOKENS` (~3.2k chars) — about 26k — so this only bites on a
 * retrieval that is pathological rather than typical. Chunk content is bounded
 * at write time, so this is the second of the two bounds, not the only one.
 */
export const CHAT_MAX_CONTEXT_CHARS = 40_000;

// Ingestion (docs/architecture.md §4.1). Tokens are estimated as chars / 4.
export const CHUNK_TARGET_TOKENS = 800;
export const CHUNK_OVERLAP_TOKENS = 120;
export const CHUNK_MIN_CHARS = 50;
export const MIN_EXTRACTED_CHARS = 200;
export const MAX_PDF_PAGES = 300;
/**
 * Ceiling on the extracted text of one source, enforced in `runIngest` before
 * chunking, so a single upload cannot turn into an unbounded run of embedding
 * batches under one rate-limit reservation. `MAX_PDF_PAGES` already allows
 * roughly this much (300 dense pages ≈ 900k chars), so the limit sits just
 * above what the page cap permits and only catches the outlier: a PDF small in
 * bytes and pages that expands into far more text than its size suggests.
 * ~1M chars is a few hundred chunks, i.e. single-digit `EMBED_BATCH_SIZE`
 * batches.
 */
export const MAX_EXTRACTED_CHARS = 1_000_000;
export const CHUNK_INSERT_BATCH_SIZE = 100;
export const SOURCE_TITLE_MAX_LENGTH = 200;

/** Anonymous users are deleted after this many days without a visit (T08b). */
export const RETENTION_DAYS = 30;
/** Users deleted per cron run at most; the next daily run continues. */
export const RETENTION_BATCH_SIZE = 100;
/**
 * How long a claimed user is left alone before another attempt. Shorter than
 * the cron interval (daily), so a user whose cleanup failed is retried on the
 * next run instead of being blocked for a day; far longer than the route's
 * maxDuration, so an overlapping or retried run cannot pick up a user whose
 * files are already being removed.
 */
export const RETENTION_RETRY_AFTER = '20 hours';
/** Cookie that marks "last_seen_at already touched today" for this browser. */
export const LAST_SEEN_COOKIE = 'last_seen_touch';
