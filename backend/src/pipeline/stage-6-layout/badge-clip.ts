/**
 * L-7.1 — Clip a LayoutAllocation so text / image zones don't overlap the
 * badge-safe band.
 *
 * The original L-7 painted reserved rects on top of the existing text and
 * image zones in the blueprint. That sent contradictory instructions to the
 * model: "fill this red rectangle with text" + "leave this black square
 * inside the red rectangle empty." Result: collisions, exactly what we saw
 * in the 2026-06-09 review.
 *
 * The fix: badge zones own their geometry. Text and image zones STOP above
 * the badge band. The blueprint shows three non-overlapping classes:
 *   - RED text-safe / typography
 *   - BLUE primary image
 *   - YELLOW reserved badge / folio
 *
 * Pure function — no I/O, deterministic. Same allocation in → same clipped
 * allocation out.
 */

import type { LayoutAllocation, PlanningZone } from './layout-director.js';
import type { BadgeSafeZone } from '../publishing-standard/badge-zones.js';

/**
 * Clip every zone so its bottom edge does not extend below the top of the
 * highest badge-safe zone. Empty badgeSafeZones → no clipping (legacy
 * behaviour). The clip is conservative: it uses the minimum y across all
 * badge zones (folio strip OR corner squares, whichever sits higher) so
 * one band suffices for the whole bottom area.
 */
export function clipAllocationForBadgeBand(
  allocation: LayoutAllocation,
  badgeSafeZones: BadgeSafeZone[],
  canvasIn: { w: number; h: number },
): LayoutAllocation {
  if (badgeSafeZones.length === 0) return allocation;

  // The highest top edge (smallest yIn) across every reserved rect.
  // Everything below this line belongs to the stamping band.
  const minBadgeYIn = Math.min(...badgeSafeZones.map((z) => z.yIn));
  const maxYPct = (minBadgeYIn / canvasIn.h) * 100;

  const clip = (z: PlanningZone): PlanningZone => {
    const bottom = z.yPct + z.heightPct;
    if (bottom <= maxYPct) return z;
    const newHeight = Math.max(0, maxYPct - z.yPct);
    return { ...z, heightPct: newHeight };
  };

  // Drop zones that get clipped to zero height — they convey nothing to the
  // AI and would just confuse the prompt.
  const keep = (z: PlanningZone): boolean => z.heightPct > 0.5;

  return {
    ...allocation,
    textSafeZones: allocation.textSafeZones.map(clip).filter(keep),
    typographyZones: allocation.typographyZones.map(clip).filter(keep),
    imagePriorityZones: allocation.imagePriorityZones.map(clip).filter(keep),
    regions: allocation.regions.map(clip).filter(keep),
  };
}
