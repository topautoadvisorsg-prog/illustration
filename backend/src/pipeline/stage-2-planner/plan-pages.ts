/**
 * Stage 2 - deterministic page planner.
 *
 * What it does: reads page manifests, calculates text signals, selects one of
 * the configured layout templates, and assembles the image-only prompt for the subject
 * art. No image API spend happens here.
 * Input: page manifests + project config layout prompt assets.
 * Output: page planning rows with layout template, prompt, prompt hash, and
 * operator-visible reason codes.
 */

import { createHash } from 'node:crypto';
import {
  LayoutPromptAssetSchema,
  type Architecture,
  type ContentType,
  type Coverage,
  type LayoutPromptAsset,
  type LayoutTemplateId,
  type PageManifest,
  type ProjectConfig,
} from '@wildlands/shared';
import { getAgentContract } from '../../agents/agent-contracts.js';
import { includesAny, isDangerPage, signalText } from './content-signals.js';
import { CONTENT_TYPE_POLICY, classifyContentType, decomposeTemplate } from './layered-layout.js';
import { computePageGeometry } from '../stage-6-layout/page-geometry.js';
import { directLayout, type LayoutAllocation } from '../stage-6-layout/layout-director.js';

const REQUIRED_PROMPT_PLACEHOLDERS = ['{MASTER_STYLE_DNA}', '{SUBJECT}', '{SCIENTIFIC_DETAILS}', '{COMPOSITION_NOTES}'] as const;

const IMAGE_PROMPT_SAFETY_RULES = `LAYOUT SYSTEM RULES

Treat the selected layout as a strong reference template, not a rigid rule. Minor composition adjustments are allowed when they improve readability, subject presentation, or overall page quality.

Preserve the text-safe zones above all else. Do not allow illustrations, background elements, diagrams, labels, decorative details, or environmental elements to consume the zones reserved for written educational content. When in doubt, leave more negative space.

Generate clean artwork only. The illustration must contain ZERO readable text of any kind: no subject names, labels, captions, titles, headings, paragraphs, article text, fake encyclopedia text, page numbers, headers, reference notes, measurements, callouts, or annotations. Do not draw arrows, leader lines, or pointer marks with text. All labels, names, annotations, arrows, and typography are added later by the layout/composition system — never by the image model.

Do not generate readable text by default. If a future prompt explicitly supplies an explicit subject-name label, render exactly that supplied label, large and legible, with no extra words. This planner currently supplies no such label text.

Use minimal annotation only when structurally necessary. Limit callouts to 0-2 major, obvious educational features per subject. Avoid dense labeling systems, technical breakdowns, scientific poster layouts, and small-detail callouts.

Do not build scientific-poster layouts, dense labeling systems, or technical breakdowns. The image is pure subject artwork; the educational markup is overlaid afterward.

Layouts define text-safe zones, overlay typography zones, image-priority zones, negative space, reading flow, and visual hierarchy. They do not define subject matter, article content, or detailed scientific analysis.

Prioritize readability over visual density. A simpler image with protected text placement is preferred over a beautiful image that consumes the content area.

Subject-specific flexibility is allowed for wilderness subjects as long as the intended text zones remain clear.

Negative space is intentional. Do not fill empty areas simply because space is available.

Final rule: the educational knowledge belongs primarily in the written article. The illustration supports the lesson; it does not replace it.`;

/**
 * Decision trace — every page records WHY the system landed on this layout,
 * which thresholds fired, and what alternatives were considered. Surfaces the
 * deterministic decision logic so the operator can audit and tune it.
 */
export interface PagePlanningDecision_DecisionTrace {
  /** "from_manifest" = content type came from Stage 1.5; "classified" = inferred here. */
  contentTypeSource: 'from_manifest' | 'classified';
  /** Plain-English reason for the content type choice. */
  contentTypeReason: string;
  /** Which rule branch in chooseLayout fired (e.g. "danger_override", "content_type_animal_profile_long"). */
  layoutRule: string;
  /** Human-readable one-sentence explanation suitable for operator display. */
  layoutExplanation: string;
  /** Word-count band the page fell into: under_200 | standard_range | over_400. */
  wordCountBand: 'under_200' | 'standard_range' | 'over_400';
  /** True when an operator forced the layout, bypassing chooseLayout. */
  operatorForced: boolean;
  /**
   * Other plausible layouts considered + why each was skipped. Empty when the
   * decision was unambiguous (e.g. operator-forced or danger-override).
   */
  alternativesConsidered: Array<{ template: LayoutTemplateId; skippedBecause: string }>;
}

export interface PagePlanningDecision {
  pageKey: string;
  entryTitle: string;
  wordCount: number;
  /** Layered model (Phase 1): the page's purpose + its image-area axes. */
  contentType: ContentType;
  /** Built-in usage guidance for this content type — the agent's go-to reference. */
  contentTypePurpose: string;
  contentTypeUsedFor: string[];
  multiSubject: boolean;
  coverage: Coverage;
  architecture: Architecture;
  layoutTemplate: LayoutTemplateId;
  layoutReferenceLabel: string;
  layoutInstructions: {
    description: string;
    useCases: string[];
    avoidWhen: string[];
    textZone: string;
    imageZone: string;
    textFitRule: string;
  };
  prompt: string;
  promptSha256: string;
  promptReady: boolean;
  reasonCodes: string[];
  blockers: string[];
  warnings: string[];
  capacity: {
    minWords: number;
    targetWords: number;
    maxWords: number;
    status: LayoutPromptAsset['capacityTestStatus'] | 'DEFAULT_UNTESTED';
    overMaxWords: boolean;
    underMinWords: boolean;
  };
  typography: {
    bodyFont: string;
    bodyPt: number;
    lineHeight: number;
  };
  artBrief: {
    imagePercent: number;
    textPercent: number;
    placement: string;
    textPlacement: string;
    architecture: string;
    textSafeZones: LayoutAllocation['textSafeZones'];
    typographyZones: LayoutAllocation['typographyZones'];
    imagePriorityZones: LayoutAllocation['imagePriorityZones'];
    imagePriorityZone: LayoutAllocation['imagePriorityZone'];
    /** @deprecated Use `imagePriorityZone`. */
    artBox: LayoutAllocation['artBox'];
  };
  agent: {
    id: string;
    name: string;
    mission: string;
    expertFrame: string;
  };
  textFitStatus: 'PENDING_PREVIEW' | 'BLOCKED_LAYOUT_LIBRARY';
  /** Operator-visible explanation of WHY this layout was chosen. */
  decisionTrace: PagePlanningDecision_DecisionTrace;
}

export interface PlanPageOptions {
  forcedLayoutTemplate?: LayoutTemplateId;
  reasonCode?: string;
}

const DEFAULT_LAYOUT_CAPACITY: Record<LayoutTemplateId, { minWords: number; targetWords: number; maxWords: number }> = {
  LAYOUT_1_STANDARD: { minWords: 220, targetWords: 320, maxWords: 420 },
  LAYOUT_2_TEXT_HEAVY: { minWords: 420, targetWords: 560, maxWords: 720 },
  LAYOUT_3_ILLUSTRATION_DOMINANT: { minWords: 90, targetWords: 160, maxWords: 240 },
  LAYOUT_4_DANGER_WARNING: { minWords: 240, targetWords: 340, maxWords: 460 },
  LAYOUT_5_CHAPTER_OPENER: { minWords: 40, targetWords: 90, maxWords: 150 },
  LAYOUT_6_BACK_MATTER: { minWords: 260, targetWords: 420, maxWords: 620 },
  LAYOUT_7_SCATTERED_VIGNETTES: { minWords: 160, targetWords: 240, maxWords: 340 },
  LAYOUT_8_MARGIN_ILLUSTRATION: { minWords: 300, targetWords: 430, maxWords: 580 },
  LAYOUT_9_DIAGNOSTIC_DIAGRAM: { minWords: 180, targetWords: 280, maxWords: 400 },
  LAYOUT_10_FULL_PAGE_PLATE: { minWords: 0, targetWords: 40, maxWords: 90 },
  LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD: { minWords: 0, targetWords: 60, maxWords: 140 },
  LAYOUT_12_DIAGNOSTIC_DIAGRAM: { minWords: 180, targetWords: 280, maxWords: 400 },
  LAYOUT_13_FEATURE_BANNER: { minWords: 260, targetWords: 420, maxWords: 620 },
  LAYOUT_14_SIDEBAR_FEATURE: { minWords: 300, targetWords: 460, maxWords: 640 },
  LAYOUT_15_PROGRESSION_STUDY: { minWords: 220, targetWords: 340, maxWords: 500 },
  LAYOUT_16_CUTAWAY_FEATURE: { minWords: 180, targetWords: 300, maxWords: 440 },
};

const REQUIRED_LAYOUT_TEMPLATES = Object.keys(DEFAULT_LAYOUT_CAPACITY) as LayoutTemplateId[];

export interface LayoutLibraryIssue {
  templateId: LayoutTemplateId;
  severity: 'BLOCKER' | 'WARNING';
  code: string;
  message: string;
}

export interface LayoutLibraryValidation {
  totalTemplates: number;
  approvedTemplates: number;
  missingTemplates: LayoutTemplateId[];
  issues: LayoutLibraryIssue[];
  readyForProduction: boolean;
}

export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/[#>*_~|`-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countPageWords(markdown: string): number {
  const text = stripMarkdown(markdown);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

interface ChooseLayoutResult {
  template: LayoutTemplateId;
  reasons: string[];
  rule: string;
  explanation: string;
  alternatives: Array<{ template: LayoutTemplateId; skippedBecause: string }>;
}

function chooseLayout(page: PageManifest, wordCount: number, config: ProjectConfig): ChooseLayoutResult {
  // Layout intent comes from what the page IS (title + image subject), not from
  // incidental vocabulary in the body prose. This prevents a single word like
  // "diagnostic" or a "look-alike warning" subsection from forcing a long entry
  // into a low-capacity special layout that the text then overflows.
  const signal = signalText(page);
  const reasons: string[] = [];
  // Operator-tunable thresholds (with current defaults) — see LayoutPolicy.
  const t = config.layoutPolicy.thresholds;

  if (isDangerPage(page)) {
    reasons.push('danger_or_warning_signal');
    return {
      template: 'LAYOUT_4_DANGER_WARNING',
      reasons,
      rule: 'danger_override',
      explanation: 'Page identity is danger/toxic — locked to the warning layout, bypassing other signals.',
      alternatives: [],
    };
  }

  if (page.contentType) {
    reasons.push(`manifest_content_type_${page.contentType.toLowerCase()}`);
    const ct = page.contentType;
    switch (ct) {
      case 'CHAPTER_OPENER':
        return { template: 'LAYOUT_5_CHAPTER_OPENER', reasons, rule: `content_type_${ct.toLowerCase()}`, explanation: `Content type CHAPTER_OPENER maps to LAYOUT_5_CHAPTER_OPENER.`, alternatives: [] };
      case 'REFERENCE_PAGE':
        return { template: 'LAYOUT_6_BACK_MATTER', reasons, rule: `content_type_${ct.toLowerCase()}`, explanation: `Reference / back-matter content uses LAYOUT_6_BACK_MATTER.`, alternatives: [] };
      case 'ENCYCLOPEDIA_ENTRY':
        return { template: 'LAYOUT_2_TEXT_HEAVY', reasons, rule: `content_type_${ct.toLowerCase()}`, explanation: `Long encyclopedic entry — text-heavy layout with margin accent.`, alternatives: [] };
      case 'WARNING_PAGE':
        return { template: 'LAYOUT_4_DANGER_WARNING', reasons, rule: `content_type_${ct.toLowerCase()}`, explanation: `Warning content uses the danger layout.`, alternatives: [] };
      case 'COMPARISON':
      case 'MULTI_SPECIES_COMPARISON':
        return { template: config.layoutPolicy.comparisonTemplate, reasons, rule: `content_type_${ct.toLowerCase()}`, explanation: `Comparison content uses the project's comparisonTemplate (${config.layoutPolicy.comparisonTemplate}).`, alternatives: [] };
      case 'DIAGNOSTIC_DIAGRAM':
      case 'IDENTIFICATION_GUIDE':
        return { template: 'LAYOUT_12_DIAGNOSTIC_DIAGRAM', reasons, rule: `content_type_${ct.toLowerCase()}`, explanation: `Diagnostic / ID content uses LAYOUT_12_DIAGNOSTIC_DIAGRAM.`, alternatives: [] };
      case 'HABITAT_OVERVIEW':
      case 'TERRAIN_ANALYSIS': {
        const split = t.terrainBannerThreshold;
        const tpl = wordCount > split ? 'LAYOUT_13_FEATURE_BANNER' : 'LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD';
        const otherTpl = wordCount > split ? 'LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD' : 'LAYOUT_13_FEATURE_BANNER';
        return { template: tpl, reasons, rule: `content_type_${ct.toLowerCase()}_wordcount_split_${split}`, explanation: `Habitat/terrain content with ${wordCount} words — over ${split} routes to a feature banner; ≤ ${split} routes to a landscape spread.`, alternatives: [{ template: otherTpl as LayoutTemplateId, skippedBecause: wordCount > split ? `over ${split} words — banner suits this length better` : `≤ ${split} words — landscape spread suits a short overview` }] };
      }
      case 'PROGRESSION_STUDY':
        return { template: 'LAYOUT_15_PROGRESSION_STUDY', reasons, rule: `content_type_${ct.toLowerCase()}`, explanation: `Progression / lifecycle content uses LAYOUT_15_PROGRESSION_STUDY.`, alternatives: [] };
      case 'CUTAWAY_ILLUSTRATION':
        return { template: 'LAYOUT_16_CUTAWAY_FEATURE', reasons, rule: `content_type_${ct.toLowerCase()}`, explanation: `Cutaway / cross-section content uses LAYOUT_16_CUTAWAY_FEATURE.`, alternatives: [] };
      case 'FIELD_NOTES_PAGE':
        return { template: 'LAYOUT_7_SCATTERED_VIGNETTES', reasons, rule: `content_type_${ct.toLowerCase()}`, explanation: `Field-notes content (tracks/signs/vignettes) uses scattered vignettes.`, alternatives: [] };
      case 'BOTANICAL_PLATE':
        return { template: 'LAYOUT_10_FULL_PAGE_PLATE', reasons, rule: `content_type_${ct.toLowerCase()}`, explanation: `Botanical plate content uses the full-page plate.`, alternatives: [] };
      case 'SIDEBAR_FEATURE':
        return { template: 'LAYOUT_14_SIDEBAR_FEATURE', reasons, rule: `content_type_${ct.toLowerCase()}`, explanation: `Sidebar feature content uses LAYOUT_14_SIDEBAR_FEATURE.`, alternatives: [] };
      case 'ANIMAL_PROFILE':
      case 'SPECIES_PROFILE': {
        const sb = t.speciesProfileSidebarThreshold;
        const mg = t.speciesProfileMarginThreshold;
        const th = t.speciesProfileTextHeavyThreshold;
        const il = t.speciesProfileIllustrationDominantThreshold;
        const alts: Array<{ template: LayoutTemplateId; skippedBecause: string }> = [
          { template: 'LAYOUT_14_SIDEBAR_FEATURE', skippedBecause: `needs > ${sb} words` },
          { template: 'LAYOUT_8_MARGIN_ILLUSTRATION', skippedBecause: `needs > ${mg} words` },
          { template: 'LAYOUT_2_TEXT_HEAVY', skippedBecause: `needs > ${th} words` },
          { template: 'LAYOUT_3_ILLUSTRATION_DOMINANT', skippedBecause: `needs < ${il} words` },
          { template: config.layoutPolicy.defaultTemplate, skippedBecause: `default standard range ${il}–${th} words` },
        ];
        if (wordCount > sb) return { template: 'LAYOUT_14_SIDEBAR_FEATURE', reasons: [...reasons, 'long_profile_sidebar_art'], rule: `content_type_${ct.toLowerCase()}_wordcount_over_${sb}`, explanation: `${ct} with ${wordCount} words (> ${sb}) — sidebar feature gives room for long copy with vertical art.`, alternatives: alts.filter((a) => a.template !== 'LAYOUT_14_SIDEBAR_FEATURE') };
        if (wordCount > mg) return { template: 'LAYOUT_8_MARGIN_ILLUSTRATION', reasons: [...reasons, 'long_profile_margin_art'], rule: `content_type_${ct.toLowerCase()}_wordcount_over_${mg}`, explanation: `${ct} with ${wordCount} words (> ${mg}) — margin illustration keeps text room dominant.`, alternatives: alts.filter((a) => a.template !== 'LAYOUT_8_MARGIN_ILLUSTRATION') };
        if (wordCount > th) return { template: 'LAYOUT_2_TEXT_HEAVY', reasons: [...reasons, 'dense_profile_corner_art'], rule: `content_type_${ct.toLowerCase()}_wordcount_over_${th}`, explanation: `${ct} with ${wordCount} words (> ${th}) — text-heavy layout with small corner art.`, alternatives: alts.filter((a) => a.template !== 'LAYOUT_2_TEXT_HEAVY') };
        if (wordCount < il) return { template: 'LAYOUT_3_ILLUSTRATION_DOMINANT', reasons: [...reasons, 'short_profile_hero_art'], rule: `content_type_${ct.toLowerCase()}_wordcount_under_${il}`, explanation: `${ct} with ${wordCount} words (< ${il}) — illustration-dominant gives the short copy a hero image.`, alternatives: alts.filter((a) => a.template !== 'LAYOUT_3_ILLUSTRATION_DOMINANT') };
        return { template: config.layoutPolicy.defaultTemplate, reasons, rule: `content_type_${ct.toLowerCase()}_standard_range`, explanation: `${ct} with ${wordCount} words (${il}–${th}) — uses the project default (${config.layoutPolicy.defaultTemplate}).`, alternatives: alts.filter((a) => a.template !== config.layoutPolicy.defaultTemplate) };
      }
      default:
        break;
    }
  }

  // Signal cascade — matches identity keywords (title + image subject only).
  // Each branch documents which signal fired so the operator can see WHY this
  // page took a special-purpose layout instead of the standard one.
  const signalRules: Array<{
    needles: string[];
    template: LayoutTemplateId | ((wc: number) => LayoutTemplateId);
    rule: string;
    reasonCode: string;
    explain: (matched: string) => string;
  }> = [
    { needles: ['chapter opener', 'chapter introduction', 'section introduction', 'opening page', 'opener'], template: 'LAYOUT_5_CHAPTER_OPENER', rule: 'signal_chapter_opener', reasonCode: 'chapter_opener_signal', explain: (m) => `Identity contains "${m}" → chapter-opener layout.` },
    { needles: ['glossary', 'index', 'back matter', 'quick reference', 'reference table', 'reference grid'], template: 'LAYOUT_6_BACK_MATTER', rule: 'signal_reference', reasonCode: 'reference_or_back_matter_signal', explain: (m) => `Identity contains "${m}" → back-matter layout.` },
    { needles: ['hazard', 'extreme weather', 'lyme', 'tick-borne', 'tick borne', 'hypothermia', 'river crossing', 'spruce trap', 'disorientation'], template: 'LAYOUT_4_DANGER_WARNING', rule: 'signal_hazard', reasonCode: 'hazard_section_signal', explain: (m) => `Identity contains hazard signal "${m}" → warning layout.` },
    { needles: ['life cycle', 'lifecycle', 'growth stage', 'growth stages', 'stage sequence', 'progression', 'development over time', 'seedling', 'sapling', 'mature stage', 'seasonal sequence'], template: 'LAYOUT_15_PROGRESSION_STUDY', rule: 'signal_progression', reasonCode: 'progression_or_lifecycle_signal', explain: (m) => `Identity contains "${m}" → progression study layout.` },
    { needles: ['cutaway', 'cut away', 'cross-section', 'cross section', 'layered', 'layers', 'internal structure', 'hidden relationship', 'root layer', 'soil layer', 'strata', 'stratum', 'groundwater zone'], template: 'LAYOUT_16_CUTAWAY_FEATURE', rule: 'signal_cutaway', reasonCode: 'cutaway_or_layer_signal', explain: (m) => `Identity contains "${m}" → cutaway feature layout.` },
    { needles: ['compare', 'comparison', 'look-alike', 'look alike', 'versus', ' vs ', 'similar species'], template: config.layoutPolicy.comparisonTemplate, rule: 'signal_comparison', reasonCode: 'comparison_or_lookalike_signal', explain: (m) => `Identity contains "${m}" → project comparisonTemplate (${config.layoutPolicy.comparisonTemplate}).` },
    { needles: ['diagram', 'anatomy', 'diagnostic', 'parts', 'major features', 'identifying features'], template: 'LAYOUT_12_DIAGNOSTIC_DIAGRAM', rule: 'signal_diagnostic', reasonCode: 'diagnostic_diagram_signal', explain: (m) => `Identity contains "${m}" → diagnostic-diagram layout.` },
    { needles: ['overview', 'region overview', 'feature banner', 'visual header', 'mountain range', 'river system', 'watershed', 'landscape context'], template: 'LAYOUT_13_FEATURE_BANNER', rule: 'signal_feature_banner', reasonCode: 'feature_banner_signal', explain: (m) => `Identity contains "${m}" → feature banner layout.` },
    { needles: ['geography', 'geology', 'climate', 'season', 'seasons', 'wilderness zone', 'wilderness zones', 'terrain', 'ecoregion'], template: 'LAYOUT_13_FEATURE_BANNER', rule: 'signal_terrain', reasonCode: 'terrain_or_region_structure_signal', explain: (m) => `Identity contains "${m}" → terrain feature banner layout.` },
    { needles: ['track', 'tracks', 'habitat scene', 'signs', 'scat', 'trail'], template: 'LAYOUT_7_SCATTERED_VIGNETTES', rule: 'signal_field_signs', reasonCode: 'track_or_habitat_signal', explain: (m) => `Identity contains "${m}" → scattered vignettes layout.` },
    { needles: ['tree', 'sapling', 'tall plant', 'vine', 'trunk', 'bark'], template: (wc) => (wc >= t.tallSubjectSidebarThreshold ? 'LAYOUT_14_SIDEBAR_FEATURE' : 'LAYOUT_8_MARGIN_ILLUSTRATION'), rule: 'signal_tall_subject', reasonCode: 'tall_subject_signal', explain: (m) => `Identity contains tall-subject signal "${m}" → sidebar (≥${t.tallSubjectSidebarThreshold} words) or margin art (< ${t.tallSubjectSidebarThreshold}).` },
  ];

  for (const r of signalRules) {
    const matched = r.needles.find((needle) => signal.includes(needle));
    if (!matched) continue;
    reasons.push(r.reasonCode);
    const template = typeof r.template === 'function' ? r.template(wordCount) : r.template;
    return { template, reasons, rule: r.rule, explanation: r.explain(matched), alternatives: [] };
  }

  const shortT = t.shortTextThreshold;
  const longT = t.longTextThreshold;
  if (wordCount < shortT) {
    reasons.push(`short_text_under_${shortT}_words`);
    return {
      template: 'LAYOUT_3_ILLUSTRATION_DOMINANT',
      reasons,
      rule: `wordcount_under_${shortT}`,
      explanation: `No content-type or signal match; ${wordCount} words (< ${shortT}) — illustration-dominant default for short entries.`,
      alternatives: [
        { template: config.layoutPolicy.defaultTemplate, skippedBecause: `needs ≥ ${shortT} words for standard layout` },
        { template: config.layoutPolicy.longTextTemplate, skippedBecause: `needs > ${longT} words for long-text layout` },
      ],
    };
  }

  if (wordCount > longT) {
    reasons.push(`long_text_over_${longT}_words`);
    return {
      template: config.layoutPolicy.longTextTemplate,
      reasons,
      rule: `wordcount_over_${longT}`,
      explanation: `No content-type or signal match; ${wordCount} words (> ${longT}) — project's longTextTemplate (${config.layoutPolicy.longTextTemplate}).`,
      alternatives: [
        { template: 'LAYOUT_3_ILLUSTRATION_DOMINANT', skippedBecause: `needs < ${shortT} words` },
        { template: config.layoutPolicy.defaultTemplate, skippedBecause: `standard range ${shortT}–${longT} words` },
      ],
    };
  }

  reasons.push('standard_entry_word_range');
  return {
    template: config.layoutPolicy.defaultTemplate,
    reasons,
    rule: 'wordcount_standard_range',
    explanation: `No content-type or signal match; ${wordCount} words (${shortT}–${longT}) — project default (${config.layoutPolicy.defaultTemplate}).`,
    alternatives: [
      { template: 'LAYOUT_3_ILLUSTRATION_DOMINANT', skippedBecause: `needs < ${shortT} words` },
      { template: config.layoutPolicy.longTextTemplate, skippedBecause: `needs > ${longT} words` },
    ],
  };
}

function assetForTemplate(config: ProjectConfig, template: LayoutTemplateId): LayoutPromptAsset | undefined {
  return config.layoutPromptAssets.find((asset) => asset.templateId === template);
}

function uniqueAssets(config: ProjectConfig): LayoutPromptAsset[] {
  const seen = new Set<LayoutTemplateId>();
  const assets: LayoutPromptAsset[] = [];
  for (const rawAsset of config.layoutPromptAssets) {
    const asset = LayoutPromptAssetSchema.parse(rawAsset);
    if (seen.has(asset.templateId)) continue;
    seen.add(asset.templateId);
    assets.push(asset);
  }
  return assets;
}

export function validateLayoutLibrary(config: ProjectConfig): LayoutLibraryValidation {
  const assets = uniqueAssets(config);
  const byTemplate = new Map(assets.map((asset) => [asset.templateId, asset]));
  const issues: LayoutLibraryIssue[] = [];
  const missingTemplates = REQUIRED_LAYOUT_TEMPLATES.filter((templateId) => !byTemplate.has(templateId));

  for (const templateId of missingTemplates) {
    issues.push({
      templateId,
      severity: 'BLOCKER',
      code: 'missing_layout_asset',
      message: `Missing layout prompt asset for ${templateId}.`,
    });
  }

  for (const asset of assets) {
    if (asset.minWords > asset.targetWords || asset.targetWords > asset.maxWords) {
      issues.push({
        templateId: asset.templateId,
        severity: 'BLOCKER',
        code: 'invalid_capacity_range',
        message: `${asset.templateId} must satisfy minWords <= targetWords <= maxWords.`,
      });
    }

    for (const placeholder of REQUIRED_PROMPT_PLACEHOLDERS) {
      if (!asset.placeholders.includes(placeholder) || !asset.promptTemplate.includes(placeholder)) {
        issues.push({
          templateId: asset.templateId,
          severity: 'BLOCKER',
          code: 'missing_required_placeholder',
          message: `${asset.templateId} prompt template must include ${placeholder}.`,
        });
      }
    }

    if (asset.capacityTestStatus !== 'APPROVED') {
      issues.push({
        templateId: asset.templateId,
        severity: 'WARNING',
        code: 'capacity_not_approved',
        message: `${asset.templateId} capacity is ${asset.capacityTestStatus}; text-fit must approve before image spend.`,
      });
    }

    if (asset.layoutDescription.startsWith('Written description')) {
      issues.push({
        templateId: asset.templateId,
        severity: 'WARNING',
        code: 'generic_layout_description',
        message: `${asset.templateId} needs a written layout description from the mockup analysis.`,
      });
    }

    if (asset.useCases.length === 0) {
      issues.push({
        templateId: asset.templateId,
        severity: 'WARNING',
        code: 'missing_use_cases',
        message: `${asset.templateId} should list written use cases for the planner agent.`,
      });
    }
  }

  return {
    totalTemplates: assets.length,
    approvedTemplates: assets.filter((asset) => asset.capacityTestStatus === 'APPROVED').length,
    missingTemplates,
    issues,
    readyForProduction: issues.every((issue) => issue.severity !== 'BLOCKER'),
  };
}

function promptHash(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex');
}

function replaceTemplatePlaceholders(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((current, [key, value]) => current.replaceAll(key, value), template);
}

function appendPromptSafetyRules(promptTemplate: string): string {
  if (promptTemplate.includes('LAYOUT SYSTEM RULES')) return promptTemplate;
  return `${promptTemplate}\n\n${IMAGE_PROMPT_SAFETY_RULES}`;
}

/**
 * Box-model assertions that contradict the full-page-artwork model. These phrases
 * historically lived in per-layout `promptTemplate` prose that is persisted in a
 * project's stored config — so a project created before the zone migration still
 * carries them, and re-planning re-emits them straight to the image model
 * alongside the (correct) zone-based PAGE COMPOSITION BRIEF. The image model then
 * receives two contradictory mental models in one prompt.
 *
 * Each pattern matches a line that asserts the image and the text live in
 * SEPARATE COMPARTMENTS ("a box + a text area") — the model we retired. The zone
 * vocabulary is deliberately protected: "text-safe zone" (hyphenated), "image-
 * priority zone", "the image IS the page", "~40% of the page", "upper band",
 * "upper-center" do NOT match any pattern and survive untouched. Note the
 * difference: "text area" (compartment) is stripped; "text-safe zone" (zone) is not.
 */
const BOX_MODEL_LINE_PATTERNS: RegExp[] = [
  // Explicit separation / compartment assertions.
  /strong separation between image and content/i,
  /strong visual separation between the illustration/i,
  /maintain (a )?strong (visual )?separation/i,
  /remains (largely|mostly|primarily) (clear|empty|reserved|available)/i,
  /reserved space for future educational content/i,
  /avoid background elements spilling into the content area/i,
  // Positional "the illustration lives only in part of the page" language.
  // "portion" is the compartment tell — match it in any phrasing ("Upper portion
  // remains uninterrupted", "spans the upper portion of the page"). Zone language
  // uses "band" / "-center" / "image-priority zone", never "portion", so this is safe.
  /\b(upper|lower|left|right|top|bottom)\s+portion\b/i,
  // Percentage-band "<region> N% contains/remains the illustration/text" lines.
  /\b(upper|lower|left|right|top|bottom|rightmost|leftmost|topmost|bottommost)\s+[\w-]*\s*\d{1,3}(\s*-\s*\d{1,3})?%\s+(contains|remains|is reserved|holds|reserved)/i,
  // The retired "text area(s)" / "content area(s)" compartment noun (NOT
  // "text-safe zone"). Must match the PLURAL too — \b after "area" fails on
  // "areas", so an explicit optional s is required.
  /\btext areas?\b/i,
  /\bcontent areas?\b/i,
  /\breading areas?\b/i,
  /annotations? (extend|extending) (from|into)/i,
];

/**
 * Strip box-model directive lines from an assembled prompt so the image model only
 * ever sees the full-page-artwork + zones model. Deterministic and idempotent.
 * Backend-owned: makes the zone model immune to stale per-project stored templates.
 */
export function stripLegacyBoxModelLanguage(prompt: string): string {
  const kept = prompt
    .split('\n')
    .filter((line) => !BOX_MODEL_LINE_PATTERNS.some((re) => re.test(line)));
  // Collapse any 3+ blank-line runs left behind into a single blank line.
  return kept.join('\n').replace(/\n{3,}/g, '\n\n');
}

function scientificDetails(page: PageManifest): string {
  const pieces = [
    page.scientificName ? `Scientific name: ${page.scientificName}.` : '',
    stripMarkdown(page.bodyMarkdown).slice(0, 900),
    page.warnings.length > 0 ? `Warnings: ${page.warnings.join('; ')}.` : '',
  ].filter(Boolean);
  return pieces.join(' ');
}

function labelTextRules(_page: PageManifest): string {
  return [
    'Render NO text of any kind in the image — not even the subject name.',
    `The subject "${_page.entryTitle.trim()}" and all labels/annotations are typeset later by the layout system, never drawn by the image model.`,
    'Do not invent captions, names, notes, measurements, reference blurbs, article text, arrows, or labels.',
  ].join(' ');
}

function artBriefText(
  page: PageManifest,
  allocation: LayoutAllocation,
  asset: LayoutPromptAsset | undefined,
): string {
  const z = allocation.imagePriorityZone;
  const imagePct = allocation.openingPageImagePercent;
  const textPct = allocation.openingPageTextPercent;
  // Per-layout zone descriptions are operator-editable in project config but were
  // historically NOT reaching the image model. Quoting them here makes the
  // operator-controlled language actually influence generation.
  const textSafeDescription = asset?.textZoneDescription?.trim()
    || `Keep this region of the artwork visually calm and low-detail: sky, mist, soft terrain, plain ground, even background.`;
  const imagePriorityDescription = asset?.imageZoneDescription?.trim()
    || asset?.imageSlotDescription?.trim()
    || `Concentrate primary detail, focal subject, depth, and color saturation here.`;
  return [
    'PAGE COMPOSITION BRIEF',
    `The image IS the entire page (full-bleed artwork — no boxes, no frames, no cards). Compose the artwork so it honors the three zones below.`,
    '',
    `• IMAGE-PRIORITY ZONE — ${allocation.imagePlacement} (~${imagePct}% of the page)`,
    `    Subject anchor: ${page.imageSubject}.`,
    `    ${imagePriorityDescription}`,
    `    Recommended density: ${z.recommendedWidthPx}×${z.recommendedHeightPx}px of usable detail at 300 DPI within this zone.`,
    '',
    `• TEXT-SAFE ZONE — ${allocation.textPlacement} (~${textPct}% of the page)`,
    `    ${textSafeDescription}`,
    `    No important subjects, no fine pattern, no busy texture here — body text will overlay this zone.`,
    `    Reserve enough negative space that long-form educational copy reads cleanly directly on the artwork (no paper card will be added).`,
    '',
    `• TYPOGRAPHY ZONE — just above the text-safe zone (upper-center)`,
    `    The title sits directly on the artwork. Keep this band calm enough that bold display type reads without a backing panel.`,
    '',
    `Bleed safety: include at least ${z.bleedPaddingPx}px extra usable texture/detail around the outer page edges so trim/crop never reveals a missing zone.`,
    z.overlaySafeArea,
    'Do not render readable text, titles, labels, captions, page numbers, or typography inside the image. All typography is overlaid later by the layout engine.',
    'The entire page is artwork. These zones only describe where each kind of content is allowed to live — never frame an interior box around the image.',
  ].join('\n');
}

export function planPage(page: PageManifest, config: ProjectConfig, options: PlanPageOptions = {}): PagePlanningDecision {
  const agent = getAgentContract('PAGE_PLANNER');
  const wordCount = countPageWords(page.bodyMarkdown);
  const selected: ChooseLayoutResult = options.forcedLayoutTemplate
    ? {
        template: options.forcedLayoutTemplate,
        reasons: [options.reasonCode ?? 'operator_forced_layout'],
        rule: 'operator_forced',
        explanation: `Layout was operator-forced to ${options.forcedLayoutTemplate}${options.reasonCode ? ` (${options.reasonCode})` : ''}.`,
        alternatives: [],
      }
    : chooseLayout(page, wordCount, config);
  // Layered model: classify the page's purpose (first-class), and decompose the
  // chosen render template into its coverage + architecture axes so the operator
  // sees what actually renders. Rendering still flows through `selected.template`.
  const classification = classifyContentType(page);
  const contentType = classification.contentType;
  const contentPolicy = CONTENT_TYPE_POLICY[contentType];
  const composition = decomposeTemplate(selected.template);
  const rawAsset = assetForTemplate(config, selected.template);
  const asset = rawAsset ? LayoutPromptAssetSchema.parse(rawAsset) : undefined;
  const capacity = asset ?? DEFAULT_LAYOUT_CAPACITY[selected.template];
  const bodyPt = asset?.recommendedBodyPt ?? config.typography.bodyPt;
  const lineHeight = asset?.recommendedLineHeight ?? config.typography.lineHeight;
  const allocation = directLayout({
    bodyMarkdown: page.bodyMarkdown,
    layoutTemplate: selected.template,
    geometry: computePageGeometry(config.trimSize),
    bodyPt,
    lineHeight,
  });
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!asset) {
    blockers.push(`missing_layout_asset:${selected.template}`);
  } else if (asset.capacityTestStatus !== 'APPROVED') {
    warnings.push(`capacity_not_approved:${asset.capacityTestStatus}`);
  }

  const underMinWords = wordCount < capacity.minWords;
  const overMaxWords = wordCount > capacity.maxWords;
  if (underMinWords) warnings.push(`word_count_under_layout_min:${wordCount}<${capacity.minWords}`);
  if (overMaxWords) warnings.push(`word_count_over_layout_max:${wordCount}>${capacity.maxWords}`);

  const promptTemplate = asset?.promptTemplate ?? (
    `{MASTER_STYLE_DNA}\n\nCreate the final illustration for {SUBJECT}. Scientific details: {SCIENTIFIC_DETAILS}. ` +
    `Use composition notes: {COMPOSITION_NOTES}. Do not render page text, labels, titles, or typography.`
  );

  if (asset) {
    for (const placeholder of REQUIRED_PROMPT_PLACEHOLDERS) {
      if (!asset.placeholders.includes(placeholder) || !promptTemplate.includes(placeholder)) {
        blockers.push(`missing_required_placeholder:${placeholder}`);
      }
    }
  }

  const assembledPrompt = replaceTemplatePlaceholders(appendPromptSafetyRules(promptTemplate), {
    '{MASTER_STYLE_DNA}': config.imageGeneration.masterStyleBlockText,
    '{SUBJECT}': page.imageSubject,
    '{SCIENTIFIC_DETAILS}': scientificDetails(page),
    '{COMPOSITION_NOTES}': [
      asset?.imageZoneDescription ?? asset?.imageSlotDescription ?? `Image-priority zone follows ${selected.template}.`,
      // Pull the operator-editable layout description into the prompt context so
      // edits in project config actually influence the image. Previously surfaced
      // to the UI but never reached the model.
      asset?.layoutDescription && !asset.layoutDescription.startsWith('Written description')
        ? `LAYOUT CONTEXT: ${asset.layoutDescription}`
        : '',
      artBriefText(page, allocation, asset),
      labelTextRules(page),
    ].join('\n'),
  });
  // Defensive: strip any box-model assertions that survive in a stored per-project
  // promptTemplate so the image model only ever receives the zone model. The
  // backend owns the publishing model; stale stored templates cannot override it.
  const prompt = stripLegacyBoxModelLanguage(assembledPrompt);
  const unresolved = prompt.match(/\{[A-Z0-9_]+\}/g) ?? [];
  for (const placeholder of unresolved) {
    blockers.push(`unresolved_prompt_placeholder:${placeholder}`);
  }

  const capacityReasons = [
    `word_count_${wordCount}`,
    `layout_capacity_${capacity.minWords}_${capacity.targetWords}_${capacity.maxWords}`,
  ];

  return {
    pageKey: page.pageId,
    entryTitle: page.entryTitle,
    wordCount,
    contentType,
    contentTypePurpose: contentPolicy.purpose,
    contentTypeUsedFor: contentPolicy.usedFor,
    multiSubject: contentPolicy.multiSubject,
    coverage: composition.coverage,
    architecture: composition.architecture,
    layoutTemplate: selected.template,
    layoutReferenceLabel: asset?.label ?? selected.template,
    layoutInstructions: {
      description: asset?.layoutDescription ?? `Fallback instructions for ${selected.template}; written mockup analysis is missing.`,
      useCases: asset?.useCases ?? [],
      avoidWhen: asset?.avoidWhen ?? [],
      textZone: asset?.textZoneDescription ?? 'Text-safe zone has not been analyzed yet.',
      imageZone: asset?.imageZoneDescription ?? asset?.imageSlotDescription ?? 'Image-priority zone has not been analyzed yet.',
      textFitRule: asset?.textFitRule ?? 'Run text-fit preview before image generation.',
    },
    prompt,
    promptSha256: promptHash(prompt),
    promptReady: blockers.length === 0,
    reasonCodes: [...selected.reasons, ...capacityReasons],
    blockers,
    warnings,
    capacity: {
      minWords: capacity.minWords,
      targetWords: capacity.targetWords,
      maxWords: capacity.maxWords,
      status: asset?.capacityTestStatus ?? 'DEFAULT_UNTESTED',
      overMaxWords,
      underMinWords,
    },
    typography: {
      bodyFont: config.typography.bodyFont,
      bodyPt,
      lineHeight,
    },
    artBrief: {
      imagePercent: allocation.openingPageImagePercent,
      textPercent: allocation.openingPageTextPercent,
      placement: allocation.imagePlacement,
      textPlacement: allocation.textPlacement,
      architecture: allocation.architecture,
      textSafeZones: allocation.textSafeZones,
      typographyZones: allocation.typographyZones,
      imagePriorityZones: allocation.imagePriorityZones,
      imagePriorityZone: allocation.imagePriorityZone,
      artBox: allocation.artBox,
    },
    agent: {
      id: agent.id,
      name: agent.name,
      mission: agent.mission,
      expertFrame: agent.expertFrame,
    },
    textFitStatus: blockers.length > 0 ? 'BLOCKED_LAYOUT_LIBRARY' : 'PENDING_PREVIEW',
    decisionTrace: {
      contentTypeSource: page.contentType ? 'from_manifest' : 'classified',
      contentTypeReason: page.contentType
        ? `Content type carried over from Stage 1.5 manifest (${page.contentType}).`
        : `Inferred from page identity — ${classification.reason}.`,
      layoutRule: selected.rule,
      layoutExplanation: selected.explanation,
      wordCountBand: wordCount < 200 ? 'under_200' : wordCount > 400 ? 'over_400' : 'standard_range',
      operatorForced: Boolean(options.forcedLayoutTemplate),
      alternativesConsidered: selected.alternatives,
    },
  };
}
