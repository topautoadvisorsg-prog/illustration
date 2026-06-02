/**
 * Stage 7 — stitch chapter PDFs into one book + KDP preflight.
 *
 * What it does: merges chapter PDFs (in order) into a single interior PDF with
 * pdf-lib, then runs a preflight gate that asserts the book matches the project
 * trim+bleed and has the expected page count. No re-rendering happens here.
 *
 * Note: pdf-lib stitches and reads page geometry. It does not embed ICC profiles
 * (sRGB) — that is a Ghostscript post-process step left for the production host.
 */

import { PDFDocument } from 'pdf-lib';
import type { TrimSize } from '@wildlands/shared';
import { PT_PER_INCH } from '../stage-6-layout/page-geometry.js';

export interface StitchResult {
  pdf: Buffer;
  pageCount: number;
}

/** Merge chapter PDFs in order into one document. */
export async function stitchPdfs(chapterPdfs: Buffer[]): Promise<StitchResult> {
  if (chapterPdfs.length === 0) {
    throw new Error('No chapter PDFs to stitch.');
  }
  const book = await PDFDocument.create();
  for (const bytes of chapterPdfs) {
    const src = await PDFDocument.load(bytes);
    const copied = await book.copyPages(src, src.getPageIndices());
    for (const page of copied) book.addPage(page);
  }
  const out = await book.save();
  return { pdf: Buffer.from(out), pageCount: book.getPageCount() };
}

export interface PreflightIssue {
  severity: 'BLOCKER' | 'WARNING';
  code: string;
  message: string;
}

export interface PreflightReport {
  pageCount: number;
  expectedPageWidthPt: number;
  expectedPageHeightPt: number;
  /** Pages whose size deviates from the expected bleed page size. */
  offSizePages: number[];
  issues: PreflightIssue[];
  passed: boolean;
}

// KDP page sizes are exact; allow a tiny tolerance for float rounding.
const SIZE_TOLERANCE_PT = 1;

/**
 * KDP preflight: every page must match the project trim + bleed, the book must
 * have pages, and (optionally) match an expected page count. Returns a report;
 * BLOCKER issues mean the book is not KDP-ready.
 */
export async function preflightBook(
  pdf: Buffer,
  trim: TrimSize,
  expectedPageCount?: number,
): Promise<PreflightReport> {
  const doc = await PDFDocument.load(pdf);
  const pageCount = doc.getPageCount();

  // KDP bleed convention (matches the renderer): +bleed on width, +2*bleed on height.
  const expectedPageWidthPt = round2((trim.widthIn + trim.bleedIn) * PT_PER_INCH);
  const expectedPageHeightPt = round2((trim.heightIn + trim.bleedIn * 2) * PT_PER_INCH);

  const issues: PreflightIssue[] = [];
  const offSizePages: number[] = [];

  if (pageCount === 0) {
    issues.push({ severity: 'BLOCKER', code: 'empty_book', message: 'Book has no pages.' });
  }

  doc.getPages().forEach((page, index) => {
    const { width, height } = page.getSize();
    if (Math.abs(width - expectedPageWidthPt) > SIZE_TOLERANCE_PT || Math.abs(height - expectedPageHeightPt) > SIZE_TOLERANCE_PT) {
      offSizePages.push(index + 1);
    }
  });

  if (offSizePages.length > 0) {
    issues.push({
      severity: 'BLOCKER',
      code: 'page_size_mismatch',
      message: `${offSizePages.length} page(s) are not ${expectedPageWidthPt}x${expectedPageHeightPt} pt (trim+bleed). KDP will reject mixed sizes.`,
    });
  }

  if (expectedPageCount != null && pageCount !== expectedPageCount) {
    issues.push({
      severity: 'WARNING',
      code: 'page_count_drift',
      message: `Book has ${pageCount} pages; manifest estimated ${expectedPageCount}. Layout count is authoritative.`,
    });
  }

  return {
    pageCount,
    expectedPageWidthPt,
    expectedPageHeightPt,
    offSizePages,
    issues,
    passed: issues.every((i) => i.severity !== 'BLOCKER'),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
