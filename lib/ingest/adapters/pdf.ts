import 'server-only';
import { extractText, getDocumentProxy } from 'unpdf';
import { MAX_PDF_PAGES, MIN_EXTRACTED_CHARS } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { hasPdfMagic } from '@/lib/ingest/pdf-bytes';
import type { PageText } from '@/lib/ingest/types';

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

/** Text of every page of a PDF, in page order. */
export async function extractPdfPages(bytes: Uint8Array): Promise<PageText[]> {
  if (!hasPdfMagic(bytes)) throw new AppError('invalid_pdf');

  const document = await openDocument(bytes);
  try {
    if (document.numPages > MAX_PDF_PAGES) throw new AppError('too_many_pages');
    const { text } = await extractText(document, { mergePages: false });
    const extractedChars = text.reduce((total, pageText) => total + pageText.trim().length, 0);
    if (extractedChars < MIN_EXTRACTED_CHARS) throw new AppError('scanned_pdf');
    return text.map((pageText, index) => ({ page: index + 1, text: pageText }));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('invalid_pdf', { cause: error });
  } finally {
    // A cleanup failure must not replace the real outcome (e.g. scanned_pdf).
    try {
      await document.loadingTask.destroy();
    } catch {
      // Nothing to recover; the document is garbage-collected anyway.
    }
  }
}

async function openDocument(bytes: Uint8Array): Promise<PdfDocument> {
  try {
    // pdf.js may take ownership of the buffer, so hand it a copy.
    return await getDocumentProxy(bytes.slice());
  } catch (cause) {
    throw new AppError('invalid_pdf', { cause });
  }
}
