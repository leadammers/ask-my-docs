import { z } from 'zod';
import { SOURCE_TITLE_MAX_LENGTH } from '@/lib/config';

export const SOURCE_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

/** Statuses a source can be (re)claimed from for ingestion. */
export const CLAIMABLE_STATUSES = ['pending', 'failed'] as const satisfies readonly SourceStatus[];

/** A pending source older than this never reached the ingest route (tab closed, network). */
export const STUCK_PENDING_MS = 2 * 60 * 1000;

export const sourceIdSchema = z.uuid();

export const createSourceUploadSchema = z.object({
  notebookId: z.uuid(),
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
});

/** Written to `sources.progress` so the UI can show the current stage. */
export const sourceProgressSchema = z.discriminatedUnion('stage', [
  z.object({ stage: z.literal('extracting') }),
  z.object({ stage: z.literal('chunking') }),
  z.object({ stage: z.literal('embedding'), done: z.number().int(), total: z.number().int() }),
  z.object({ stage: z.literal('saving') }),
]);
export type SourceProgress = z.infer<typeof sourceProgressSchema>;

/** Server-generated so no client-supplied name ever reaches a storage path. */
export function sourceStoragePath(userId: string, sourceId: string): string {
  return `${userId}/${sourceId}.pdf`;
}

export function isPdfFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

export function sourceTitleFromFileName(fileName: string): string {
  const withoutExtension = fileName
    .trim()
    .replace(/\.pdf$/i, '')
    .trim();
  const title = withoutExtension.length > 0 ? withoutExtension : 'Untitled PDF';
  return title.slice(0, SOURCE_TITLE_MAX_LENGTH);
}

export function maxUploadBytes(maxUploadMb: number): number {
  return maxUploadMb * 1024 * 1024;
}

export function canAddSource(existingCount: number, maxSources: number): boolean {
  return existingCount < maxSources;
}

/** Whether the UI offers Retry: failed sources, and pending ones whose ingest never started. */
export function isRetryable(status: SourceStatus, createdAt: Date, now: Date): boolean {
  if (status === 'failed') return true;
  if (status === 'pending') return now.getTime() - createdAt.getTime() > STUCK_PENDING_MS;
  return false;
}

export function isInProgress(status: SourceStatus): boolean {
  return status === 'pending' || status === 'processing';
}

/** Human-readable progress line; `null` when nothing is running. */
export function formatPageCount(pageCount: number): string {
  if (pageCount === 1) return '1 page';
  return `${pageCount} pages`;
}

export function describeProgress(status: SourceStatus, progress: unknown): string | null {
  if (status === 'pending') return 'Waiting to start…';
  if (status !== 'processing') return null;

  const parsed = sourceProgressSchema.safeParse(progress);
  if (!parsed.success) return 'Processing…';

  switch (parsed.data.stage) {
    case 'extracting':
      return 'Extracting text…';
    case 'chunking':
      return 'Splitting into passages…';
    case 'embedding':
      return `Embedding ${parsed.data.done}/${parsed.data.total}…`;
    case 'saving':
      return 'Saving…';
  }
}
