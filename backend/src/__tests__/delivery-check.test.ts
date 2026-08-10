/**
 * Delivery check — reads back real PDFs built in the test, no DB or network.
 *
 * The point of these is that the check reports what the FILE contains, not what
 * the pipeline believed it produced. Each case builds a PDF that is wrong in
 * exactly one way and asserts the check names that way.
 */
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { ProjectConfigSchema } from '@wildlands/shared';
import { checkDelivery } from '../pipeline/book-assembly/delivery-check.js';

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'NO ONE TOLD ME THAT',
  authorName: 'Nolan Whitlow',
  // The real book: 5.5×8.5, no bleed, cream stock.
  trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
  paperStock: 'cream',
});

const IN = 72;

async function pdfOf(pages: { w: number; h: number }[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const p of pages) doc.addPage([p.w * IN, p.h * IN]);
  return Buffer.from(await doc.save());
}

const uniform = (n: number, w = 5.5, h = 8.5) => Array.from({ length: n }, () => ({ w, h }));

const find = (r: Awaited<ReturnType<typeof checkDelivery>>, name: string) =>
  r.checks.find((c) => c.name === name)!;

describe('checkDelivery', () => {
  it('reports FAIL and nothing else when no interior has been built', async () => {
    const r = await checkDelivery({ config, interiorPdf: null, coverPdf: null });
    expect(r.status).toBe('FAIL');
    expect(r.checks).toHaveLength(1);
    expect(r.interior).toBeNull();
  });

  it('passes a correctly sized interior, warning only that the cover is absent', async () => {
    const r = await checkDelivery({ config, interiorPdf: await pdfOf(uniform(154)), coverPdf: null });

    expect(find(r, 'interior_page_size').status).toBe('PASS');
    expect(find(r, 'page_count_range').detail).toContain('154');
    expect(find(r, 'cover_geometry').status).toBe('WARNING');
    // A missing cover must not read as a printable book.
    expect(r.status).toBe('WARNING');
  });

  it('fails when the pages are not all the same size', async () => {
    const mixed = [...uniform(10), { w: 6, h: 9 }];
    const r = await checkDelivery({ config, interiorPdf: await pdfOf(mixed), coverPdf: null });

    const size = find(r, 'interior_page_size');
    expect(size.status).toBe('FAIL');
    expect(size.detail).toContain('6×9in');
    expect(r.status).toBe('FAIL');
  });

  it('fails a book that is under the KDP paperback minimum', async () => {
    const r = await checkDelivery({ config, interiorPdf: await pdfOf(uniform(12)), coverPdf: null });
    expect(find(r, 'page_count_range').status).toBe('FAIL');
    expect(find(r, 'page_count_range').detail).toMatch(/at least 24/);
  });

  it('does not demand a TrimBox from a book that prints without bleed', async () => {
    const r = await checkDelivery({ config, interiorPdf: await pdfOf(uniform(154)), coverPdf: null });
    const trim = find(r, 'interior_trimbox');
    expect(trim.status).toBe('WARNING');
    expect(trim.detail).toMatch(/not required/);
  });

  it('accepts a cover whose wrap matches the interior page count on cream stock', async () => {
    // 154 pages × 0.0025in cream = 0.385in spine.
    // 5.5×2 + 0.385 + 0.125×2 cover bleed = 11.635 × 8.750in. The cover bleeds
    // even though this book's interior does not — KDP requires it on the wrap.
    const cover = await pdfOf([{ w: 11.635, h: 8.75 }]);
    const r = await checkDelivery({ config, interiorPdf: await pdfOf(uniform(154)), coverPdf: cover });

    const geom = find(r, 'cover_geometry');
    expect(geom.status).toBe('PASS');
    expect(geom.detail).toContain('0.3850');
    expect(geom.detail).toContain('cream');
  });

  it('fails a cover built for a different page count', async () => {
    // A wrap sized for 163 pages (spine 0.4075) against a 154-page interior.
    const cover = await pdfOf([{ w: 11.6575, h: 8.75 }]);
    const r = await checkDelivery({ config, interiorPdf: await pdfOf(uniform(154)), coverPdf: cover });

    expect(find(r, 'cover_geometry').status).toBe('FAIL');
    expect(r.status).toBe('FAIL');
  });

  it('catches the white-stock spine on a cream book', async () => {
    // Same 154 pages at the WHITE multiplier: 0.3468in spine, 11.597in wrap.
    // 0.038in narrower than cream — past tolerance, which is the point.
    const cover = await pdfOf([{ w: 11.597, h: 8.75 }]);
    const r = await checkDelivery({ config, interiorPdf: await pdfOf(uniform(154)), coverPdf: cover });

    expect(find(r, 'cover_geometry').status).toBe('FAIL');
  });
});
