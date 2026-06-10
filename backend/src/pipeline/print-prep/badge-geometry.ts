/**
 * Badge + folio placement geometry (STD-3 Print-Prep).
 *
 * Pure, deterministic pixel math for the L-7.2 stamping model (LOCKED):
 * the AI composes the full page with zero reserved zones; print-prep stamps
 * ALL metadata (region, hazards, source, folio) into one small bottom-right
 * cartouche — a soft parchment patch that covers whatever artwork sits
 * underneath. computeBadgeStackLayout owns the placement; buildCartoucheSvg
 * owns the backing.
 */

import { SPACING } from '../publishing-standard/index.js';
import type { StampableBadge } from '../publishing-standard/index.js';

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
 * (SPEC_GEOMETRY_RECONCILIATION §1) — callers MUST pass
 * `resolveGeometry(config).canvasIn`. No default fallback: an omitted canvas
 * is how the trim-mismatch bug crept in originally.
 */
export function standardCanvas(canvasIn: { w: number; h: number }): CanvasPx {
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

// L-7.2 removed the spread layout (region bottom-left / hazards+source
// bottom-right / folio bottom-centre). All stamping now goes through
// computeBadgeStackLayout below. The old computeBadgeLayout/computeFolioRect
// were deleted in the P1 final-lock self-review (dead production code).

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

// ─── L-7.2 — Bottom-right corner stack with parchment cartouche ────────────
//
// Replaces the wide "stamping band" of L-7/L-7.1. All metadata (region,
// hazards, source, folio) goes into one tiny stack in the bottom-right
// corner. A soft parchment-colored cartouche sits behind the stack to hide
// any illustration detail underneath. The AI now gets the full page
// composition back — no reserved zones, no clipping.
//
// Geometry (inches):
//   inset from canvas right + bottom : 0.375 in (KDP safe + bleed)
//   cartouche outer max               : 0.75 × 1.30 in (shrinks if items absent)
//   stack padding inside cartouche    : 0.10 in
//   stack items                       : region (0.32) → hazards (0.28) → source (0.20) → folio (0.20)
//   gap between items                 : 0.05 in
//
// The cartouche SVG uses a Gaussian-blurred ellipse so the edges blend into
// the underlying artwork rather than reading as a digital widget.

// L-7.2.1 — tightened corner mark. Operator review: cartouche was floating
// inside the composition, parchment backing nearly invisible, total footprint
// felt sidebar-sized rather than corner-mark sized. Constants below tuned to:
//   - sit ~0.125 in from the TRIM edge (canvas inset 0.25 = trim inset 0.125
//     for 0.125 bleed; matches KDP minimum content-inside-trim)
//   - render the cartouche as a clearly-visible parchment patch (less blur)
//   - take less vertical real estate so the swag stays the dominant ornament
// P1 final lock (L-7.2.3): stack compacted another ~8 % per operator's
// "slightly more compact" instruction. Position (inset) is LOCKED at the
// L-7.2.1-approved value — do not change without operator sign-off.
const STACK_INSET_IN = 0.25;
const STACK_MAX_WIDTH_IN = 0.46;
const STACK_PADDING_IN = 0.07;
const STACK_GAP_IN = 0.04;
const STACK_ITEM_HEIGHTS_IN = {
  region: 0.26,
  hazards: 0.22,
  source: 0.17,
  folio: 0.17,
} as const;

export interface BadgeStackResult {
  /** Soft parchment backing — rendered FIRST, behind all items. */
  cartoucheRect: PxRect;
  /** Each stamped badge, in render order. */
  placedBadges: PlacedBadge[];
  /** Folio (page number) text rect, if a folio was supplied. */
  folio: { rect: PxRect; label: string } | null;
}

/**
 * L-7.2 — place every badge + folio inside one bottom-right cartouche.
 *
 * @param badges    region (≤1), hazards (≤2), source (≤1), in any order
 * @param folioLabel  page number string, or null to suppress folio
 * @param canvas    300-DPI canvas dims
 */
export function computeBadgeStackLayout(
  badges: StampableBadge[],
  folioLabel: string | null,
  canvas: CanvasPx,
): BadgeStackResult {
  const inset = Math.round(STACK_INSET_IN * canvas.dpi);
  const stackWidth = Math.round(STACK_MAX_WIDTH_IN * canvas.dpi);
  const padding = Math.round(STACK_PADDING_IN * canvas.dpi);
  const gap = Math.round(STACK_GAP_IN * canvas.dpi);

  const region = badges.find((b) => b.family === 'region');
  const hazards = badges.filter((b) => b.family === 'hazard').sort((a, b) => a.order - b.order);
  const source = badges.find((b) => b.family === 'source');
  const hasFolio = !!folioLabel;

  // Compute stack inner height by summing only the items that exist.
  // (P1 fix: the original gap accounting keyed off a never-populated array,
  // so the cartouche missed one gap per item after the first and the folio
  // hung ~14 px below the solid core — caught by the containment test.)
  let itemCount = 0;
  let stackInnerHeight = 0;
  const addItem = (heightIn: number) => {
    const h = Math.round(heightIn * canvas.dpi);
    if (itemCount > 0) stackInnerHeight += gap;
    itemCount += 1;
    stackInnerHeight += h;
    return h;
  };
  const regionH = region ? addItem(STACK_ITEM_HEIGHTS_IN.region) : 0;
  const hazardsH = hazards.length > 0 ? addItem(STACK_ITEM_HEIGHTS_IN.hazards) : 0;
  const sourceH = source ? addItem(STACK_ITEM_HEIGHTS_IN.source) : 0;
  const folioH = hasFolio ? addItem(STACK_ITEM_HEIGHTS_IN.folio) : 0;

  // Cartouche outer = stack + padding all around.
  const cartoucheWidth = stackWidth + padding * 2;
  const cartoucheHeight = stackInnerHeight + padding * 2;
  const cartoucheRect: PxRect = {
    left: canvas.width - inset - cartoucheWidth,
    top: canvas.height - inset - cartoucheHeight,
    width: cartoucheWidth,
    height: cartoucheHeight,
  };

  // Stack inner origin = cartouche + padding.
  const stackLeft = cartoucheRect.left + padding;
  let cursorTop = cartoucheRect.top + padding;
  const advance = (h: number): number => {
    const y = cursorTop;
    cursorTop += h + gap;
    return y;
  };

  const placedBadges: PlacedBadge[] = [];

  if (region && regionH > 0) {
    const w = Math.round(regionH / FAMILY_ASPECT.region);
    const x = stackLeft + Math.round((stackWidth - w) / 2);
    placedBadges.push({
      badge: region,
      rect: { left: x, top: advance(regionH), width: w, height: regionH },
    });
  }

  if (hazards.length > 0 && hazardsH > 0) {
    const n = hazards.length;
    const innerGap = n > 1 ? Math.round(0.02 * canvas.dpi) : 0;
    let hazW = Math.round((stackWidth - innerGap * (n - 1)) / n);
    let hazH = Math.round(hazW * FAMILY_ASPECT.hazard);
    if (hazH > hazardsH) {
      hazH = hazardsH;
      hazW = Math.round(hazH / FAMILY_ASPECT.hazard);
    }
    const rowW = hazW * n + innerGap * (n - 1);
    const rowLeft = stackLeft + Math.round((stackWidth - rowW) / 2);
    const rowTop = advance(hazardsH);
    hazards.forEach((b, i) => {
      placedBadges.push({
        badge: b,
        rect: { left: rowLeft + i * (hazW + innerGap), top: rowTop, width: hazW, height: hazH },
      });
    });
  }

  if (source && sourceH > 0) {
    const w = sourceH; // square aspect 1.0
    const x = stackLeft + Math.round((stackWidth - w) / 2);
    placedBadges.push({
      badge: source,
      rect: { left: x, top: advance(sourceH), width: w, height: sourceH },
    });
  }

  let folio: BadgeStackResult['folio'] = null;
  if (hasFolio && folioH > 0) {
    folio = {
      rect: {
        left: stackLeft,
        top: advance(folioH),
        width: stackWidth,
        height: folioH,
      },
      label: folioLabel!,
    };
  }

  return { cartoucheRect, placedBadges, folio };
}

/**
 * L-7.2 — soft-edged parchment cartouche that sits BEHIND the badge stack.
 * The ellipse is Gaussian-blurred so the edges fade into the artwork instead
 * of reading as a hard digital rectangle. Returns the SVG document body
 * (caller rasterizes with sharp).
 */
export function buildCartoucheSvg(rect: PxRect, parchmentHex: string): string {
  const w = rect.width;
  const h = rect.height;
  const cx = w / 2;
  const cy = h / 2;
  // Inset the ellipse so the blur halo stays inside the SVG viewBox.
  const rx = (w / 2) * 0.95;
  const ry = (h / 2) * 0.95;
  // P1 final lock (L-7.2.3) — two-layer cartouche. A single blurred ellipse
  // softened its own CENTER as well as the rim, so the backing read as a
  // faint wash and the badges looked like floaters. Now:
  //   layer 1: blurred halo ellipse — feathers the edge into the artwork
  //   layer 2: solid core ellipse (88 % of the radius, no filter) — a fully
  //            opaque parchment patch guaranteed under every stamp
  const blur = Math.max(3, Math.round(Math.min(w, h) * 0.035));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><filter id="soft" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feGaussianBlur stdDeviation="${blur}"/></filter></defs>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${parchmentHex}" filter="url(#soft)"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.88}" ry="${ry * 0.88}" fill="${parchmentHex}"/>` +
    `</svg>`
  );
}
