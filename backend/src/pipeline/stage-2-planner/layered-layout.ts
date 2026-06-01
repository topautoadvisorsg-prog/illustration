/**
 * Phase 1 — layered layout model.
 *
 * Content Type -> Coverage -> Architecture -> Master Style -> Subject.
 *
 * This is a migration layer that sits ABOVE the 15 named layout templates. The
 * templates + LAYOUT_PROFILES remain the render authority (rendering is unchanged),
 * but layout intent is now expressed as orthogonal axes:
 *   - Content Type: what KIND of educational page this is (its purpose).
 *   - Coverage: how MUCH of the page is imagery (percent bucket).
 *   - Architecture: how the image space is ARRANGED (independent of coverage).
 *
 * Two lookups bridge old and new:
 *   - CONTENT_TYPE_POLICY: a content type's default coverage/architecture + the
 *     existing template it resolves to (back-compat render).
 *   - LAYOUT_TEMPLATE_COMPOSITION: decomposes each existing template into its
 *     (content type, coverage, architecture) so old data is expressible in the
 *     new vocabulary.
 *
 * composeProfile() is the forward engine: it builds render params from
 * (coverage, architecture) directly, with no named template — ready for Phase 2.
 */

import type { Architecture, ContentType, Coverage, LayoutTemplateId, PageManifest } from '@wildlands/shared';
import { isDangerPage, signalText } from './content-signals.js';
import type { LayoutProfile } from '../stage-6-layout/layout-profiles.js';

export interface ContentTypePolicy {
  defaultCoverage: Coverage;
  defaultArchitecture: Architecture;
  /** The existing template this content type renders through today. */
  template: LayoutTemplateId;
}

/** Content type -> default coverage/architecture + back-compat render template. */
export const CONTENT_TYPE_POLICY: Record<ContentType, ContentTypePolicy> = {
  SPECIES_PROFILE: { defaultCoverage: 40, defaultArchitecture: 'FLOAT_LEFT', template: 'LAYOUT_1_STANDARD' },
  ANIMAL_PROFILE: { defaultCoverage: 40, defaultArchitecture: 'FLOAT_LEFT', template: 'LAYOUT_1_STANDARD' },
  ENCYCLOPEDIA_ENTRY: { defaultCoverage: 15, defaultArchitecture: 'FLOAT_LEFT', template: 'LAYOUT_2_TEXT_HEAVY' },
  FIELD_NOTES_PAGE: { defaultCoverage: 40, defaultArchitecture: 'SCATTERED', template: 'LAYOUT_7_SCATTERED_VIGNETTES' },
  REFERENCE_PAGE: { defaultCoverage: 15, defaultArchitecture: 'FLOAT_RIGHT', template: 'LAYOUT_6_BACK_MATTER' },
  COMPARISON: { defaultCoverage: 50, defaultArchitecture: 'SCATTERED', template: 'LAYOUT_4_DANGER_WARNING' },
  MULTI_SPECIES_COMPARISON: { defaultCoverage: 50, defaultArchitecture: 'SCATTERED', template: 'LAYOUT_4_DANGER_WARNING' },
  IDENTIFICATION_GUIDE: { defaultCoverage: 40, defaultArchitecture: 'TOP_BAND', template: 'LAYOUT_9_DIAGNOSTIC_DIAGRAM' },
  DIAGNOSTIC_DIAGRAM: { defaultCoverage: 40, defaultArchitecture: 'TOP_BAND', template: 'LAYOUT_9_DIAGNOSTIC_DIAGRAM' },
  CHAPTER_OPENER: { defaultCoverage: 60, defaultArchitecture: 'TOP_BAND', template: 'LAYOUT_5_CHAPTER_OPENER' },
  HABITAT_OVERVIEW: { defaultCoverage: 60, defaultArchitecture: 'TOP_BAND', template: 'LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD' },
  PROGRESSION_STUDY: { defaultCoverage: 40, defaultArchitecture: 'TOP_BAND', template: 'LAYOUT_15_PROGRESSION_STUDY' },
  CUTAWAY_ILLUSTRATION: { defaultCoverage: 40, defaultArchitecture: 'TOP_BAND', template: 'LAYOUT_16_CUTAWAY_FEATURE' },
  SIDEBAR_FEATURE: { defaultCoverage: 25, defaultArchitecture: 'SIDEBAR_RIGHT', template: 'LAYOUT_14_SIDEBAR_FEATURE' },
  WARNING_PAGE: { defaultCoverage: 40, defaultArchitecture: 'FLOAT_LEFT', template: 'LAYOUT_4_DANGER_WARNING' },
  BOTANICAL_PLATE: { defaultCoverage: 100, defaultArchitecture: 'FULL_PAGE', template: 'LAYOUT_10_FULL_PAGE_PLATE' },
  TERRAIN_ANALYSIS: { defaultCoverage: 40, defaultArchitecture: 'TOP_BAND', template: 'LAYOUT_13_FEATURE_BANNER' },
};

export interface LayoutComposition {
  contentType: ContentType;
  coverage: Coverage;
  architecture: Architecture;
}

/** Decompose each existing template into the new orthogonal axes. */
export const LAYOUT_TEMPLATE_COMPOSITION: Record<LayoutTemplateId, LayoutComposition> = {
  LAYOUT_1_STANDARD: { contentType: 'SPECIES_PROFILE', coverage: 40, architecture: 'FLOAT_LEFT' },
  LAYOUT_2_TEXT_HEAVY: { contentType: 'ENCYCLOPEDIA_ENTRY', coverage: 15, architecture: 'FLOAT_LEFT' },
  LAYOUT_3_ILLUSTRATION_DOMINANT: { contentType: 'SPECIES_PROFILE', coverage: 50, architecture: 'FLOAT_RIGHT' },
  LAYOUT_4_DANGER_WARNING: { contentType: 'WARNING_PAGE', coverage: 40, architecture: 'FLOAT_LEFT' },
  LAYOUT_5_CHAPTER_OPENER: { contentType: 'CHAPTER_OPENER', coverage: 60, architecture: 'TOP_BAND' },
  LAYOUT_6_BACK_MATTER: { contentType: 'REFERENCE_PAGE', coverage: 15, architecture: 'FLOAT_RIGHT' },
  LAYOUT_7_SCATTERED_VIGNETTES: { contentType: 'FIELD_NOTES_PAGE', coverage: 40, architecture: 'SCATTERED' },
  LAYOUT_8_MARGIN_ILLUSTRATION: { contentType: 'SPECIES_PROFILE', coverage: 25, architecture: 'FLOAT_RIGHT' },
  LAYOUT_9_DIAGNOSTIC_DIAGRAM: { contentType: 'DIAGNOSTIC_DIAGRAM', coverage: 40, architecture: 'TOP_BAND' },
  LAYOUT_10_FULL_PAGE_PLATE: { contentType: 'BOTANICAL_PLATE', coverage: 100, architecture: 'FULL_PAGE' },
  LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD: { contentType: 'HABITAT_OVERVIEW', coverage: 60, architecture: 'TOP_BAND' },
  LAYOUT_13_FEATURE_BANNER: { contentType: 'TERRAIN_ANALYSIS', coverage: 40, architecture: 'TOP_BAND' },
  LAYOUT_14_SIDEBAR_FEATURE: { contentType: 'SIDEBAR_FEATURE', coverage: 25, architecture: 'SIDEBAR_RIGHT' },
  LAYOUT_15_PROGRESSION_STUDY: { contentType: 'PROGRESSION_STUDY', coverage: 40, architecture: 'TOP_BAND' },
  LAYOUT_16_CUTAWAY_FEATURE: { contentType: 'CUTAWAY_ILLUSTRATION', coverage: 40, architecture: 'TOP_BAND' },
};

export function decomposeTemplate(template: LayoutTemplateId): LayoutComposition {
  return LAYOUT_TEMPLATE_COMPOSITION[template] ?? LAYOUT_TEMPLATE_COMPOSITION.LAYOUT_1_STANDARD;
}

/**
 * Classify a page's content type from its identity (title + image subject +
 * category + warnings). Mirrors the planner's signal logic so the classification
 * and the chosen template stay aligned. Generic entries default to SPECIES_PROFILE.
 */
export function classifyContentType(page: PageManifest): { contentType: ContentType; reason: string } {
  if (page.contentType) return { contentType: page.contentType, reason: 'from_manifest' };

  const text = signalText(page);

  if (isDangerPage(page)) return { contentType: 'WARNING_PAGE', reason: 'danger_signal' };
  if (/(chapter opener|chapter introduction|section introduction|opening page|opener)/.test(text)) {
    return { contentType: 'CHAPTER_OPENER', reason: 'opener_signal' };
  }
  if (/(life cycle|lifecycle|growth stage|progression|seasonal sequence|development over time)/.test(text)) {
    return { contentType: 'PROGRESSION_STUDY', reason: 'progression_signal' };
  }
  if (/(cutaway|cut away|cross-section|cross section|internal structure|layered|strata)/.test(text)) {
    return { contentType: 'CUTAWAY_ILLUSTRATION', reason: 'cutaway_signal' };
  }
  if (/(compare|comparison|look-alike|look alike|versus| vs |similar species)/.test(text)) {
    return { contentType: 'COMPARISON', reason: 'comparison_signal' };
  }
  if (/(diagram|anatomy|diagnostic|identifying features|major features|parts)/.test(text)) {
    return { contentType: 'DIAGNOSTIC_DIAGRAM', reason: 'diagnostic_signal' };
  }
  if (/(overview|region overview|feature banner|watershed|mountain range|river system|landscape context)/.test(text)) {
    return { contentType: 'HABITAT_OVERVIEW', reason: 'overview_signal' };
  }
  if (/(track|tracks|scat|signs|trail|habitat scene)/.test(text)) {
    return { contentType: 'FIELD_NOTES_PAGE', reason: 'field_signs_signal' };
  }
  return { contentType: 'SPECIES_PROFILE', reason: 'default_species_profile' };
}

const WRAP_ARCHITECTURES: ReadonlySet<Architecture> = new Set<Architecture>([
  'FLOAT_LEFT',
  'FLOAT_RIGHT',
  'SIDEBAR_RIGHT',
  'SCATTERED',
  'CENTER_WRAP',
]);

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Forward composition engine: build render params from coverage + architecture
 * alone, with no named template. Wrap architectures let text reclaim space
 * alongside the art; band/full architectures consume that fraction of the page.
 * (LAYOUT_PROFILES remains the authority for the 15 existing templates; this is
 * for future ad-hoc compositions.)
 */
export function composeProfile(coverage: Coverage, architecture: Architecture): LayoutProfile {
  const cov = coverage / 100;
  const isWrap = WRAP_ARCHITECTURES.has(architecture);
  const textAreaFactor = isWrap ? clamp(1 - cov * 0.6, 0.1, 0.95) : clamp(1 - cov, 0.1, 0.95);
  return {
    textAreaFactor: Math.round(textAreaFactor * 100) / 100,
    artSlot: architecture,
    artAreaFraction: cov,
    textLight: coverage >= 75,
  };
}
