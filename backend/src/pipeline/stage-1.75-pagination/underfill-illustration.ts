/**
 * Stage 1.75 — mid-book underfill recovery (illustration-dominant conversion).
 *
 * tail-rebalance.ts only inspects the book's LAST page ("mid-book whitespace
 * recovery is out of scope"). This pass extends that to ANY page the flow engine
 * finalized as UNDERFILL that could not be pulled back onto its (already full)
 * prior page: convert it to an illustration-dominant layout so the small amount
 * of text lives on a high-illustration page instead of leaving dead whitespace.
 *
 * Two cases:
 *   - Type A — the underfilled page already carries its own illustration
 *     (an opener, carriesSubject=true). Just widen the image zone; text stays,
 *     no new subject.
 *   - Type B — the underfilled page is a text continuation (carriesSubject=false,
 *     no image). Give it a SECONDARY study of the same species — a genuinely
 *     different angle/detail from the opener plate (never a near-duplicate) — and
 *     flip carriesSubject on so it renders its own illustration. NOTE: this makes
 *     the page eligible for image spend (a continuation is text-only otherwise),
 *     so it adds one render per converted Type B page.
 *
 * Pure: no DB, no image calls. The caller persists the returned pages.
 */

import type { LayoutTemplateId, ProjectConfig } from '@wildlands/shared';
import type { PaginatedPage } from './flow-engine.js';
import { computePaginationCapacity } from './capacity.js';

const ILLUSTRATION_DOMINANT: LayoutTemplateId = 'LAYOUT_3_ILLUSTRATION_DOMINANT';

/** Layouts already illustration-forward or semantically fixed — never converted. */
const LEAVE_ALONE: ReadonlySet<LayoutTemplateId> = new Set<LayoutTemplateId>([
  'LAYOUT_3_ILLUSTRATION_DOMINANT',
  'LAYOUT_10_FULL_PAGE_PLATE',
  'LAYOUT_A_ILLUSTRATION',
  'LAYOUT_F_FULL_PAGE_CENTERED',
  'LAYOUT_4_DANGER_WARNING',
  'LAYOUT_9_DIAGNOSTIC_DIAGRAM',
]);

/** Strip a leading "24. " / "3) " catalog ordinal to get the bare species name. */
function speciesName(entryTitle: string): string {
  return entryTitle.replace(/^\s*\d+[.)]\s*/, '').trim();
}

/**
 * A secondary study prompt — subject only (the platform layers Style DNA later).
 * Category comes from the catalog chapter so the "different view" is species-
 * appropriate: animals get an alternate pose/behaviour or a diagnostic detail;
 * plants/trees get a botanical detail; fungi get a structural detail. Every
 * variant explicitly forbids repeating the opener plate.
 */
function secondaryStudySubject(species: string, chapterNumber: number): string {
  const noRepeat = `Same species as its main plate, shown from a distinctly DIFFERENT angle or detail — never a repeat of the primary illustration.`;
  switch (chapterNumber) {
    case 2: // Animals
      return `Secondary field study of ${species}: an alternate pose or behaviour (in motion, feeding, alert, or in flight) OR a diagnostic close detail (plumage/pelage pattern, track, or head profile). ${noRepeat}`;
    case 3: // Plants
    case 4: // Trees
      return `Secondary botanical detail study of ${species}: a close-up of a leaf, flower, fruit/berry, seed, or bark texture. ${noRepeat}`;
    case 5: // Fungi
      return `Secondary detail study of ${species}: the cap underside/gills, a cross-section, or its growth habit in situ. ${noRepeat}`;
    default:
      return `Secondary study of ${species}: a different characteristic view or close detail. ${noRepeat}`;
  }
}

export interface UnderfillRecoveryInput {
  pages: PaginatedPage[];
  config: ProjectConfig;
}

export interface UnderfillRecoveryResult {
  pages: PaginatedPage[];
  warnings: string[];
  /** Per-converted-page record for operator review (before/after + Type A/B). */
  conversions: Array<{
    pageKey: string;
    entryTitle: string;
    type: 'A' | 'B';
    fromLayout: LayoutTemplateId;
    toLayout: LayoutTemplateId;
    secondarySubject: string | null;
  }>;
}

export function recoverUnderfilledPages(input: UnderfillRecoveryInput): UnderfillRecoveryResult {
  const { pages, config } = input;
  const trimSize = config.trimSize;
  const bodyPt = config.typography.bodyPt;
  const lineHeight = config.typography.lineHeight;
  const warnings: string[] = [];
  const conversions: UnderfillRecoveryResult['conversions'] = [];

  const out = pages.map((p) => {
    if (p.fitStatus !== 'UNDERFILL') return p;
    if (LEAVE_ALONE.has(p.layoutTemplate)) return p;

    // Guard: only convert if the small text does NOT overflow the illustration-
    // dominant layout's (smaller) text zone. It never should for an underfilled
    // page, but this stops a conversion from manufacturing an overflow.
    const recomputed = computePaginationCapacity({
      readingFieldText: p.readingFieldText,
      layoutTemplate: ILLUSTRATION_DOMINANT,
      trimSize,
      bodyPt,
      lineHeight,
    });
    if (recomputed.status === 'OVERFLOW') {
      warnings.push(`underfill_convert_skipped_would_overflow:${p.pageKey}`);
      return p;
    }

    const isTypeB = !p.carriesSubject;
    const secondary = isTypeB ? secondaryStudySubject(speciesName(p.entryTitle), p.chapterNumber) : null;
    conversions.push({
      pageKey: p.pageKey,
      entryTitle: p.entryTitle,
      type: isTypeB ? 'B' : 'A',
      fromLayout: p.layoutTemplate,
      toLayout: ILLUSTRATION_DOMINANT,
      secondarySubject: secondary,
    });

    return {
      ...p,
      layoutTemplate: ILLUSTRATION_DOMINANT,
      // The page is now intentionally illustration-dominant: the small text is
      // by design and the illustration fills the rest, so the page is COMPLETE,
      // not a half-empty defect. UNDERFILL measures TEXT fill only, which stays
      // low for any illustration-dominant page — mark FITS so the page is no
      // longer flagged as sparse whitespace. (The OVERFLOW guard above already
      // ensured the text genuinely fits this layout.)
      fitStatus: 'FITS' as const,
      // Type B: give the text continuation its own illustration so it renders as a
      // real illustrated page (carriesSubject flips on → eligible for image spend).
      // Type A already carries its opener subject — keep it untouched.
      carriesSubject: isTypeB ? true : p.carriesSubject,
      imageSubject: isTypeB ? secondary : p.imageSubject,
    };
  });

  return { pages: out, warnings, conversions };
}
