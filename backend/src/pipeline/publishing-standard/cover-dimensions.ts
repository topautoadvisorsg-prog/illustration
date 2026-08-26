/**
 * COVER DIMENSIONS — the canonical core, and the only place these figures live.
 *
 * ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * These figures used to be defined inside `stage-6-layout/render-html.ts`, an
 * 874-line HTML renderer belonging to Track A — the render path the platform
 * classified LEGACY / DORMANT in August 2026. Nothing shipped on Track A for
 * three months, yet delivery-check, cover-geometry, readiness, cover-spine-repair
 * and print-prep all imported their geometry from it, so "legacy" could not be
 * retired without taking the whole cover system down with it.
 *
 * That is how a legacy module becomes load-bearing: not by being good, by being
 * first. The nine lines of `computeCoverDimensions` were written where they were
 * first needed and every later subsystem imported them from there.
 *
 * Nothing about the arithmetic changed when it moved. Phase 1A was an extraction
 * proven byte-identical against every shipped reference configuration by
 * `scripts/qa/cover-geometry-equivalence.ts`.
 *
 * ─── WHAT IS NOT SETTLED HERE ────────────────────────────────────────────────
 * The per-page paper thicknesses below are the values the platform has always
 * used, and every paperback that has gone to print took its spine from them.
 * They are NOT verified: `kdp-cover-specs.ts` holds four measured KDP readings
 * and **all four are hardcover**. There is not one verified paperback reading in
 * this repository.
 *
 * So these are RECORDED BEHAVIOUR, not established truth. Phase 1B reconciles
 * them against the current official KDP specification, calculator and templates.
 * Keeping extraction (1A) and reconciliation (1B) apart is what makes it possible
 * to tell later whether a dimension changed because the architecture moved or
 * because someone deliberately corrected the specification.
 *
 * ─── KDP FULL-WRAP COVER FIGURES ─────────────────────────────────────────────
 * Quoted from Amazon's published specifications, with the sources below, so
 * nobody has to work them out from memory or build a second calculator
 * somewhere else. A spine wrong by a few hundredths of an inch prints with the
 * front artwork creeping around the fold and the file gives no sign of it.
 *
 *   Spine width, black ink   white 0.002252in/page, cream 0.0025in/page
 *   Bleed                    0.125in on top, bottom and outside edges
 *   Cover width              bleed + back + spine + front + bleed
 *   Cover height             bleed + trim height + bleed
 *   Text safe area           at least 0.125in inside the trim lines
 *   Spine text safe area     at least 0.0625in either side of the spine
 *   Spine fold variance      allow 0.0625in either side of each fold line
 *   Spine text eligibility   at least 79 pages (KDP_MIN_SPINE_TEXT_PAGES)
 *   Minimum type size        7pt
 *   Resolution               at least 300 DPI (see print-prep/cover-print.ts)
 *   Barcode                  KDP adds its own to the back cover when none is
 *                            supplied. It is NOT part of the artwork: nothing
 *                            is reserved, nothing is drawn, and the design runs
 *                            straight through that area. Keep readable COPY out
 *                            of it; background is fine.
 *
 * Sources:
 *   https://kdp.amazon.com/en_US/help/topic/G201953020   (cover, spine, safety)
 *   https://kdp.amazon.com/en_US/help/topic/G201857950   (submission, 300 DPI)
 *   https://kdp.amazon.com/help?topicId=G5HDYGP4BXLX4RUW (barcode)
 */
import type { ProjectConfig } from '@wildlands/shared';

/**
 * Per-page paper thickness, in inches.
 *
 * Paper thickness was once a single constant fixed at the white value: right for
 * the one book that had shipped, silently wrong for anything on cream. On 154
 * pages the two differ by 0.038in.
 *
 * PAPERBACK ONLY, and unverified — see the header. A third value, 0.002347 for
 * Premium Color, exists in `print-prep/paperback-preview.ts` as a DEFAULT rather
 * than a read from config; that is a known defect logged for Phase 1B and is
 * deliberately not merged in here, because merging an unverified number into the
 * authority would make it look settled.
 */
export const PAGE_THICKNESS_IN = { white: 0.002252, cream: 0.0025 } as const;

/**
 * The thinnest spine the platform will compute, in inches.
 *
 * A very short block would otherwise produce a spine narrower than the printer
 * can fold to, and the arithmetic gives no sign of it.
 */
export const MIN_SPINE_IN = 0.06;

/**
 * COVER BLEED — 0.125in on every outside edge, always.
 *
 * A cover is not a page and does not inherit the interior's bleed. KDP requires
 * bleed on every paperback cover regardless of what the interior does, because
 * the wrap is trimmed after printing.
 *
 * This used to read `config.trimSize.bleedIn`, which is the INTERIOR's setting.
 * A text interior legitimately prints with no bleed, so one book — 5.5x8.5,
 * bleedIn 0 — produced an 11.385 x 8.500in wrap: correct arithmetic, and 0.25in
 * short in both directions of what KDP will accept. It was invisible because the
 * only book that had shipped was an illustrated guide whose interior bleeds
 * 0.125in anyway, so the two numbers happened to agree.
 *
 * Source: https://kdp.amazon.com/en_US/help/topic/G201953020
 */
export const COVER_BLEED_IN = 0.125;

export interface CoverDimensions {
  fullWidthIn: number;
  fullHeightIn: number;
  spineIn: number;
}

/** KDP only permits spine text once the interior reaches 79 pages. */
export const KDP_MIN_SPINE_TEXT_PAGES = 79;

export function coverAllowsSpineText(pageCount: number): boolean {
  return pageCount >= KDP_MIN_SPINE_TEXT_PAGES;
}

/**
 * KDP full-wrap cover dimensions for a given interior page count.
 *
 * PAGE COUNT IS AN INPUT HERE AND SHOULD BE READ, NOT TYPED. Every caller that
 * can reach the final interior PDF must take the count from it rather than
 * accepting an argument; a typed page count cannot be wrong loudly, and a wrong
 * spine is scrap paper and a reprint.
 */
export function computeCoverDimensions(config: ProjectConfig, pageCount: number): CoverDimensions {
  const trim = config.trimSize;
  const spineIn = Math.max(MIN_SPINE_IN, pageCount * PAGE_THICKNESS_IN[config.paperStock ?? 'white']);
  return {
    fullWidthIn: trim.widthIn * 2 + spineIn + COVER_BLEED_IN * 2,
    fullHeightIn: trim.heightIn + COVER_BLEED_IN * 2,
    spineIn,
  };
}
