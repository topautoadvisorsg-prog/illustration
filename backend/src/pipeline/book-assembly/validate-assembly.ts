/**
 * Assembly validation gate (Book Assembly). Pure.
 *
 * Runs BEFORE the merge. If ANY required check fails, assembly is BLOCKED and no
 * interior PDF is produced — the report names exactly which pages block it.
 */

import type { SpinePage } from './spine-order.js';

/** The book-ready render fields the gate needs (from whole_page_renders). */
export interface BookReadyRenderRef {
  renderId: string;
  pageId: string;
  printPdfPath: string | null;
  printPngPath?: string | null;
  preflightPassed: boolean | null;
}

/** Page dimensions read from each loaded print PDF (points). */
export interface PageDimsPt {
  widthPt: number;
  heightPt: number;
}

export interface AssemblyValidationInput {
  /** Ordered expected pages (every project page in scope). */
  spine: SpinePage[];
  /** active + approved_for_book renders, keyed by pageId. */
  renderByPageId: Map<string, BookReadyRenderRef>;
  /** Loaded print-PDF page dims, keyed by pageId (only for pages that have a print PDF). */
  dimsByPageId: Map<string, PageDimsPt>;
  /** Project's resolved canvas (trim + 2×bleed). REQUIRED — the expected page
   *  size derives from it, never from a hardcoded constant. Callers pass
   *  `resolveGeometry(config).canvasIn`; no default fallback (that path is what
   *  produced the original trim-mismatch bug). */
  canvasIn: { w: number; h: number };
}

export interface ValidationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface AssemblyValidation {
  blocked: boolean;
  checks: ValidationCheck[];
  /** pageKeys with no active+approved_for_book render. */
  missing: string[];
  /** pageKeys whose selected render failed preflight. */
  preflightFailures: string[];
  /** pageKeys with no print_pdf_path. */
  noPrintOutput: string[];
  /** pageKeys whose print page is the wrong size. */
  dimensionFailures: string[];
}

const PT_TOL = 1; // 1pt tolerance

export function validateAssembly(input: AssemblyValidationInput): AssemblyValidation {
  const { spine, renderByPageId, dimsByPageId, canvasIn } = input;
  const EXPECTED_W_PT = canvasIn.w * 72;
  const EXPECTED_H_PT = canvasIn.h * 72;

  const missing: string[] = [];
  const preflightFailures: string[] = [];
  const noPrintOutput: string[] = [];
  const dimensionFailures: string[] = [];

  for (const page of spine) {
    const r = renderByPageId.get(page.id);
    if (!r) {
      missing.push(page.pageKey);
      continue;
    }
    if (!r.printPdfPath) noPrintOutput.push(page.pageKey);
    if (r.preflightPassed !== true) preflightFailures.push(page.pageKey);
    const d = dimsByPageId.get(page.id);
    if (d) {
      if (Math.abs(d.widthPt - EXPECTED_W_PT) > PT_TOL || Math.abs(d.heightPt - EXPECTED_H_PT) > PT_TOL) {
        dimensionFailures.push(page.pageKey);
      }
    }
  }

  // Trim/bleed consistency: every measured page shares the same MediaBox.
  const distinctDims = new Set(
    Array.from(dimsByPageId.values()).map((d) => `${Math.round(d.widthPt)}x${Math.round(d.heightPt)}`),
  );

  const assembledCount = spine.length - missing.length;

  const checks: ValidationCheck[] = [
    { name: 'every_page_book_ready', ok: missing.length === 0, detail: `${spine.length - missing.length}/${spine.length} pages have a book-ready render` },
    { name: 'every_page_has_print_output', ok: noPrintOutput.length === 0, detail: noPrintOutput.length ? `${noPrintOutput.length} missing print PDF` : 'all pages print-prepped' },
    { name: 'every_page_preflight_passed', ok: preflightFailures.length === 0, detail: preflightFailures.length ? `${preflightFailures.length} failed preflight` : 'all pages passed preflight' },
    { name: 'page_dimensions', ok: dimensionFailures.length === 0, detail: dimensionFailures.length ? `${dimensionFailures.length} wrong size` : `all ${canvasIn.w}×${canvasIn.h}in` },
    { name: 'trim_bleed_consistency', ok: distinctDims.size <= 1, detail: distinctDims.size <= 1 ? 'uniform' : `${distinctDims.size} distinct page sizes` },
    { name: 'page_count', ok: missing.length === 0 && assembledCount === spine.length, detail: `${assembledCount}/${spine.length}` },
  ];

  return {
    blocked: checks.some((c) => !c.ok),
    checks,
    missing,
    preflightFailures,
    noPrintOutput,
    dimensionFailures,
  };
}

/** KDP page-count advisory (report-only in v1; no auto-padding). */
export interface PageCountAdvisory {
  pageCount: number;
  isEven: boolean;
  kdpMinPages: number;
  kdpMinOk: boolean;
  blankPaddingWillBeRequired: boolean;
  note: string;
}

const KDP_MIN_PAGES = 24; // KDP paperback minimum interior page count

export function pageCountAdvisory(pageCount: number): PageCountAdvisory {
  const isEven = pageCount % 2 === 0;
  const kdpMinOk = pageCount >= KDP_MIN_PAGES;
  const padding = !isEven || !kdpMinOk;
  return {
    pageCount,
    isEven,
    kdpMinPages: KDP_MIN_PAGES,
    kdpMinOk,
    blankPaddingWillBeRequired: padding,
    note: padding
      ? 'Blank padding will be required later (interacts with front matter / numbering / spine). Not auto-padded in v1.'
      : 'Page count satisfies KDP even-count + minimum.',
  };
}
