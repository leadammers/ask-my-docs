import { describe, expect, it } from 'vitest';
import { hasPdfMagic } from '@/lib/ingest/pdf-bytes';

const asBytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('hasPdfMagic', () => {
  it('accepts bytes that start with the PDF magic', () => {
    expect(hasPdfMagic(asBytes('%PDF-1.7\nrest of the file'))).toBe(true);
  });

  it('rejects empty input', () => {
    expect(hasPdfMagic(new Uint8Array())).toBe(false);
  });

  it('rejects other file types', () => {
    expect(hasPdfMagic(asBytes('<html><body>hi</body></html>'))).toBe(false);
  });

  it('rejects a truncated magic', () => {
    expect(hasPdfMagic(asBytes('%PD'))).toBe(false);
  });
});
