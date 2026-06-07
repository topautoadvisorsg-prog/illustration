/**
 * Stage 1.75 — Pagination capacity helper.
 *
 * Wraps the existing Stage 6 `analyzeTextFit` so pagination decisions use the
 * SAME char-grid model the final fit gate will use. Maps text-fit's output to
 * the Pagination v1 `fit_status` enum (FITS / TIGHT / OVERFLOW / UNDERFILL —
 * note: Stage 6 uses UNDERFILLED, this layer normalizes the spelling per SPEC).
 *
 * No new math lives here. If the char model needs to change, change it in
 * stage-6-layout/text-fit.ts and this layer follows automatically.
 */

import type { LayoutTemplateId, TrimSize } from '@wildlands/shared';
import { analyzeTextFit } from '../stage-6-layout/text-fit.js';
import { computePageGeometry } from '../stage-6-layout/page-geometry.js';

/** Pagination v1 fit_status (mirrors backend/src/db/schema page_role enum values). */
export type PaginationFitStatus = 'PENDING' | 'FITS' | 'TIGHT' | 'OVERFLOW' | 'UNDERFILL';

export interface PaginationCapacityInput {
  /** Markdown that will live in this printed page's Reading Field. */
  readingFieldText: string;
  /** The chosen layout template for this printed page. */
  layoutTemplate: LayoutTemplateId;
  /** From config.trimSize — controls textWidthPt / textHeightPt. */
  trimSize: TrimSize;
  bodyPt: number;
  /** Unitless line-height multiplier (e.g. 1.35). */
  lineHeight: number;
}

export interface PaginationCapacityResult {
  charCount: number;
  capacityChars: number;
  /** charCount / capacityChars; 0 means empty page. */
  fillRatio: number;
  status: PaginationFitStatus;
}

/**
 * UNDERFILL detection threshold (fill ratio below this -> UNDERFILL). Per SPEC §5.5.
 * Stage 6's analyzeTextFit uses 0.25 (or 0.05 for text-light layouts); pagination
 * uses a fixed 0.30 to be more conservative — pagination's job is to BALANCE pages,
 * so a half-empty page is a problem here even if it would be acceptable as a final
 * print page (e.g. a chapter opener).
 */
const UNDERFILL_THRESHOLD = 0.30;
/** FITS upper bound; above this is TIGHT. Per SPEC §5.5: "chars ≤ 0.85 × capacity". */
const FITS_THRESHOLD = 0.85;

/**
 * Compute char capacity for a printed page and classify how the assigned text fits.
 * Decoupled from persistence — the caller decides what to do with the result.
 */
export function computePaginationCapacity(input: PaginationCapacityInput): PaginationCapacityResult {
  const geometry = computePageGeometry(input.trimSize);
  const fit = analyzeTextFit({
    bodyMarkdown: input.readingFieldText,
    layoutTemplate: input.layoutTemplate,
    geometry,
    bodyPt: input.bodyPt,
    lineHeight: input.lineHeight,
  });

  const fillRatio = fit.fillRatio;

  let status: PaginationFitStatus;
  if (fit.capacityChars === 0) {
    // Defensive: text-fit guards against zero capacity but enum needs a value.
    status = 'PENDING';
  } else if (fillRatio > 1) {
    status = 'OVERFLOW';
  } else if (fillRatio > FITS_THRESHOLD) {
    status = 'TIGHT';
  } else if (fillRatio < UNDERFILL_THRESHOLD) {
    status = 'UNDERFILL';
  } else {
    status = 'FITS';
  }

  return {
    charCount: fit.charCount,
    capacityChars: fit.capacityChars,
    fillRatio,
    status,
  };
}
