/**
 * Simplified layout families (v1 production surface).
 *
 * Four families cover the active production strategy. The 16 named legacy
 * templates remain in code and may be reached via operator override; nothing
 * here removes or retires them.
 *
 * Layout A — Full Text + Full Illustration pair (text page leads).
 * Layout B — 50/50 split (4 image-placement variants).
 * Layout C — 25% Accent (4 corner variants; text owns ~75% of the page).
 * Layout D — pure text / back matter (no image).
 *
 * See SPEC §5/§6 of the layout-simplification design note (in commit body)
 * for the rationale and the mapping from content type to family.
 */

import { isDangerPage } from './content-signals.js';
import { countWords } from '../shared/markdown-text.js';
import type {
  ContentType,
  LayoutTemplateId,
  PageManifest,
  ProjectConfig,
} from '@wildlands/shared';

export type LayoutFamily = 'A' | 'B' | 'C' | 'D';

/** Variant identifier per family. v1 picks one default variant per family;
 *  operator override can later swap variants without touching the family. */
export interface SimplifiedLayout {
  family: LayoutFamily;
  /** The concrete template ID this family + default variant resolves to. */
  template: LayoutTemplateId;
  /** Plain-English reason for the choice; shown in the decision trace. */
  reason: string;
}

/** Default opener template per family (the picker chooses among them per page). */
export const FAMILY_DEFAULT_TEMPLATE: Record<LayoutFamily, LayoutTemplateId> = {
  A: 'LAYOUT_A_TEXT',
  B: 'LAYOUT_B_IMAGE_RIGHT',
  C: 'LAYOUT_C_CORNER_TOP_RIGHT',
  D: 'LAYOUT_D_PURE_TEXT',
};

/** Reverse map: which family does each template belong to? Useful for the
 *  decision trace and the flow engine's "is this a Layout A page?" check. */
export const FAMILY_BY_TEMPLATE: Partial<Record<LayoutTemplateId, LayoutFamily>> = {
  LAYOUT_A_TEXT: 'A',
  LAYOUT_A_ILLUSTRATION: 'A',
  LAYOUT_B_IMAGE_TOP: 'B',
  LAYOUT_B_IMAGE_BOTTOM: 'B',
  LAYOUT_B_IMAGE_LEFT: 'B',
  LAYOUT_B_IMAGE_RIGHT: 'B',
  LAYOUT_C_CORNER_TOP_LEFT: 'C',
  LAYOUT_C_CORNER_TOP_RIGHT: 'C',
  LAYOUT_C_CORNER_BOTTOM_LEFT: 'C',
  LAYOUT_C_CORNER_BOTTOM_RIGHT: 'C',
  LAYOUT_D_PURE_TEXT: 'D',
};

export function familyForTemplate(template: LayoutTemplateId): LayoutFamily | undefined {
  return FAMILY_BY_TEMPLATE[template];
}

/** True for the four templates in Layout A (the text-page + illustration-page pair). */
export function isLayoutA(template: LayoutTemplateId): boolean {
  return familyForTemplate(template) === 'A';
}

/** True for LAYOUT_A_TEXT specifically — the leading text page of the pair. */
export function isLayoutAText(template: LayoutTemplateId): boolean {
  return template === 'LAYOUT_A_TEXT';
}

/** True for LAYOUT_A_ILLUSTRATION — the facing illustration page. */
export function isLayoutAIllustration(template: LayoutTemplateId): boolean {
  return template === 'LAYOUT_A_ILLUSTRATION';
}

/**
 * Content-type → family routing for the simplified v1 planner.
 *
 * The mapping deliberately keeps to four destinations. Anything not listed
 * here falls through to Layout B (the safest mixed-content default) because
 * most field-guide entries pair an illustration with explanatory text.
 */
function familyForContentType(ct: ContentType | undefined): LayoutFamily {
  if (!ct) return 'B';
  switch (ct) {
    // Pure back-matter and dense reference flow into Layout D (no image at all).
    case 'REFERENCE_PAGE':
      return 'D';
    // Premium field-guide model: encyclopedic entries ARE flagship subjects, so
    // their opener leads with a strong illustration (Layout B, ~50/50) rather
    // than a small corner accent. Overflow text flows to text-heavy continuations.
    case 'ENCYCLOPEDIA_ENTRY':
      return 'B';
    // Plates and atmospheric chapter openers are showcase pages — Layout A's
    // facing-illustration page exists for exactly this.
    case 'BOTANICAL_PLATE':
    case 'CHAPTER_OPENER':
      return 'A';
    // Warning pages need a strong title + an unambiguous image. Layout B's
    // image-top variant keeps the warning visible above the fold.
    case 'WARNING_PAGE':
      return 'B';
    // Everything else (species/animal profiles, comparison, diagnostic,
    // habitat overview, progression, cutaway, sidebar, field notes, terrain):
    // Layout B 50/50 is the default.
    default:
      return 'B';
  }
}

/** Strong-illustration opener variants (Layout B, ~50/50), in rotation order.
 *  Premium field-guide model (P2b): EVERY major entry opener leads with one of
 *  these so each subject gets a strong first impression. The 25 % corner-accent
 *  family (C) is no longer auto-selected for openers (still reachable via
 *  operator override). The bottom-image variant is intentionally omitted so the
 *  illustration always sits at or above the reading line on an opener. */
const STRONG_IMAGE_VARIANTS: readonly LayoutTemplateId[] = [
  'LAYOUT_B_IMAGE_TOP',
  'LAYOUT_B_IMAGE_RIGHT',
  'LAYOUT_B_IMAGE_LEFT',
];

/** Deterministic variant rotation — stable across re-paginations of the same
 *  book (keyed on chapter + page number), varied enough that consecutive
 *  openers don't repeat the same image placement. */
function strongImageVariantFor(entry: PageManifest): LayoutTemplateId {
  return STRONG_IMAGE_VARIANTS[(entry.chapterNumber * 3 + entry.pageNumber) % STRONG_IMAGE_VARIANTS.length]!;
}

// ── Title-fit geometry gate ────────────────────────────────────────────────
// A side-image opener (LAYOUT_B_IMAGE_LEFT/RIGHT) gives the title only a ~half-
// width column. A long title overruns that column and its last letters push into
// the trim rail (observed on "GREY JAY / CANADA JAY"). Route any opener whose
// title will not fit its side column at the MINIMUM readable title size to the
// full-width-title variant (IMAGE_TOP) instead. Purely geometric: compound titles
// (&, /) simply carry more glyphs, so they weight toward the check without being a
// special trigger; short titles that fit keep their side layout for variety.

/** Below this a display page-title no longer reads as a heading. */
const MIN_TITLE_PT = 18;
/** Avg glyph advance as a fraction of point size for the Caslon-class caps title. */
const TITLE_GLYPH_ADVANCE = 0.58;
/** The title/text column of a 50/50 side-image layout (after the image half + gutter). */
const SIDE_COLUMN_FRACTION = 0.47;
/** Standard page margin (in) for this publishing standard. */
const PAGE_MARGIN_IN = 0.5;

/** The rendered heading: the entry title with any "N." catalog ordinal stripped. */
function displayTitle(entry: PageManifest): string {
  return (entry.entryTitle ?? '').replace(/^\s*\d+[.)]\s*/, '').trim();
}

/** Geometry gate: does the title fit a side-image column on one line at the
 *  minimum readable title size? */
function titleFitsSideColumn(entry: PageManifest, trimWidthIn: number): boolean {
  const titleWidthIn = displayTitle(entry).length * (MIN_TITLE_PT / 72) * TITLE_GLYPH_ADVANCE;
  const sideColumnWidthIn = (trimWidthIn - 2 * PAGE_MARGIN_IN) * SIDE_COLUMN_FRACTION;
  return titleWidthIn <= sideColumnWidthIn;
}

/**
 * Choose a simplified layout for an entry OPENER. Pure — no I/O. Operator-forced
 * templates short-circuit this entirely (handled upstream). Continuation pages
 * do NOT come through here — they are always LAYOUT_2_TEXT_HEAVY.
 *
 * Premium field-guide model (P2b). Decision ladder (highest priority first):
 *   1. Danger / warning → Layout B image-top (warning unmissable)
 *   2. Reference / back matter → Layout D (no image)
 *   3. Plates / chapter openers → Layout A (full showcase)
 *   4. Every other entry opener → Layout B strong illustration (~50/50),
 *      REGARDLESS of length. Long entries spill their extra text into
 *      text-heavy continuations rather than shrinking the opener to a corner
 *      accent. This favors a strong first impression for each subject while
 *      preserving the practical survival-guide density on continuation pages.
 */
export function chooseSimplifiedLayout(
  entry: PageManifest,
  config: ProjectConfig,
): SimplifiedLayout {
  if (isDangerPage(entry) || entry.contentType === 'WARNING_PAGE') {
    return {
      family: 'B',
      template: 'LAYOUT_B_IMAGE_TOP',
      reason: 'Danger / warning page — Layout B with image-top variant keeps the warning unmissable.',
    };
  }

  const ctFamily = familyForContentType(entry.contentType);
  if (ctFamily === 'D' || ctFamily === 'A') {
    return {
      family: ctFamily,
      template: FAMILY_DEFAULT_TEMPLATE[ctFamily],
      reason: `Content type ${entry.contentType ?? 'unspecified'} → Layout ${ctFamily} (${FAMILY_DEFAULT_TEMPLATE[ctFamily]}).`,
    };
  }

  // Every other entry opener leads with a strong illustration, regardless of
  // length. Overflow text flows to text-heavy continuation pages.
  const rotated = strongImageVariantFor(entry);
  // Geometry gate: a side-image variant whose title won't fit its half-width
  // column at minimum readable size is routed to the full-width-title variant so
  // the title never runs into the trim rail. Short titles keep their side variant.
  const isSide = rotated === 'LAYOUT_B_IMAGE_LEFT' || rotated === 'LAYOUT_B_IMAGE_RIGHT';
  const routedForTitle = isSide && !titleFitsSideColumn(entry, config.trimSize.widthIn);
  const template = routedForTitle ? 'LAYOUT_B_IMAGE_TOP' : rotated;
  const words = countWords(entry.bodyMarkdown);
  return {
    family: 'B',
    template,
    reason: routedForTitle
      ? `Entry opener (${entry.contentType ?? 'subject'}, ${words} words) — long title "${displayTitle(entry)}" would not fit the ${rotated} side column at min readable size; routed to LAYOUT_B_IMAGE_TOP (full-width title).`
      : `Entry opener (${entry.contentType ?? 'subject'}, ${words} words) — strong illustration layout (${template}); overflow text flows to text-heavy continuations.`,
  };
}
