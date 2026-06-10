/**
 * L-7 — Single source of truth for badge / folio safe zones.
 *
 * Every downstream consumer reads from this module:
 *
 *   computeBadgeSafeZones()
 *       │
 *       ├── print-prep/badge-geometry.ts   (stamper — converts to pixels)
 *       ├── build-page-spec.ts             (writes into WholePageSpec)
 *       ├── assemble-experiment-prompt.ts  (emits the "leave clean" clause)
 *       ├── stage-3-generation/blueprint.ts (paints visual markers on blueprint PNG)
 *       └── services/render-proof/build-package.ts (proof.authority.zones.badgeSafeZones)
 *
 * Drift between the AI's "leave visually clean" instruction and the rect
 * print-prep stamps into is the bug L-7 fixes. Both halves derive numbers
 * from this module — never from inline literals.
 *
 * Coordinates: INCHES from canvas top-left. This matches every other zone
 * shape in the WholePageSpec. Pixel conversions happen at the call site
 * (print-prep multiplies by DPI; blueprint paints rects directly).
 */

import { BADGE_PLACEMENT, SPACING } from './standard.js';

/** KDP keep-content-inside margin from trim edge. Matches existing print-prep
 *  constant — kept here for the centralisation rule. */
const KDP_SAFE_IN = 0.25;

/** Geometry constants the stamper, prompt, blueprint, and proof all read. */
export const BADGE_ZONE_GEOMETRY = {
  /** Inset from canvas edge to the safe square (bleed + KDP safe). */
  insetIn: SPACING.bleedIn + KDP_SAFE_IN,
  /** Side of the reserved corner square. Sourced from the locked Standard. */
  safeZoneIn: BADGE_PLACEMENT.safeZoneIn,
  /** Folio text box width. */
  folioWidthIn: 1.5,
  /** Folio text box height. */
  folioHeightIn: 0.3,
  /** Folio rises this far from the trim bottom edge. */
  folioClearFromTrimIn: SPACING.badgeClearFromTrimIn,
} as const;

/** A reserved rectangle the AI must leave visually clean. */
export interface BadgeSafeZone {
  /** Stable id so downstream consumers can target specific zones (paint, audit). */
  id: 'badge-region-corner' | 'badge-hazard-source-corner' | 'folio-strip';
  /** What gets stamped here — badge metadata or the page number. */
  role: 'badge' | 'folio';
  /** Rect in inches from canvas top-left. */
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}

/** Just the badgeContext fields the zone helper needs. Decoupled from the
 *  WholePageSpec type so the helper has no upstream import cycle. */
export interface BadgeContextForZones {
  hazard: readonly string[];
  region: string;
  source: string;
}

export interface ComputeBadgeSafeZonesInput {
  badgeContext: BadgeContextForZones;
  /** Layout family ID. Drives O-7 folio suppression on full-page art. */
  layoutFamily: string;
  /** Resolved canvas dims (single source of truth — pass resolveGeometry().canvasIn). */
  canvasIn: { w: number; h: number };
}

/** Layout families that suppress the folio. O-7 — drop on full-page art unless
 *  final assembly explicitly overrides. */
const FOLIO_DROPPED_LAYOUTS = new Set<string>([
  'LAYOUT_F_FULL_ILLUSTRATION',
  // Future: LAYOUT_F_SPREAD_LEFT / LAYOUT_F_SPREAD_RIGHT once spread-aware
  // pagination ships (L-6 v1.1).
]);

/**
 * Decide which safe-zone rects this page needs.
 *
 * Rules (locked 2026-06-09):
 * - **O-6 zero-badge release.** If `badgeContext` has no region, no hazards,
 *   and no source, the badge corner zones are NOT reserved — the AI gets the
 *   full text frame back. Only the folio zone (if applicable) remains.
 * - **O-7 folio drop on LAYOUT_F.** Layouts in `FOLIO_DROPPED_LAYOUTS` do
 *   not reserve the folio strip. Final book assembly can still stamp a
 *   folio if its own rules require one — but the AI is not told to leave
 *   space for it.
 * - Region zone is only reserved when a region badge exists.
 * - Hazard+source zone is only reserved when either is present (the corner
 *   houses both, so one or both presence triggers it).
 */
export function computeBadgeSafeZones(input: ComputeBadgeSafeZonesInput): BadgeSafeZone[] {
  const { badgeContext, layoutFamily, canvasIn } = input;
  const zones: BadgeSafeZone[] = [];

  const hasRegion = !!badgeContext.region;
  const hasHazards = badgeContext.hazard.length > 0;
  const hasSource = !!badgeContext.source;
  const hasAnyBadge = hasRegion || hasHazards || hasSource;

  const { insetIn, safeZoneIn, folioWidthIn, folioHeightIn, folioClearFromTrimIn } =
    BADGE_ZONE_GEOMETRY;
  const safeTopIn = canvasIn.h - insetIn - safeZoneIn;

  if (hasAnyBadge) {
    if (hasRegion) {
      zones.push({
        id: 'badge-region-corner',
        role: 'badge',
        xIn: insetIn,
        yIn: safeTopIn,
        widthIn: safeZoneIn,
        heightIn: safeZoneIn,
      });
    }
    if (hasHazards || hasSource) {
      zones.push({
        id: 'badge-hazard-source-corner',
        role: 'badge',
        xIn: canvasIn.w - insetIn - safeZoneIn,
        yIn: safeTopIn,
        widthIn: safeZoneIn,
        heightIn: safeZoneIn,
      });
    }
  }

  if (!FOLIO_DROPPED_LAYOUTS.has(layoutFamily)) {
    const trimBottomIn = canvasIn.h - SPACING.bleedIn;
    zones.push({
      id: 'folio-strip',
      role: 'folio',
      xIn: (canvasIn.w - folioWidthIn) / 2,
      yIn: trimBottomIn - folioClearFromTrimIn - folioHeightIn,
      widthIn: folioWidthIn,
      heightIn: folioHeightIn,
    });
  }

  return zones;
}
