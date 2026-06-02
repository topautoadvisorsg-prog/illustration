/**
 * Stage 6 — per-layout composition profiles.
 *
 * What it does: for each of the 16 canonical layouts, declares how much of the
 * text frame is actually available to body copy (the rest is the art slot) and
 * where the art sits. The text-fit analyzer uses `textAreaFactor` to estimate
 * capacity; the HTML renderer uses `artSlot` to place the (clean, text-free)
 * illustration. These are estimates calibrated against the layout mockups and
 * confirmed by the real Paged.js render.
 */

import type { LayoutTemplateId } from '@wildlands/shared';

// Mirrors the shared Architecture enum so a composed layout's architecture maps
// 1:1 to a render art slot.
export type ArtSlot =
  | 'FLOAT_LEFT'
  | 'FLOAT_RIGHT'
  | 'TOP_BAND'
  | 'BOTTOM_BAND'
  | 'FULL_PAGE'
  | 'SIDEBAR_RIGHT'
  | 'SCATTERED'
  | 'CENTER_WRAP';

export interface LayoutProfile {
  /** Fraction of the text frame available to body copy after the art slot (0-1). */
  textAreaFactor: number;
  artSlot: ArtSlot;
  /** Approximate fraction of page area the illustration occupies. */
  artAreaFraction: number;
  /** True for cover/opener/plate pages where text is decorative, not educational. */
  textLight: boolean;
}

export const LAYOUT_PROFILES: Record<LayoutTemplateId, LayoutProfile> = {
  LAYOUT_1_STANDARD: { textAreaFactor: 0.8, artSlot: 'FLOAT_LEFT', artAreaFraction: 0.32, textLight: false },
  LAYOUT_2_TEXT_HEAVY: { textAreaFactor: 0.92, artSlot: 'FLOAT_LEFT', artAreaFraction: 0.14, textLight: false },
  LAYOUT_3_ILLUSTRATION_DOMINANT: { textAreaFactor: 0.55, artSlot: 'FLOAT_RIGHT', artAreaFraction: 0.5, textLight: false },
  LAYOUT_4_DANGER_WARNING: { textAreaFactor: 0.72, artSlot: 'FLOAT_LEFT', artAreaFraction: 0.34, textLight: false },
  LAYOUT_5_CHAPTER_OPENER: { textAreaFactor: 0.3, artSlot: 'TOP_BAND', artAreaFraction: 0.55, textLight: true },
  LAYOUT_6_BACK_MATTER: { textAreaFactor: 0.95, artSlot: 'FLOAT_RIGHT', artAreaFraction: 0.1, textLight: false },
  LAYOUT_7_SCATTERED_VIGNETTES: { textAreaFactor: 0.7, artSlot: 'SCATTERED', artAreaFraction: 0.36, textLight: false },
  LAYOUT_8_MARGIN_ILLUSTRATION: { textAreaFactor: 0.78, artSlot: 'FLOAT_RIGHT', artAreaFraction: 0.26, textLight: false },
  LAYOUT_9_DIAGNOSTIC_DIAGRAM: { textAreaFactor: 0.7, artSlot: 'SCATTERED', artAreaFraction: 0.38, textLight: false },
  LAYOUT_10_FULL_PAGE_PLATE: { textAreaFactor: 0.12, artSlot: 'FULL_PAGE', artAreaFraction: 0.95, textLight: true },
  LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD: { textAreaFactor: 0.3, artSlot: 'TOP_BAND', artAreaFraction: 0.6, textLight: true },
  LAYOUT_12_DIAGNOSTIC_DIAGRAM: { textAreaFactor: 0.62, artSlot: 'TOP_BAND', artAreaFraction: 0.42, textLight: false },
  LAYOUT_13_FEATURE_BANNER: { textAreaFactor: 0.65, artSlot: 'TOP_BAND', artAreaFraction: 0.4, textLight: false },
  LAYOUT_14_SIDEBAR_FEATURE: { textAreaFactor: 0.7, artSlot: 'SIDEBAR_RIGHT', artAreaFraction: 0.3, textLight: false },
  LAYOUT_15_PROGRESSION_STUDY: { textAreaFactor: 0.62, artSlot: 'TOP_BAND', artAreaFraction: 0.42, textLight: false },
  LAYOUT_16_CUTAWAY_FEATURE: { textAreaFactor: 0.6, artSlot: 'TOP_BAND', artAreaFraction: 0.44, textLight: false },
};

export function getLayoutProfile(template: LayoutTemplateId): LayoutProfile {
  return LAYOUT_PROFILES[template] ?? LAYOUT_PROFILES.LAYOUT_1_STANDARD;
}
