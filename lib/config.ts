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

// Ingestion (docs/architecture.md §4.1). Tokens are estimated as chars / 4.
export const CHUNK_TARGET_TOKENS = 800;
export const CHUNK_OVERLAP_TOKENS = 120;
export const CHUNK_MIN_CHARS = 50;
export const MIN_EXTRACTED_CHARS = 200;
export const MAX_PDF_PAGES = 300;
export const CHUNK_INSERT_BATCH_SIZE = 100;
export const SOURCE_TITLE_MAX_LENGTH = 200;
