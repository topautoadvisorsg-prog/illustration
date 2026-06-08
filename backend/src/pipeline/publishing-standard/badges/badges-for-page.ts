/**
 * Badge stamping contract (Standard v1.2 — Badge System owner).
 *
 * Converts a page's `badgeSet` (region + hazards + source, from the manifest)
 * into the ordered list of stampable badges Print-Prep (STD-3) composites. The
 * Badge System owns WHICH badge, WHICH corner, and the stack ORDER. Print-Prep
 * owns only the rasterize + composite act.
 *
 * Rules (operator-approved):
 *   - region  → bottom-left, single.
 *   - hazard  → bottom-right, most-severe-first (HAZARD_DISPLAY_ORDER), MAX 2
 *               (a 3rd+ is dropped — never overcrowd the corner). NONE omitted.
 *   - source  → bottom-right, after the hazards.
 */

import type { Badge, HazardBadge } from '@wildlands/shared';
import { renderBadgeSvg, HAZARD_DISPLAY_ORDER, type BadgeFamily } from './render-badge.js';

export const MAX_HAZARD_BADGES_PER_PAGE = 2;

export interface StampableBadge {
  family: BadgeFamily;
  value: string;
  /** Self-contained SVG (Print-Prep rasterizes at 600 DPI). */
  svg: string;
  corner: 'bottom-left' | 'bottom-right';
  /** Stack order within the corner; 0 = outermost (drawn first / most prominent). */
  order: number;
}

function severity(h: string): number {
  const i = HAZARD_DISPLAY_ORDER.indexOf(h as HazardBadge);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

/**
 * Build the ordered stampable badge set for a page. Pure; deterministic.
 * Accepts the manifest `badgeSet` (already `[region, hazard…, source]`) but
 * re-derives corners + ordering itself so it never trusts upstream ordering.
 */
export function badgesForPage(badgeSet: Badge[] | null | undefined): StampableBadge[] {
  const set = badgeSet ?? [];
  const out: StampableBadge[] = [];

  // Region — single, bottom-left.
  const region = set.find((b) => b.family === 'region');
  if (region) {
    out.push({ family: 'region', value: region.value, svg: renderBadgeSvg('region', region.value), corner: 'bottom-left', order: 0 });
  }

  // Hazards — bottom-right, most-severe-first, drop NONE, cap at MAX.
  const hazards = set
    .filter((b) => b.family === 'hazard' && b.value !== 'NONE')
    .map((b) => b.value)
    .sort((a, b) => severity(a) - severity(b))
    .slice(0, MAX_HAZARD_BADGES_PER_PAGE);
  hazards.forEach((value, i) => {
    out.push({ family: 'hazard', value, svg: renderBadgeSvg('hazard', value), corner: 'bottom-right', order: i });
  });

  // Source — bottom-right, after the hazards.
  const source = set.find((b) => b.family === 'source');
  if (source) {
    out.push({ family: 'source', value: source.value, svg: renderBadgeSvg('source', source.value), corner: 'bottom-right', order: hazards.length });
  }

  return out;
}
