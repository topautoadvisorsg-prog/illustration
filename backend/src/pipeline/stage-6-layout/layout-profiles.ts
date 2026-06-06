/**
 * Stage 6 — per-layout composition profiles (full-page-artwork model).
 *
 * What it does: for each of the 16 canonical layouts, declares how much of the
 * page is the text-safe zone (where body text overlays the artwork) and where
 * the image-priority zone (the strong-content edge of the artwork) sits. The
 * text-fit analyzer uses `textAreaFactor`; the HTML renderer uses `artSlot` as
 * the image-priority edge identifier. These are estimates calibrated against
 * the layout mockups and confirmed by the real Paged.js render.
 *
 * `ArtSlot` keeps its name internally for back-compat (every file imports it);
 * semantically it now identifies the **image-priority edge** of the page, not
 * a slot/box. The image IS the full page; this edge tells us where the strongest
 * visual content lives so the text-safe zone can sit on the calm side.
 */

import type { LayoutTemplateId } from '@wildlands/shared';

/**
 * The image-priority edge of the page — where the strongest visual content
 * lives in the full-page artwork. (Named `ArtSlot` for back-compat across many
 * files; new code should treat it as `ImagePriorityEdge`.)
 */
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
  /** Fraction of the page available to body copy in the text-safe zone (0-1). */
  textAreaFactor: number;
  /** The image-priority edge (where focal visual content lives in the artwork). */
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

/**
 * Layouts whose illustration is a SHARED, subject-agnostic decoration (a thin
 * edge/margin border on a text-dominant page) that recurs throughout the book.
 * For these, the operator can generate the art ONCE and reuse the same asset on
 * every page of that layout instead of paying to regenerate a near-identical
 * border per page. Every other layout is a unique, subject-specific illustration.
 */
const REPEATABLE_LAYOUTS = new Set<LayoutTemplateId>([
  'LAYOUT_2_TEXT_HEAVY',
  'LAYOUT_6_BACK_MATTER',
  'LAYOUT_8_MARGIN_ILLUSTRATION',
]);

export function isRepeatableLayout(template: LayoutTemplateId): boolean {
  return REPEATABLE_LAYOUTS.has(template);
}

/** Human-readable placement label for each image-priority edge. */
const ART_SLOT_LABELS: Record<ArtSlot, string> = {
  FLOAT_LEFT: 'inset left',
  FLOAT_RIGHT: 'inset right',
  TOP_BAND: 'top band',
  BOTTOM_BAND: 'bottom band',
  FULL_PAGE: 'full page',
  SIDEBAR_RIGHT: 'right sidebar',
  SCATTERED: 'scattered studies',
  CENTER_WRAP: 'center wrap',
};

/**
 * Coverage metadata an agent or operator can read WITHOUT looking at pixels:
 * how much of the page is the image-priority zone vs the text-safe zone, and
 * where the image-priority edge sits. Derived from the layout profile so
 * reuse/QA reason over numbers, not the artwork itself.
 */
export interface LayoutCoverageMeta {
  imagePercent: number;
  textPercent: number;
  placement: ArtSlot;
  placementLabel: string;
  /** True when one shared border image can serve every page of this layout. */
  repeatable: boolean;
  /** e.g. "80% image · 20% text · top band" */
  summary: string;
}

export function layoutCoverageMeta(template: LayoutTemplateId): LayoutCoverageMeta {
  const profile = getLayoutProfile(template);
  const imagePercent = Math.round(profile.artAreaFraction * 100);
  const textPercent = Math.max(0, 100 - imagePercent);
  const placementLabel = ART_SLOT_LABELS[profile.artSlot] ?? profile.artSlot.toLowerCase().replace(/_/g, ' ');
  const repeatable = REPEATABLE_LAYOUTS.has(template);
  return {
    imagePercent,
    textPercent,
    placement: profile.artSlot,
    placementLabel,
    repeatable,
    summary: `${imagePercent}% image · ${textPercent}% text · ${placementLabel}${repeatable ? ' · repeating' : ''}`,
  };
}
