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
    // Long encyclopedic entries are essentially text pages — Layout C carries
    // a small supporting image in the corner so the eye has something to land on.
    case 'ENCYCLOPEDIA_ENTRY':
      return 'C';
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

/**
 * P2a — entries at or above this word count route to the 25 % accent family:
 * the entry will spill to continuations anyway, so the opener's job is to
 * carry as much text as possible while the small accent keeps the page
 * visually alive. Shorter entries keep Layout B (the illustration is the
 * star and the text fits beside it). Tuned against the Wildlands Field
 * Guide corpus; re-measure in the P3 distribution audit before changing.
 */
export const ACCENT_MIN_WORDS = 380;

/** The four 25 % accent corner variants, in rotation order. */
const ACCENT_CORNERS: readonly LayoutTemplateId[] = [
  'LAYOUT_C_CORNER_TOP_RIGHT',
  'LAYOUT_C_CORNER_BOTTOM_LEFT',
  'LAYOUT_C_CORNER_TOP_LEFT',
  'LAYOUT_C_CORNER_BOTTOM_RIGHT',
];

/** Deterministic corner rotation — stable across re-paginations of the same
 *  book (keyed on chapter + page number, not array order), varied enough that
 *  consecutive accent pages don't repeat a corner. */
function accentCornerFor(entry: PageManifest): LayoutTemplateId {
  return ACCENT_CORNERS[(entry.chapterNumber * 3 + entry.pageNumber) % ACCENT_CORNERS.length]!;
}

/**
 * Choose a simplified layout for an entry. Pure — no I/O. Operator-forced
 * templates short-circuit this entirely (handled upstream).
 *
 * Decision ladder (highest priority first):
 *   1. Danger / warning → Layout B image-top (warning unmissable)
 *   2. Content-type routing (reference → D, encyclopedia → C accent,
 *      plates / chapter openers → A)
 *   3. Length routing for everything else:
 *        ≥ ACCENT_MIN_WORDS → Layout C 25 % accent (text capacity wins)
 *        <  ACCENT_MIN_WORDS → Layout B 50/50 (illustration carries the page)
 */
export function chooseSimplifiedLayout(
  entry: PageManifest,
  // _config is kept for future per-project tuning of variant defaults; unused for v1.
  _config: ProjectConfig,
): SimplifiedLayout {
  if (isDangerPage(entry) || entry.contentType === 'WARNING_PAGE') {
    return {
      family: 'B',
      template: 'LAYOUT_B_IMAGE_TOP',
      reason: 'Danger / warning page — Layout B with image-top variant keeps the warning unmissable.',
    };
  }

  const ctFamily = familyForContentType(entry.contentType);
  if (ctFamily === 'C') {
    const template = accentCornerFor(entry);
    return {
      family: 'C',
      template,
      reason: `Content type ${entry.contentType} — long encyclopedic text; 25 % accent layout (${template}) preserves text density with a small supporting study.`,
    };
  }
  if (ctFamily !== 'B') {
    return {
      family: ctFamily,
      template: FAMILY_DEFAULT_TEMPLATE[ctFamily],
      reason: `Content type ${entry.contentType ?? 'unspecified'} → Layout ${ctFamily} (${FAMILY_DEFAULT_TEMPLATE[ctFamily]}).`,
    };
  }

  // Length routing for the mixed-content default.
  const words = countWords(entry.bodyMarkdown);
  if (words >= ACCENT_MIN_WORDS) {
    const template = accentCornerFor(entry);
    return {
      family: 'C',
      template,
      reason: `${words} words — long entry will spill to continuations; 25 % accent layout (${template}) maximizes opener text while a small corner study keeps the page visually alive.`,
    };
  }
  return {
    family: 'B',
    template: FAMILY_DEFAULT_TEMPLATE.B,
    reason: `${words} words — compact entry; 50/50 layout lets the illustration carry the page with text comfortably beside it.`,
  };
}
