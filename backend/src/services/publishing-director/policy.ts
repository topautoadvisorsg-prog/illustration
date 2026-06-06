/**
 * Publishing Director policy — the editable decision table.
 *
 * Every threshold the Director uses lives here so operators can tune sensitivity
 * per project without code changes. Defaults match the historical hardcoded
 * values in text-fit and page-quality-review.
 */

import type { LayoutTemplateId } from '@wildlands/shared';
import { getLayoutProfile } from '../../pipeline/stage-6-layout/layout-profiles.js';

export interface PublishingDirectorPolicy {
  /** Master toggle. */
  enabled: boolean;
  // Underfilled
  /** Below this fillRatio (default 0.25), the page is flagged underfilled — non-textLight layouts only. */
  underfilledFillRatio: number;
  /** Word count below which an UNDERFILLED page is proposed for the full-page plate. */
  underfilledFullPlateMaxWords: number;
  // Tiny continuation
  /** When estimatedRenderedPages > 1 and the last page fills less than this, flag as awkward tail. */
  tinyContinuationTailRatio: number;
  // Layout repetition
  /** Per chapter: % of pages on the same layout that triggers a repetition finding. */
  layoutRepetitionPercent: number;
  /** Chapter must have at least this many pages to be evaluated for repetition. */
  layoutRepetitionMinChapterPages: number;
  // Overflow
  /** fillRatio above this triggers an OVERFLOW proposal (real overflow, not just tight). */
  overflowFillRatio: number;
  // Layout-family capacity ladder — used by overflow rule to propose a higher-capacity layout.
  capacityLadder: LayoutTemplateId[];
}

export const DEFAULT_DIRECTOR_POLICY: PublishingDirectorPolicy = {
  enabled: true,
  underfilledFillRatio: 0.25,
  underfilledFullPlateMaxWords: 60,
  tinyContinuationTailRatio: 0.28,
  layoutRepetitionPercent: 45,
  layoutRepetitionMinChapterPages: 4,
  overflowFillRatio: 1.5,
  capacityLadder: [
    'LAYOUT_3_ILLUSTRATION_DOMINANT', // ~240 words
    'LAYOUT_1_STANDARD',              // ~420
    'LAYOUT_8_MARGIN_ILLUSTRATION',   // ~580
    'LAYOUT_13_FEATURE_BANNER',       // ~620
    'LAYOUT_14_SIDEBAR_FEATURE',      // ~640
    'LAYOUT_2_TEXT_HEAVY',            // ~720
  ],
};

/**
 * Next higher-capacity layout in the ladder, by text-area factor. Used by the
 * overflow / tiny-continuation rules to propose a layout that holds more copy.
 * Returns null when the current layout is already the highest-capacity in the ladder.
 */
export function nextHigherCapacity(
  current: LayoutTemplateId,
  ladder: LayoutTemplateId[],
): LayoutTemplateId | null {
  const currentFactor = getLayoutProfile(current).textAreaFactor;
  const sorted = [...ladder]
    .map((t) => ({ t, factor: getLayoutProfile(t).textAreaFactor }))
    .sort((a, b) => a.factor - b.factor);
  return sorted.find((row) => row.factor > currentFactor)?.t ?? null;
}
