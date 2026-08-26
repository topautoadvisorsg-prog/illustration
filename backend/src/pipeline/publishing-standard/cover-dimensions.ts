/**
 * COVER DIMENSIONS — the canonical core, derived from the published KDP spec.
 *
 * ─── WHERE THE NUMBERS COME FROM ────────────────────────────────────────────
 * Every value here is now read from `kdp-spec.ts`, which holds Amazon's published
 * figures with the topic and the date they were read. Nothing in this file is a
 * literal any more. If a factor changes, it changes in one place and the
 * explanation changes with it.
 *
 * Phase 1A moved these figures out of `stage-6-layout/render-html.ts`, an
 * 874-line HTML renderer belonging to the LEGACY / DORMANT Track A. Nothing had
 * shipped on Track A for three months, yet delivery-check, cover-geometry,
 * readiness, cover-spine-repair and print-prep all took their geometry from it —
 * so "legacy" could not be retired without taking the cover system down.
 *
 * That is how a legacy module becomes load-bearing: not by being good, by being
 * first.
 *
 * Phase 1B then reconciled the values against the live documentation. The
 * paperback factors were CONFIRMED correct; the spine-text floor was CORRECTED.
 * See kdp-spec.ts for both, with sources.
 *
 * ─── SCOPE ──────────────────────────────────────────────────────────────────
 * PAPERBACK ONLY. Hardcover has no published spine multiplier — Amazon directs
 * you to the Cover Calculator — so hardcover geometry comes from verified
 * calculator readings in `kdp-cover-specs.ts`, which fails closed outside its
 * anchors. Do not add a hardcover factor here just because stored readings look
 * linear.
 *
 * `computeCoverDimensions` covers the two configurations `ProjectConfig` can
 * express — black ink on white or cream. For anything else (standard colour,
 * premium colour, groundwood, hardcover) call the resolver in kdp-spec.ts, which
 * refuses rather than approximating.
 */
import type { ProjectConfig } from '@wildlands/shared';
import { PAPERBACK_SPINE_FACTOR_IN, PAPERBACK_RULES } from './kdp-spec.js';

/**
 * Per-page paper thickness, in inches.
 *
 * Paper thickness was once a single constant fixed at the white value: right for
 * the one book that had shipped, silently wrong for anything on cream. On 154
 * pages the two differ by 0.038in.
 *
 * PAPERBACK ONLY. Confirmed against the published KDP factors in Phase 1B.
 */
export const PAGE_THICKNESS_IN = {
  white: PAPERBACK_SPINE_FACTOR_IN.BLACK_AND_WHITE!.WHITE!.value,
  cream: PAPERBACK_SPINE_FACTOR_IN.BLACK_AND_WHITE!.CREAM!.value,
} as const;

/**
 * PLATFORM DECISION, not a KDP rule — and it OVERRIDES the published formula
 * inside KDPs printable range.
 *
 * Amazon publishes no minimum spine. This floor stops a very short block
 * producing a spine narrower than the printer can fold to.
 *
 * BUT: on white paper it engages at 24, 25 and 26 pages, and KDP prints from 24.
 * A 24-page book computes 0.054048in by the published formula and is returned as
 * 0.06in here. That is a deliberate deviation from the specification in a range
 * KDP will actually print, and it is the one place the platform knowingly
 * disagrees with Amazon. It has never applied to a real book — the thinnest
 * shipped is 116 pages — but it is a decision, not a detail, and it should be
 * confirmed or dropped rather than left implicit.
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
export const COVER_BLEED_IN = PAPERBACK_RULES.bleedIn.value;

export interface CoverDimensions {
  fullWidthIn: number;
  fullHeightIn: number;
  spineIn: number;
}

/**
 * KDP prints spine text on books with MORE THAN 79 pages, so the first eligible
 * count is 80.
 *
 * This module previously declared 79 and tested `>=`, which admitted a 79-page
 * book KDP would refuse. Corrected in Phase 1B against the published wording.
 * No shipped book is affected — the thinnest is 116 pages.
 */
export const KDP_MIN_SPINE_TEXT_PAGES = PAPERBACK_RULES.spineTextMinPages.value;
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
