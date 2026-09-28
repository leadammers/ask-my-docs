// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { extractPdfPages } from '@/lib/ingest/adapters/pdf';

function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(process.cwd(), 'test', 'fixtures', name)));
}

const asBytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('extractPdfPages', () => {
  it('reads every page of a text PDF in page order', async () => {
    const pages = await extractPdfPages(readFixture('sample.pdf'));

    expect(pages).toHaveLength(2);
    expect(pages[0]?.page).toBe(1);
    expect(pages[0]?.text).toContain('Alpha Report');
    expect(pages[1]?.page).toBe(2);
    expect(pages[1]?.text).toContain('Beta Findings');
  });

  it('rejects a PDF that has no extractable text', async () => {
    const result = extractPdfPages(readFixture('scanned.pdf'));

    await expect(result).rejects.toBeInstanceOf(AppError);
    await expect(result).rejects.toMatchObject({ code: 'scanned_pdf' });
  });

  it('rejects bytes that are not a PDF', async () => {
    const bytes = asBytes('this is not a pdf at all, just a plain text file');

    await expect(extractPdfPages(bytes)).rejects.toMatchObject({ code: 'invalid_pdf' });
  });

  it('rejects bytes that only start like a PDF', async () => {
    const bytes = asBytes('%PDF-garbage');

    await expect(extractPdfPages(bytes)).rejects.toMatchObject({ code: 'invalid_pdf' });
  });
});
