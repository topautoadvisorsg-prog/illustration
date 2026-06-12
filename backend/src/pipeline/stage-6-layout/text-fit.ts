/**
 * Stage 6 — deterministic text-fit analyzer.
 *
 * What it does: estimates whether a page's body copy fits the chosen layout's
 * text zone at the configured typography, BEFORE any image-generation spend.
 * This is the gate the operator reviews. It is an estimate (character-grid model);
 * the real Paged.js render is the final authority on exact page count, but this
 * catches obvious overflow/underflow cheaply and deterministically.
 *
 * Model: text frame (pt) -> chars-per-line (from avg glyph advance) x usable
 * lines (frame height / line box), reduced by the layout's text-area factor and
 * fixed overhead for the title + section headers. Compare to the stripped body
 * character count.
 */

import type { LayoutTemplateId } from '@wildlands/shared';
import { stripMarkdown } from '../stage-2-planner/plan-pages.js';
import type { PageGeometry } from './page-geometry.js';
import { getLayoutProfile, type LayoutProfile } from './layout-profiles.js';
import { directLayout, type LayoutAllocation } from './layout-director.js';

// Calibrated so the geometric estimate agrees with the planner's per-layout word
// ranges (e.g. ~720-word entries sit near LAYOUT_2_TEXT_HEAVY capacity) — the two
// signals must not contradict each other. The real Paged.js render is authoritative.
/** Average glyph advance for justified serif body text (EB Garamond), in ems. */
export const AVG_CHAR_WIDTH_EM = 0.45;
/** Lines consumed by the entry title + scientific name + spacing. */
export const TITLE_OVERHEAD_LINES = 3;
/** Extra lines consumed per section header. */
export const LINES_PER_SECTION_HEADER = 1;
/** Float art is treated as a "wrap-around" (text reflows beside it as line-loss)
 *  rather than a "parallel column" (text in a narrower strip) when the image
 *  occupies less than this fraction of the page area. Below the threshold,
 *  half-image-half-page-of-text doesn't visually match what the renderer does. */
const FLOAT_PARALLEL_COLUMN_THRESHOLD = 0.25;

export type TextFitStatus = 'FITS' | 'TIGHT' | 'OVERFLOW' | 'UNDERFILLED';

export interface TextFitInput {
  bodyMarkdown: string;
  layoutTemplate: LayoutTemplateId;
  geometry: PageGeometry;
  bodyPt: number;
  /** Unitless line-height multiplier (e.g. 1.28). */
  lineHeight: number;
}

export interface TextFitResult {
  charCount: number;
  charsPerLine: number;
  totalLines: number;
  usableLines: number;
  capacityChars: number;
  estimatedLines: number;
  fillRatio: number;
  estimatedRenderedPages: number;
  allocation: LayoutAllocation;
  status: TextFitStatus;
  fits: boolean;
  notes: string[];
}

function countSectionHeaders(markdown: string): number {
  const matches = markdown.match(/^#{2,6}\s+/gm);
  return matches ? matches.length : 0;
}

/**
 * Derive the layout's physical TEXT panel rectangle from the resolved geometry +
 * the layout's `artSlot` + `artAreaFraction`. This replaces the old single
 * `textAreaFactor` multiplier (which reduced only the line count, regardless of
 * whether the image actually narrowed the text column).
 *
 * Geometry by slot:
 *   - TOP_BAND / BOTTOM_BAND / SCATTERED / FULL_PAGE:
 *     Image consumes a horizontal band; text uses FULL width × REDUCED height.
 *     (For PURE_TEXT, artAreaFraction = 0 → panel = the full text frame.)
 *   - FLOAT_LEFT / FLOAT_RIGHT / SIDEBAR_LEFT / SIDEBAR_RIGHT:
 *     Two regimes by image size:
 *       a < 0.25  → small floating image: text wraps around it → line-loss model
 *                   (FULL width × (1−a) height).
 *       a ≥ 0.25  → large image / sidebar: text in a parallel column
 *                   ((1−a) width × FULL height).
 *   - CORNER_*: text wraps around two sides → line-loss model.
 */
function textPanelDims(
  geometry: PageGeometry,
  profile: LayoutProfile,
): { widthPt: number; heightPt: number } {
  const W = geometry.textWidthPt;
  const H = geometry.textHeightPt;
  const a = profile.artAreaFraction;
  switch (profile.artSlot) {
    case 'TOP_BAND':
    case 'BOTTOM_BAND':
    case 'SCATTERED':
    case 'FULL_PAGE':
    case 'CENTER_WRAP':
    case 'CORNER_TOP_LEFT':
    case 'CORNER_TOP_RIGHT':
    case 'CORNER_BOTTOM_LEFT':
    case 'CORNER_BOTTOM_RIGHT':
      // Horizontal band, scattered marks, full-page background, centered or
      // cornered image — text uses FULL width × REDUCED height.
      return { widthPt: W, heightPt: H * (1 - a) };
    case 'FLOAT_LEFT':
    case 'FLOAT_RIGHT':
    case 'SIDEBAR_RIGHT':
      // Two regimes by image size.
      return a < FLOAT_PARALLEL_COLUMN_THRESHOLD
        ? { widthPt: W, heightPt: H * (1 - a) }      // small float → text wraps; line-loss
        : { widthPt: W * (1 - a), heightPt: H };     // large float / sidebar → parallel column
    case 'TITLE_BLOCK':
      // Display/ceremonial page — text is NOT a reading field but a compact
      // centered block (≈72% wide × ≈26% tall) surrounded by large negative
      // space. Capacity is intentionally tiny: a few short lines, not paragraphs.
      return { widthPt: W * 0.72, heightPt: H * 0.26 };
    case 'FINE_PRINT_BOTTOM':
      // Fine-print page — a small low-anchored block (≈68% wide × ≈18% tall);
      // capacity is small by design (a few lines of legal/credits print).
      return { widthPt: W * 0.68, heightPt: H * 0.18 };
  }
}

export function analyzeTextFit(input: TextFitInput): TextFitResult {
  const { geometry, bodyPt, lineHeight, layoutTemplate } = input;
  const profile = getLayoutProfile(layoutTemplate);
  const notes: string[] = [];

  const charCount = stripMarkdown(input.bodyMarkdown).length;

  // Capacity is derived from the layout's PHYSICAL text panel rectangle
  // (artSlot + artAreaFraction), NOT the full text frame reduced by a single
  // `textAreaFactor` multiplier. See `textPanelDims` for the slot→rectangle
  // mapping. SPEC_GEOMETRY_RECONCILIATION §calibration follow-up.
  const panel = textPanelDims(geometry, profile);
  const charsPerLine = Math.max(1, Math.floor(panel.widthPt / (AVG_CHAR_WIDTH_EM * bodyPt)));
  const lineBoxPt = bodyPt * lineHeight;
  const totalLines = Math.max(1, Math.floor(panel.heightPt / lineBoxPt));

  const overheadLines = TITLE_OVERHEAD_LINES + countSectionHeaders(input.bodyMarkdown) * LINES_PER_SECTION_HEADER;
  const linesForText = Math.max(1, totalLines - overheadLines);
  const usableLines = linesForText;

  const capacityChars = charsPerLine * usableLines;
  const estimatedLines = Math.ceil(charCount / charsPerLine);
  const fillRatio = capacityChars > 0 ? charCount / capacityChars : Number.POSITIVE_INFINITY;
  const allocation = directLayout(input);

  let status: TextFitStatus;
  if (fillRatio > 1 && (profile.textLight || (profile.artAreaFraction >= 0.5 && fillRatio > 1.25))) {
    status = 'OVERFLOW';
    notes.push(
      `Body ~${charCount} chars exceeds estimated capacity ~${capacityChars} for ${layoutTemplate}. ` +
        `Route to a more text-heavy layout before spending on art.`,
    );
  } else if (fillRatio > 1) {
    status = 'TIGHT';
    notes.push(
      `Body spans about ${allocation.estimatedRenderedPages} rendered pages; this is continuation flow, not lost text.`,
    );
  } else if (fillRatio >= 0.9) {
    status = 'TIGHT';
    notes.push('Estimated near capacity; confirm with the Paged.js render before locking.');
  } else if (profile.textLight ? fillRatio < 0.05 : fillRatio < 0.25) {
    status = 'UNDERFILLED';
    notes.push(
      `Body fills only ~${Math.round(fillRatio * 100)}% of the text zone; ` +
        `an illustration-dominant layout may suit this page better.`,
    );
  } else {
    status = 'FITS';
  }

  return {
    charCount,
    charsPerLine,
    totalLines,
    usableLines,
    capacityChars,
    estimatedLines,
    fillRatio: Math.round(fillRatio * 1000) / 1000,
    estimatedRenderedPages: allocation.estimatedRenderedPages,
    allocation,
    status,
    fits: status === 'FITS' || status === 'TIGHT',
    notes,
  };
}
