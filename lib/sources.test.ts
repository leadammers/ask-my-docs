import { describe, expect, it } from 'vitest';
import { SOURCE_TITLE_MAX_LENGTH } from '@/lib/config';
import {
  canAddSource,
  createSourceUploadSchema,
  describeProgress,
  formatPageCount,
  isPdfFileName,
  isRetryable,
  maxUploadBytes,
  sourceStoragePath,
  sourceTitleFromFileName,
} from '@/lib/sources';

describe('sourceStoragePath', () => {
  it('builds the path from ids only', () => {
    expect(sourceStoragePath('user-1', 'source-1')).toBe('user-1/source-1.pdf');
  });
});

describe('isPdfFileName', () => {
  it('accepts .pdf in any case', () => {
    expect(isPdfFileName('Report.PDF')).toBe(true);
  });

  it('rejects other extensions', () => {
    expect(isPdfFileName('report.pdf.exe')).toBe(false);
  });
});

describe('sourceTitleFromFileName', () => {
  it('strips the extension', () => {
    expect(sourceTitleFromFileName('Annual Report.pdf')).toBe('Annual Report');
  });

  it('falls back for a bare extension', () => {
    expect(sourceTitleFromFileName('.pdf')).toBe('Untitled PDF');
  });

  it('caps the length', () => {
    expect(sourceTitleFromFileName(`${'a'.repeat(300)}.pdf`)).toHaveLength(SOURCE_TITLE_MAX_LENGTH);
  });
});

describe('createSourceUploadSchema', () => {
  it('rejects a non-uuid notebook id', () => {
    const parsed = createSourceUploadSchema.safeParse({
      notebookId: 'x',
      fileName: 'a.pdf',
      size: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a zero size', () => {
    const parsed = createSourceUploadSchema.safeParse({
      notebookId: '00000000-0000-4000-8000-000000000000',
      fileName: 'a.pdf',
      size: 0,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('limits', () => {
  it('converts megabytes to bytes', () => {
    expect(maxUploadBytes(10)).toBe(10 * 1024 * 1024);
  });

  it('allows adding below the source cap only', () => {
    expect(canAddSource(9, 10)).toBe(true);
    expect(canAddSource(10, 10)).toBe(false);
  });
});

describe('isRetryable', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');

  it('retries failed sources', () => {
    expect(isRetryable('failed', now, now, now)).toBe(true);
  });

  it('retries pending sources only after two minutes', () => {
    expect(isRetryable('pending', new Date('2026-01-01T11:59:00.000Z'), now, now)).toBe(false);
    expect(isRetryable('pending', new Date('2026-01-01T11:57:00.000Z'), now, now)).toBe(true);
  });

  it('never retries ready sources', () => {
    expect(isRetryable('ready', new Date(0), new Date(0), now)).toBe(false);
  });

  it('retries processing sources only once stuck', () => {
    expect(isRetryable('processing', now, new Date('2026-01-01T11:59:00.000Z'), now)).toBe(false);
    expect(isRetryable('processing', now, new Date('2026-01-01T11:53:00.000Z'), now)).toBe(true);
  });
});

describe('describeProgress', () => {
  it('shows embedding counts', () => {
    expect(describeProgress('processing', { stage: 'embedding', done: 3, total: 5 })).toBe(
      'Embedding 3/5…',
    );
  });

  it('falls back for unknown progress', () => {
    expect(describeProgress('processing', { stage: 'nope' })).toBe('Processing…');
  });

  it('is null for finished sources', () => {
    expect(describeProgress('ready', null)).toBeNull();
  });
});

describe('formatPageCount', () => {
  it('uses the singular for one page', () => {
    expect(formatPageCount(1)).toBe('1 page');
  });

  it('uses the plural otherwise', () => {
    expect(formatPageCount(2)).toBe('2 pages');
    expect(formatPageCount(0)).toBe('0 pages');
  });
});
