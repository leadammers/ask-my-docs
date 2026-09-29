// Writes the PDF fixtures used by lib/ingest/adapters/pdf.test.ts. The PDFs are
// built by hand (no PDF library) so the fixtures stay small and dependency free.
//   pnpm tsx scripts/make-pdf-fixtures.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = path.join(process.cwd(), 'test', 'fixtures');
const HEADER = '%PDF-1.4\n';

// Every line is padded to this many bytes (newline included). Equal line widths
// keep the byte offsets in the xref table exact without a PDF writer.
const LINE_WIDTH = 100;

type FixturePage = {
  /** Content stream lines; the page text is the text of the `(..) Tj` show operators. */
  lines: string[];
};

const SAMPLE_PAGES: FixturePage[] = [
  {
    lines: [
      'BT /F1 12 Tf 14 TL 72 720 Td',
      '(Alpha Report) Tj',
      'T*',
      '(This report shows that the data does grow each year) Tj',
      'T*',
      '(The team notes steady gains in every quarter so far) Tj',
      'T*',
      '(More detail follows in the second part of this note) Tj',
      'T*',
      '(Readers should treat these numbers as a rough guide) Tj',
      'T*',
      '(A final line keeps this page above the minimum length) Tj',
      'ET',
    ],
  },
  {
    lines: [
      'BT /F1 12 Tf 14 TL 72 720 Td',
      '(Beta Findings) Tj',
      'T*',
      '(This page covers the second half of the same study) Tj',
      'T*',
      '(The numbers here differ from the first page in part) Tj',
      'T*',
      '(Each row of the table lists a month and a count) Tj',
      'T*',
      '(Taken together the two pages tell a simple story) Tj',
      'T*',
      '(A final line keeps this page above the minimum length) Tj',
      'ET',
    ],
  },
];

/** One page that only draws a rectangle: no text at all, like a scan. */
const SCANNED_PAGES: FixturePage[] = [
  {
    lines: ['0.5 w', '72 100 200 300 re S', '0 0 0 RG'],
  },
];

/**
 * Content carries the mock provider's leak-answer trigger (lib/ai/mock.ts,
 * MOCK_LEAK_TRIGGER) so e2e/chat.spec.ts can ask this exact chunk text and
 * get a deterministic answer containing an injected markdown image, without
 * a real model reproducing an attacker-controlled source.
 */
const LEAK_PAGES: FixturePage[] = [
  {
    lines: [
      'BT /F1 12 Tf 14 TL 72 720 Td',
      '(Leak Test Source) Tj',
      'T*',
      '(This document exists only to test citation rendering safety) Tj',
      'T*',
      '(The mock-leak-test marker appears here to trigger a scripted) Tj',
      'T*',
      '(reply that tries to leak data through a markdown image link) Tj',
      'T*',
      '(The client must never render that image or fetch its target) Tj',
      'T*',
      '(A final line keeps this page above the minimum length here) Tj',
      'ET',
    ],
  },
];

/**
 * Content carries the mock provider's slow-answer trigger (lib/ai/mock.ts,
 * MOCK_SLOW_TRIGGER) so e2e/workspace.spec.ts can ask this exact chunk text and
 * get an answer that is still streaming when the test reaches for Stop.
 */
const SLOW_PAGES: FixturePage[] = [
  {
    lines: [
      'BT /F1 12 Tf 14 TL 72 720 Td',
      '(Slow Test Source) Tj',
      'T*',
      '(This document exists only to keep an answer streaming) Tj',
      'T*',
      '(The mock-slow-test marker appears here to trigger the long) Tj',
      'T*',
      '(reply that is still arriving when a test reaches for Stop) Tj',
      'T*',
      '(so that the stop button is never raced against its end) Tj',
      'T*',
      '(A final line keeps this page above the minimum length here) Tj',
      'ET',
    ],
  },
];

/** Pads a line with spaces to LINE_WIDTH bytes, the newline included. */
function line(text: string): string {
  if (text.length >= LINE_WIDTH) {
    throw new Error(`Content line does not fit the fixture layout: ${text}`);
  }
  return `${text.padEnd(LINE_WIDTH - 1, ' ')}\n`;
}

function buildPdf(pages: readonly FixturePage[]): string {
  const objectCount = 2 + pages.length * 2 + 1;
  const fontObject = objectCount;
  const offsets = new Map<number, number>();
  const parts: string[] = [HEADER];
  let position = HEADER.length;

  const write = (text: string): void => {
    parts.push(text);
    position += text.length;
  };

  const openObject = (number: number): void => {
    offsets.set(number, position);
    write(line(`${number} 0 obj`));
  };

  const resources = `/Resources << /Font << /F1 ${fontObject} 0 R >> >>`;

  openObject(1);
  write(line('<< /Type /Catalog /Pages 2 0 R >>'));
  write(line('endobj'));

  const kids = pages.map((page, index) => `${3 + index * 2} 0 R`).join(' ');
  openObject(2);
  write(line(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`));
  write(line('endobj'));

  pages.forEach((page, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;

    openObject(pageObject);
    write(line('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]'));
    write(line(`   ${resources}`));
    write(line(`   /Contents ${contentObject} 0 R >>`));
    write(line('endobj'));

    openObject(contentObject);
    write(line(`<< /Length ${page.lines.length * LINE_WIDTH} >>`));
    write(line('stream'));
    for (const contentLine of page.lines) {
      write(line(contentLine));
    }
    write(line('endstream'));
    write(line('endobj'));
  });

  openObject(fontObject);
  write(line('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  write(line('endobj'));

  const xrefOffset = position;
  write('xref\n');
  write(`0 ${objectCount + 1}\n`);
  for (let number = 0; number <= objectCount; number += 1) {
    const offset = number === 0 ? 0 : (offsets.get(number) ?? 0);
    const generation = number === 0 ? 65535 : 0;
    const kind = number === 0 ? 'f' : 'n';
    write(`${String(offset).padStart(10, '0')} ${String(generation).padStart(5, '0')} ${kind} \n`);
  }
  write('trailer\n');
  write(`<< /Size ${objectCount + 1} /Root 1 0 R >>\n`);
  write('startxref\n');
  write(`${xrefOffset}\n`);
  write('%%EOF\n');

  return parts.join('');
}

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const fixtures = [
    { name: 'sample.pdf', pages: SAMPLE_PAGES },
    { name: 'scanned.pdf', pages: SCANNED_PAGES },
    { name: 'leak.pdf', pages: LEAK_PAGES },
    { name: 'slow.pdf', pages: SLOW_PAGES },
  ];
  for (const fixture of fixtures) {
    const pdf = buildPdf(fixture.pages);
    writeFileSync(path.join(OUTPUT_DIR, fixture.name), Buffer.from(pdf, 'latin1'));
  }
}

main();
