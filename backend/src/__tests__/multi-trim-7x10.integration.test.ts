/**
 * Multi-trim guardrail — proves a 7×10 project flows end-to-end and that the
 * platform is NOT silently locked to 8.5×11. If any single subsystem ever stops
 * deriving from `resolveGeometry(config)` and reverts to a hardcoded canvas,
 * one of these assertions fails.
 *
 * Pure: no DB, no spend. Each step exercises the same public function the
 * production code path calls (paginate → resolveGeometry, render-prep →
 * computePageGeometry(resolveGeometry(...).trimSize), print-prep →
 * standardCanvas + composePrintPage, assembly → validateAssembly).
 */

import { describe, expect, it } from 'vitest';
import type { TrimSize } from '@wildlands/shared';
import { resolveGeometry, SPACING } from '../pipeline/publishing-standard/index.js';
import { computePageGeometry } from '../pipeline/stage-6-layout/page-geometry.js';
import { standardCanvas } from '../pipeline/print-prep/badge-geometry.js';
import { runPreflight } from '../pipeline/print-prep/preflight.js';
import {
  validateAssembly,
  type BookReadyRenderRef,
  type PageDimsPt,
} from '../pipeline/book-assembly/validate-assembly.js';
import type { SpinePage } from '../pipeline/book-assembly/spine-order.js';

const TRIM_7x10: TrimSize = { widthIn: 7, heightIn: 10, bleedIn: 0.125 };
const TRIM_8_5x11: TrimSize = { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 };

// 7.25 × 10.25 in @ 300 DPI = 2175 × 3075 px ; in pdf points = 522 × 738.
const CANVAS_7x10_IN = { w: 7.25, h: 10.25 };
const CANVAS_7x10_PX = { w: 2175, h: 3075 };
const CANVAS_7x10_PT = { w: 522, h: 738 };
// 8.75 × 11.25 in → 2625 × 3375 px → 630 × 810 pt. The Standard default.
const CANVAS_8_5x11_PT = { w: 630, h: 810 };

const spine: SpinePage[] = [
  { id: 'a', pageKey: 'a', chapterNumber: 1, plannedPageNumber: 1 },
  { id: 'b', pageKey: 'b', chapterNumber: 1, plannedPageNumber: 2 },
];
const refs = new Map<string, BookReadyRenderRef>([
  ['a', { renderId: 'ra', pageId: 'a', printPdfPath: 'p/a.pdf', preflightPassed: true }],
  ['b', { renderId: 'rb', pageId: 'b', printPdfPath: 'p/b.pdf', preflightPassed: true }],
]);

describe('multi-trim guardrail: 7×10 project flows end-to-end without 8.5×11 lock-in', () => {
  it('resolveGeometry yields trim 7×10 and canvas 7.25×10.25 — NOT the Standard default', () => {
    const g = resolveGeometry({ trimSize: TRIM_7x10 });
    expect(g.trimSize).toEqual(TRIM_7x10);
    expect(g.canvasIn).toEqual(CANVAS_7x10_IN);
    expect(g.dpi).toBe(300);
    // Explicit anti-lock-in assertion: a 7×10 project must NOT produce the
    // 8.75×11.25 default canvas.
    expect(g.canvasIn).not.toEqual(SPACING.canvasIn);
  });

  it('unsupported trims throw — no silent fallback to 8.5×11', () => {
    expect(() =>
      resolveGeometry({ trimSize: { widthIn: 5, heightIn: 8, bleedIn: 0.125 } }),
    ).toThrow(/unsupported_trim/);
  });

  it('pagination geometry uses the 7×10 trim — text frame differs from 8.5×11', () => {
    const seven = computePageGeometry(resolveGeometry({ trimSize: TRIM_7x10 }).trimSize);
    const eightHalf = computePageGeometry(resolveGeometry({ trimSize: TRIM_8_5x11 }).trimSize);

    expect(seven.trimWidthIn).toBe(7);
    expect(seven.trimHeightIn).toBe(10);
    expect(eightHalf.trimWidthIn).toBe(8.5);
    expect(eightHalf.trimHeightIn).toBe(11);

    // Pagination capacity is derived from the text-frame area; the two trims
    // MUST produce different frames or pagination is silently the same. After
    // L-1 (symmetric 0.5 in COMPACT margins) the 7×10 text-height happens to
    // match the 8.5×11 text-height (both 9 in) — but the widths differ, so the
    // text-frame *area* is still distinct. Assert area-difference here, not
    // axis-by-axis equality, so future symmetric margin tweaks don't false-
    // trigger this guardrail.
    const sevenArea = seven.textWidthIn * seven.textHeightIn;
    const eightHalfArea = eightHalf.textWidthIn * eightHalf.textHeightIn;
    expect(sevenArea).not.toBe(eightHalfArea);

    // Box-model invariant: content frame derived from TRIM, not from bleed page.
    expect(seven.textWidthIn).toBe(seven.trimWidthIn - seven.margins.gutterIn - seven.margins.rightIn);
    expect(seven.textHeightIn).toBe(seven.trimHeightIn - seven.margins.topIn - seven.margins.bottomIn);
  });

  it('render-prep blueprint aspect is portrait (trim H > W) — drives pickSize → 1024×1536', () => {
    // pickSize() lives inside render-whole-page.ts as a private helper; its
    // public contract is "portrait trim → portrait grid". We assert the
    // upstream invariant (the aspect) that pickSize keys off.
    const g = computePageGeometry(resolveGeometry({ trimSize: TRIM_7x10 }).trimSize);
    expect(g.trimHeightIn).toBeGreaterThan(g.trimWidthIn);
  });

  it('print-prep canvas at 7×10 is 2175×3075 px / 300 DPI — NOT 2625×3375', () => {
    const canvasIn = resolveGeometry({ trimSize: TRIM_7x10 }).canvasIn;
    const c = standardCanvas(canvasIn);
    expect(c).toEqual({ width: CANVAS_7x10_PX.w, height: CANVAS_7x10_PX.h, dpi: 300 });
    // Anti-lock-in: a 7×10 project's print canvas must NOT be the Standard default.
    expect(c.width).not.toBe(Math.round(SPACING.canvasIn.w * 300));
    expect(c.height).not.toBe(Math.round(SPACING.canvasIn.h * 300));
  });

  it('preflight passes a correctly-sized 7×10 print page and rejects an 8.5×11-sized one', () => {
    const canvasIn = resolveGeometry({ trimSize: TRIM_7x10 }).canvasIn;

    const ok = runPreflight({
      widthPx: CANVAS_7x10_PX.w,
      heightPx: CANVAS_7x10_PX.h,
      dpi: 300,
      colorMode: 'srgb',
      pngBytes: 1000,
      pdfBytes: 1000,
      badgesWithinCanvas: true,
      canvasIn,
    });
    expect(ok.passed).toBe(true);

    // A page sized for the OLD 8.5×11 canvas dropped into a 7×10 project →
    // dimensions check must fail. This is exactly the original bug shape.
    const wrong = runPreflight({
      widthPx: 2625,
      heightPx: 3375,
      dpi: 300,
      colorMode: 'srgb',
      pngBytes: 1000,
      pdfBytes: 1000,
      badgesWithinCanvas: true,
      canvasIn,
    });
    expect(wrong.passed).toBe(false);
    expect(wrong.checks.find((c) => c.name === 'dimensions')?.ok).toBe(false);
    expect(wrong.checks.find((c) => c.name === 'trim_plus_bleed')?.ok).toBe(false);
  });

  it('assembly validates each page MediaBox against 522×738 pt (7.25×10.25 in) and rejects 630×810 pt', () => {
    const canvasIn = resolveGeometry({ trimSize: TRIM_7x10 }).canvasIn;
    const okDims: PageDimsPt = { widthPt: CANVAS_7x10_PT.w, heightPt: CANVAS_7x10_PT.h };

    // Correctly-sized pages → assembly passes.
    const ok = validateAssembly({
      spine,
      renderByPageId: refs,
      dimsByPageId: new Map([
        ['a', okDims],
        ['b', okDims],
      ]),
      canvasIn,
    });
    expect(ok.blocked).toBe(false);
    expect(ok.checks.every((c) => c.ok)).toBe(true);
    expect(ok.checks.find((c) => c.name === 'page_dimensions')?.detail).toMatch(/7\.25.*10\.25/);

    // One page accidentally sized to the OLD 8.5×11 default → MUST be blocked.
    // This is the exact regression the reconciliation set out to prevent.
    const wrong = validateAssembly({
      spine,
      renderByPageId: refs,
      dimsByPageId: new Map<string, PageDimsPt>([
        ['a', okDims],
        ['b', { widthPt: CANVAS_8_5x11_PT.w, heightPt: CANVAS_8_5x11_PT.h }],
      ]),
      canvasIn,
    });
    expect(wrong.blocked).toBe(true);
    expect(wrong.dimensionFailures).toEqual(['b']);
    expect(wrong.checks.find((c) => c.name === 'page_dimensions')?.ok).toBe(false);
    expect(wrong.checks.find((c) => c.name === 'trim_bleed_consistency')?.ok).toBe(false);
  });
});
