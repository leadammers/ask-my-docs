# T05 — PDF upload and ingestion pipeline

**Mode:** hand-off · **Priority:** P0 · **Depends on:** T03, T04 · **Estimate:** 2.25h · **Your time:** 5 min (diff review)

## Goal
A user uploads a PDF into a notebook; it becomes searchable chunks with page numbers and embeddings, and the UI shows its status live.

## Context
`docs/architecture.md` §4.1. Uploads go directly to Storage — never through a route body.

## Scope
- **Upload flow:**
  1. Server action `createSourceUpload(notebookId, fileName, size)` → validates type (`application/pdf`), size (`MAX_UPLOAD_MB`), source count (`MAX_SOURCES_PER_NOTEBOOK`), creates `sources` row (`pending`), returns a signed upload URL for `sources/{userId}/{sourceId}.pdf`
  2. Browser uploads with the Supabase client `uploadToSignedUrl`
  3. Browser calls `POST /api/sources/[id]/ingest`
- **Pipeline** (`lib/ingest/`):
  - `adapters/pdf.ts`: download from Storage, `unpdf` (approved dependency) → `[{ page, text }]`; if total text < 200 chars → fail with the "scanned PDF" message
  - `chunk.ts`: pure function, ~800 tokens (estimate: chars/4), ~120 overlap; split priority paragraph → sentence → hard cut; track `page_from`/`page_to`; normalise whitespace; drop chunks under 50 chars
  - `pipeline.ts`: status transitions `pending → processing → ready|failed`, writes `progress` (`extracting` → `chunking` → `embedding` done/total → `saving`) after each stage and embedding batch, embeds via `embedDocuments`, inserts chunks in batches, stores `page_count` and `char_count`, catches errors into `sources.error` (readable text)
  - Route sets `export const maxDuration = 300`, checks ownership, applies rate limit `ingest` and the global daily cap
- **UI (minimal, polished in T08):** upload button on the notebook page, list of sources with status badges and the current progress stage ("Embedding 3/5"); poll status + progress every 2s while any source is `pending`/`processing`, per `conventions/code.md` *Streaming and real-time*
- Delete a source: delete the storage object **first**, then the row (cascades chunks) — `conventions/database.md`, Storage
- **Notebook deletion (from T03) now also removes the storage objects of all its sources**, before deleting the row
- **Stuck sources:** a source still `pending` after 2 minutes (e.g. the browser closed before ingest was triggered) shows a "Retry" action that calls the ingest route again
- Verify PDF magic bytes (`%PDF-`) after upload, before extraction
- Unit tests for `chunk.ts`: page tracking across boundaries, overlap, tiny documents, very long paragraphs

## Out of scope
Non-PDF types (T10). Retrieval and chat.

## Acceptance criteria
- [ ] A 20-page text PDF becomes `ready` in under 60s; chunks have correct `page_from`/`page_to` (check 3 by hand)
- [ ] A scanned PDF fails with the readable message; the notebook still works
- [ ] A 15 MB file is rejected before upload
- [ ] Another user cannot trigger ingest on your source (404, per `conventions/security.md` §3)
- [ ] Deleting a notebook leaves no objects under its sources in Storage
- [ ] Chunking unit tests pass

## E2E tests (Playwright, `e2e/`)
- Upload a text PDF fixture → a progress stage is shown, then status goes to `ready`
- Upload the image-only PDF → `failed` with the readable scanned-PDF message; the notebook keeps working
- An oversized file is rejected before upload
- Delete a source; delete the notebook

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```
Manual: upload a text PDF, a scanned PDF, an oversized PDF.

## Notes for the agent
- Keep the chunker a pure function with no I/O — it is the most test-worthy code in the project.
- Keep PDF fixtures under 200 KB in `test/fixtures/`. Generate them with a small script (e.g. `pdf-lib`, dev dependency) if needed: a multi-page text PDF and an image-only PDF.
