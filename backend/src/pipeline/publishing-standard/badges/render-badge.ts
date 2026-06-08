/**
 * Badge SVG renderer (Standard v1.2 — Badge System owner).
 *
 * Pure, deterministic, no I/O. Produces a self-contained SVG string per badge
 * value, composed from icon primitives + the Standard's colour tokens.
 *
 * Rule Zero: this module hardcodes NO colour. Every fill/stroke comes from the
 * Standard (REGION_BADGES / HAZARD_BADGES colour, PALETTE.ink). One shape per
 * family so they never read as each other:
 *   region  → circular ring + icon + small-caps label
 *   hazard  → rounded shield + icon
 *   source  → wax-seal roundel + lettermark
 *
 * Badges are stamped by Print-Prep (STD-3) which rasterizes these SVGs at
 * 600 DPI and composites them into the 300 DPI page. No stamping here.
 */

import type { HazardBadge, RegionBadge, SourceBadge } from '@wildlands/shared';
import {
  HAZARD_BADGES,
  HAZARD_DISPLAY_ORDER,
  PALETTE,
  REGION_BADGES,
} from '../standard.js';

const INK = PALETTE.ink.hex;

// ── Icon primitives — minimal engraved line icons, centred in a 100×100 field,
//    drawn in INK. Stroke-only (engraving feel), ~±22 units around centre 50,46.
//    Kept simple + legible at ~0.5in (the approved "minimal set, upgrade later").
const REGION_ICONS: Record<RegionBadge, string> = {
  FOREST: '<path d="M50 28 L40 48 H60 Z M50 38 L42 54 H58 Z M48 54 H52 V62 H48 Z"/>',
  MOUNTAIN: '<path d="M30 60 L44 34 L52 48 L58 40 L70 60 Z"/>',
  RIVER: '<path d="M30 44 q8 -8 14 0 t14 0 t14 0 M30 54 q8 -8 14 0 t14 0 t14 0"/>',
  WETLAND: '<path d="M40 60 V36 M40 36 q-4 -4 0 -8 M50 60 V32 M50 32 q-4 -4 0 -8 M60 60 V38 M60 38 q-4 -4 0 -8 M32 60 H68"/>',
  COASTAL: '<path d="M30 40 q8 -8 14 0 t14 0 t14 0 M30 56 H70 M36 56 q6 -6 10 0"/>',
  ALPINE: '<path d="M32 60 L46 32 H54 L68 60 Z M44 40 H56"/>',
  FIELD: '<path d="M38 60 V40 M38 40 q-3 -6 -6 -8 M38 40 q3 -6 6 -8 M50 60 V36 M50 36 q-3 -6 -6 -8 M50 36 q3 -6 6 -8 M62 60 V40 M62 40 q-3 -6 -6 -8 M62 40 q3 -6 6 -8"/>',
  GENERAL: '<path d="M50 26 L56 46 L74 46 L60 58 L66 78 L50 64 L34 78 L40 58 L26 46 L44 46 Z"/>',
};

const HAZARD_ICONS: Record<Exclude<HazardBadge, 'NONE'>, string> = {
  // Skull
  DEADLY: '<path d="M50 30 q-16 0 -16 16 q0 8 6 12 v6 q0 4 4 4 h12 q4 0 4 -4 v-6 q6 -4 6 -12 q0 -16 -16 -16 Z"/><circle cx="44" cy="46" r="3" fill="' + INK + '"/><circle cx="56" cy="46" r="3" fill="' + INK + '"/><path d="M48 56 L50 60 L52 56"/>',
  // Leaf with slash (toxic)
  TOXIC: '<path d="M38 58 q0 -20 24 -28 q4 22 -24 28 Z M40 40 L62 36"/><path d="M34 32 L66 64"/>',
  // Fang
  VENOMOUS: '<path d="M40 32 H60 L54 50 Q50 60 46 50 Z"/>',
  // Horns
  AGGRESSIVE: '<path d="M40 50 q-12 -2 -10 -18 q10 4 12 16 M60 50 q12 -2 10 -18 q-10 4 -12 16 M42 50 q8 6 16 0"/>',
  // Exclamation
  CAUTION: '<path d="M50 30 L46 56 H54 Z"/><circle cx="50" cy="64" r="3" fill="' + INK + '"/>',
  // Magnifier
  EXPERT_REVIEW: '<circle cx="46" cy="44" r="12"/><path d="M55 53 L66 64"/>',
  // Leaf with check
  EDIBLE: '<path d="M36 56 q0 -20 24 -26 q4 20 -24 26 Z"/><path d="M40 50 L46 56 L60 38"/>',
  // Mortar & pestle
  MEDICINAL: '<path d="M36 46 H64 Q60 64 50 64 Q40 64 36 46 Z M44 46 L60 30 M58 28 L66 32"/>',
};

const SOURCE_LETTER: Record<SourceBadge, string> = {
  SCIENTIFIC_LITERATURE: 'S',
  FIELD_GUIDE: 'F',
  TRADITIONAL_USE: 'T',
  HISTORICAL_SOURCE: 'H',
  GENERAL_REFERENCE: 'G',
};

const SERIF = "Georgia, 'EB Garamond', 'Times New Roman', serif";

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ${(height / width) * 100}" width="${width}" height="${height}">${body}</svg>`;
}

/** Region badge: colour ring + INK icon + small-caps label. */
export function renderRegionBadge(value: RegionBadge): string {
  const ring = REGION_BADGES[value].colorHex;
  const label = REGION_BADGES[value].label;
  const body =
    `<circle cx="50" cy="46" r="40" fill="none" stroke="${ring}" stroke-width="4"/>` +
    `<g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${REGION_ICONS[value]}</g>` +
    `<text x="50" y="108" text-anchor="middle" font-family="${SERIF}" font-size="13" letter-spacing="1.5" fill="${INK}">${label}</text>`;
  return svg(100, 120, body);
}

/** Hazard badge: colour shield + INK icon. NONE renders nothing. */
export function renderHazardBadge(value: HazardBadge): string {
  if (value === 'NONE') return '';
  const shield = HAZARD_BADGES[value].colorHex;
  const shieldPath = 'M50 14 L84 26 V52 Q84 80 50 96 Q16 80 16 52 V26 Z';
  const body =
    `<path d="${shieldPath}" fill="none" stroke="${shield}" stroke-width="4" stroke-linejoin="round"/>` +
    `<g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${HAZARD_ICONS[value]}</g>`;
  return svg(100, 110, body);
}

/** Source badge: wax-seal roundel + lettermark, monochrome ink. */
export function renderSourceBadge(value: SourceBadge): string {
  const letter = SOURCE_LETTER[value];
  const body =
    `<circle cx="50" cy="50" r="40" fill="none" stroke="${INK}" stroke-width="3"/>` +
    `<circle cx="50" cy="50" r="33" fill="none" stroke="${INK}" stroke-width="1"/>` +
    `<text x="50" y="65" text-anchor="middle" font-family="${SERIF}" font-size="44" font-weight="600" fill="${INK}">${letter}</text>`;
  return svg(100, 100, body);
}

export type BadgeFamily = 'region' | 'hazard' | 'source';

/** Single entry point: render any badge by family + value. */
export function renderBadgeSvg(family: BadgeFamily, value: string): string {
  if (family === 'region') return renderRegionBadge(value as RegionBadge);
  if (family === 'hazard') return renderHazardBadge(value as HazardBadge);
  return renderSourceBadge(value as SourceBadge);
}

export { HAZARD_DISPLAY_ORDER };
