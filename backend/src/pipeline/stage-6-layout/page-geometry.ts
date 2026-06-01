/**
 * Stage 6 — page geometry.
 *
 * What it does: turns a trim size + bleed + margins into the exact page and
 * text-frame dimensions the layout engine renders at. These are the numbers the
 * text-fit analyzer and the Paged.js renderer both rely on, so they live in one
 * deterministic, fully tested place.
 *
 * KDP bleed convention (matches the proven spike renderer): the outer (fore-edge)
 * gets +bleed in width; top and bottom each get +bleed, so height gets +2*bleed.
 * 8.5x11 trim @ 0.125 bleed -> 8.625 x 11.25 page.
 */

import type { TrimSize } from '@wildlands/shared';

export const PT_PER_INCH = 72;

export interface PageMargins {
  topIn: number;
  rightIn: number;
  bottomIn: number;
  /** Inner/binding margin (left on recto). KDP gutter grows with page count. */
  gutterIn: number;
}

export interface PageGeometry {
  trimWidthIn: number;
  trimHeightIn: number;
  bleedIn: number;
  pageWidthIn: number;
  pageHeightIn: number;
  margins: PageMargins;
  textWidthIn: number;
  textHeightIn: number;
  textWidthPt: number;
  textHeightPt: number;
  /** KDP safe zone: keep all critical content this far inside the trim edge. */
  safeZoneIn: number;
}

/** Default interior margins for an 8.5x11 premium page (matches spike renderer). */
export const DEFAULT_MARGINS: PageMargins = { topIn: 1, rightIn: 1, bottomIn: 1, gutterIn: 1.25 };

/** Smaller default frame for compact 6x9 editions. */
export const COMPACT_MARGINS: PageMargins = { topIn: 0.75, rightIn: 0.625, bottomIn: 0.75, gutterIn: 0.875 };

export const KDP_SAFE_ZONE_IN = 0.25;

/** Pick a sensible default margin set from trim width. */
export function defaultMarginsForTrim(trim: TrimSize): PageMargins {
  return trim.widthIn <= 7 ? COMPACT_MARGINS : DEFAULT_MARGINS;
}

export function computePageGeometry(trim: TrimSize, margins: PageMargins = defaultMarginsForTrim(trim)): PageGeometry {
  const pageWidthIn = round3(trim.widthIn + trim.bleedIn);
  const pageHeightIn = round3(trim.heightIn + trim.bleedIn * 2);

  const textWidthIn = round3(pageWidthIn - margins.gutterIn - margins.rightIn);
  const textHeightIn = round3(pageHeightIn - margins.topIn - margins.bottomIn);

  if (textWidthIn <= 0 || textHeightIn <= 0) {
    throw new Error(
      `Invalid page geometry: margins exceed page size (text frame ${textWidthIn}x${textHeightIn} in).`,
    );
  }

  return {
    trimWidthIn: trim.widthIn,
    trimHeightIn: trim.heightIn,
    bleedIn: trim.bleedIn,
    pageWidthIn,
    pageHeightIn,
    margins,
    textWidthIn,
    textHeightIn,
    textWidthPt: round3(textWidthIn * PT_PER_INCH),
    textHeightPt: round3(textHeightIn * PT_PER_INCH),
    safeZoneIn: KDP_SAFE_ZONE_IN,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
