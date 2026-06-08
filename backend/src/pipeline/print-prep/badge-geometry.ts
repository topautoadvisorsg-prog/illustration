/**
 * Badge + folio placement geometry (STD-3 Print-Prep).
 *
 * Pure, deterministic pixel math. Reads the Standard's spacing + badge safe-zone
 * (Layout owns the zones; Print-Prep only computes the rects to stamp into).
 * No I/O, no image work — that's print-prep.ts.
 *
 * Canvas (8.75×11.25in @ 300 DPI) = 2625×3375. The reserved badge corners are
 * 0.9in squares inset by (bleed + KDP safe) from each bottom corner.
 */

import { BADGE_PLACEMENT, SPACING } from '../publishing-standard/index.js';
import type { StampableBadge } from '../publishing-standard/index.js';

const KDP_SAFE_IN = 0.25; // KDP keep-content-inside margin from the trim edge

export interface PxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlacedBadge {
  badge: StampableBadge;
  rect: PxRect;
}

export interface CanvasPx {
  width: number;
  height: number;
  dpi: number;
}

/**
 * The 300-DPI full-bleed canvas for a project.
 *
 * Canvas inches are DERIVED from the project's resolved trim
 * (SPEC_GEOMETRY_RECONCILIATION §1) — pass `resolveGeometry(config).canvasIn`.
 * Defaults to the Standard default canvas (8.75×11.25) when omitted.
 */
export function standardCanvas(canvasIn: { w: number; h: number } = SPACING.canvasIn): CanvasPx {
  return {
    width: Math.round(canvasIn.w * SPACING.printDpi),
    height: Math.round(canvasIn.h * SPACING.printDpi),
    dpi: SPACING.printDpi,
  };
}

/** Aspect (h/w) of each badge family's SVG viewBox. */
const FAMILY_ASPECT: Record<StampableBadge['family'], number> = {
  region: 120 / 100,
  hazard: 110 / 100,
  source: 100 / 100,
};

function safeSquares(canvas: CanvasPx): { left: PxRect; right: PxRect } {
  const inset = Math.round((SPACING.bleedIn + KDP_SAFE_IN) * canvas.dpi); // 0.375in = 113px
  const sq = Math.round(BADGE_PLACEMENT.safeZoneIn * canvas.dpi); // 0.9in = 270px
  const top = canvas.height - inset - sq;
  return {
    left: { left: inset, top, width: sq, height: sq },
    right: { left: canvas.width - inset - sq, top, width: sq, height: sq },
  };
}

function centeredIn(square: PxRect, w: number, h: number, dy = 0): PxRect {
  return {
    left: Math.round(square.left + (square.width - w) / 2),
    top: Math.round(square.top + dy),
    width: Math.round(w),
    height: Math.round(h),
  };
}

/**
 * Compute the pixel rect for every stampable badge:
 *   region → bottom-left square, centred.
 *   hazards (≤2) → top of the bottom-right square, in a row (1 wide / 2 side-by-side).
 *   source → beneath the hazards, centred in the bottom-right square.
 */
export function computeBadgeLayout(badges: StampableBadge[], canvas: CanvasPx): PlacedBadge[] {
  const { left: leftSq, right: rightSq } = safeSquares(canvas);
  const placed: PlacedBadge[] = [];

  const region = badges.find((b) => b.family === 'region');
  if (region) {
    const h = Math.round(0.6 * canvas.dpi); // 180px
    const w = Math.round(h / FAMILY_ASPECT.region);
    placed.push({ badge: region, rect: centeredIn(leftSq, w, h, (leftSq.height - h) / 2) });
  }

  const hazards = badges.filter((b) => b.family === 'hazard').sort((a, b) => a.order - b.order);
  const source = badges.find((b) => b.family === 'source');

  // Hazard row across the top of the right square; source seal beneath it.
  if (hazards.length > 0) {
    const n = hazards.length; // 1 or 2 (contract caps at 2)
    const gap = n > 1 ? Math.round(0.05 * canvas.dpi) : 0; // 15px between two hazards
    const srcH = source ? Math.round(0.3 * canvas.dpi) : 0; // 90px
    const srcGap = source ? Math.round(0.04 * canvas.dpi) : 0; // 12px
    // Hazard height is capped so the row + source seal both fit the square.
    const availTopH = rightSq.height - srcH - srcGap;
    let hazW = Math.round((rightSq.width - gap * (n - 1)) / n);
    let hazH = Math.round(hazW * FAMILY_ASPECT.hazard);
    if (hazH > availTopH) {
      hazH = availTopH;
      hazW = Math.round(hazH / FAMILY_ASPECT.hazard);
    }
    const rowW = hazW * n + gap * (n - 1);
    const rowLeft = Math.round(rightSq.left + (rightSq.width - rowW) / 2); // centre the row
    hazards.forEach((b, i) => {
      placed.push({
        badge: b,
        rect: { left: rowLeft + i * (hazW + gap), top: rightSq.top, width: hazW, height: hazH },
      });
    });
    if (source) {
      placed.push({ badge: source, rect: centeredIn(rightSq, srcH, srcH, rightSq.height - srcH) });
    }
  } else if (source) {
    // No hazards → source centred in the right square.
    const srcH = Math.round(0.36 * canvas.dpi);
    placed.push({ badge: source, rect: centeredIn(rightSq, srcH, srcH, (rightSq.height - srcH) / 2) });
  }

  return placed;
}

/** Folio (page number) rect: bottom-centre, 0.5in up from the trim edge. */
export function computeFolioRect(canvas: CanvasPx): PxRect {
  const trimBottom = canvas.height - Math.round(SPACING.bleedIn * canvas.dpi); // 3337
  const up = Math.round(SPACING.badgeClearFromTrimIn * canvas.dpi); // 0.5in = 150px
  const w = Math.round(1.5 * canvas.dpi); // 450px text box
  const h = Math.round(0.3 * canvas.dpi); // 90px
  return {
    left: Math.round((canvas.width - w) / 2),
    top: trimBottom - up - h,
    width: w,
    height: h,
  };
}

/** Assert every placed badge sits inside the canvas (sanity for preflight). */
export function allWithinCanvas(placed: PlacedBadge[], canvas: CanvasPx): boolean {
  return placed.every(
    (p) =>
      p.rect.left >= 0 &&
      p.rect.top >= 0 &&
      p.rect.left + p.rect.width <= canvas.width &&
      p.rect.top + p.rect.height <= canvas.height,
  );
}
