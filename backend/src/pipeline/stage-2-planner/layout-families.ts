/**
 * Simplified layout families (v1 production surface).
 *
 * Four families cover the active production strategy. The 16 named legacy
 * templates remain in code and may be reached via operator override; nothing
 * here removes or retires them.
 *
 * Layout A — Full Text + Full Illustration pair (text page leads).
 * Layout B — 50/50 split (4 image-placement variants).
 * Layout C — 25% support image (4 corner variants).
 * Layout D — pure text / back matter (no image).
 *
 * See SPEC §5/§6 of the layout-simplification design note (in commit body)
 * for the rationale and the mapping from content type to family.
 */

import { isDangerPage } from './content-signals.js';
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
 * Choose a simplified layout for an entry. Pure — no I/O. Operator-forced
 * templates short-circuit this entirely (handled upstream).
 *
 * Danger pages always route to Layout B with the image-top variant so the
 * warning is unmissable.
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
  const family = familyForContentType(entry.contentType);
  return {
    family,
    template: FAMILY_DEFAULT_TEMPLATE[family],
    reason: `Content type ${entry.contentType ?? 'unspecified'} → Layout ${family} (${FAMILY_DEFAULT_TEMPLATE[family]}).`,
  };
}
