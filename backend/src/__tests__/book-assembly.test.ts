/**
 * Book Assembly tests — pure spine/validation/advisory + a real pdf-lib merge
 * on fixture PDFs (no DB, no spend).
 */

import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { resolveSpine, frontMatterStatus, type SpinePage } from '../pipeline/book-assembly/spine-order.js';
import {
  validateAssembly,
  pageCountAdvisory,
  type BookReadyRenderRef,
  type PageDimsPt,
} from '../pipeline/book-assembly/validate-assembly.js';
import { readFirstPageDimsPt, mergeSinglePagePdfs } from '../pipeline/book-assembly/pdf-merge.js';

const page = (id: string, ch: number, n: number, extra: Partial<SpinePage> = {}): SpinePage => ({
  id, pageKey: id, chapterNumber: ch, plannedPageNumber: n, ...extra,
});

describe('spine ordering', () => {
  it('v1: orders body by (chapterNumber, plannedPageNumber)', () => {
    const out = resolveSpine([page('b', 2, 1), page('a', 1, 2), page('c', 1, 1)]);
    expect(out.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });
  it('uses spineOrder when present (front matter built)', () => {
    const out = resolveSpine([
      page('body', 1, 1, { spineOrder: 5 }),
      page('cover', 0, 0, { spineOrder: 1, section: 'FRONT_MATTER' }),
    ]);
    expect(out.map((p) => p.id)).toEqual(['cover', 'body']);
  });
  it('reports front-matter absence', () => {
    expect(frontMatterStatus([page('a', 1, 1)])).toBe('absent');
    expect(frontMatterStatus([page('a', 1, 1, { section: 'FRONT_MATTER' })])).toBe('included');
  });
});

const goodDims: PageDimsPt = { widthPt: 630, heightPt: 810 };
function refs(map: Record<string, Partial<BookReadyRenderRef>>): Map<string, BookReadyRenderRef> {
  const m = new Map<string, BookReadyRenderRef>();
  for (const [pageId, r] of Object.entries(map)) {
    m.set(pageId, { renderId: 'r-' + pageId, pageId, printPdfPath: 'p/' + pageId + '.pdf', preflightPassed: true, ...r });
  }
  return m;
}

describe('validation gate — blocks correctly', () => {
  const spine = [page('a', 1, 1), page('b', 1, 2)];

  it('passes when every page is book-ready + print-prepped + preflight + right size', () => {
    const v = validateAssembly({
      spine,
      renderByPageId: refs({ a: {}, b: {} }),
      dimsByPageId: new Map([['a', goodDims], ['b', goodDims]]),
    });
    expect(v.blocked).toBe(false);
    expect(v.checks.every((c) => c.ok)).toBe(true);
  });

  it('blocks on a missing page', () => {
    const v = validateAssembly({ spine, renderByPageId: refs({ a: {} }), dimsByPageId: new Map([['a', goodDims]]) });
    expect(v.blocked).toBe(true);
    expect(v.missing).toEqual(['b']);
  });

  it('blocks on a failed preflight', () => {
    const v = validateAssembly({
      spine,
      renderByPageId: refs({ a: {}, b: { preflightPassed: false } }),
      dimsByPageId: new Map([['a', goodDims], ['b', goodDims]]),
    });
    expect(v.blocked).toBe(true);
    expect(v.preflightFailures).toEqual(['b']);
  });

  it('blocks on missing print output', () => {
    const v = validateAssembly({
      spine,
      renderByPageId: refs({ a: {}, b: { printPdfPath: null } }),
      dimsByPageId: new Map([['a', goodDims]]),
    });
    expect(v.blocked).toBe(true);
    expect(v.noPrintOutput).toEqual(['b']);
  });

  it('blocks on a wrong-sized page', () => {
    const v = validateAssembly({
      spine,
      renderByPageId: refs({ a: {}, b: {} }),
      dimsByPageId: new Map([['a', goodDims], ['b', { widthPt: 612, heightPt: 792 }]]),
    });
    expect(v.blocked).toBe(true);
    expect(v.dimensionFailures).toEqual(['b']);
    expect(v.checks.find((c) => c.name === 'trim_bleed_consistency')?.ok).toBe(false);
  });
});

describe('KDP page-count advisory (report-only, no auto-pad)', () => {
  it('flags odd count', () => {
    const a = pageCountAdvisory(129);
    expect(a.isEven).toBe(false);
    expect(a.blankPaddingWillBeRequired).toBe(true);
  });
  it('flags below KDP minimum', () => {
    expect(pageCountAdvisory(10).kdpMinOk).toBe(false);
  });
  it('passes an even, sufficient count', () => {
    const a = pageCountAdvisory(128);
    expect(a.isEven).toBe(true);
    expect(a.kdpMinOk).toBe(true);
    expect(a.blankPaddingWillBeRequired).toBe(false);
  });
});

describe('pdf merge (real pdf-lib on fixtures)', () => {
  async function onePage(w: number, h: number): Promise<Buffer> {
    const d = await PDFDocument.create();
    d.addPage([w, h]);
    return Buffer.from(await d.save());
  }

  it('reads first-page dims', async () => {
    expect(await readFirstPageDimsPt(await onePage(630, 810))).toEqual({ widthPt: 630, heightPt: 810 });
  });

  it('merges N single-page PDFs into one of N pages', async () => {
    const merged = await mergeSinglePagePdfs([await onePage(630, 810), await onePage(630, 810), await onePage(630, 810)]);
    expect(merged.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).getSize()).toEqual({ width: 630, height: 810 });
  });
});
