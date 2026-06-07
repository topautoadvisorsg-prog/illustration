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

/**
 * Phase 2 — overflow auto-routing. ONLY the generic word-count layouts (in ascending
 * text capacity) may be auto-escalated when the body exceeds the chosen layout's word
 * capacity. SEMANTIC layouts chosen from a signal (terrain banner, sidebar/margin
 * tall-subject, danger, comparison, chapter opener, diagnostic, plate, landscape
 * spread, progression, cutaway, back-matter, scattered) keep their identity — clean
 * continuation pages absorb their overflow instead, so the page's character is not
 * silently swapped for a text-heavy layout.
 */
const REROUTABLE_BY_CAPACITY: LayoutTemplateId[] = [
  'LAYOUT_3_ILLUSTRATION_DOMINANT', // 240
  'LAYOUT_1_STANDARD', // 420
  'LAYOUT_2_TEXT_HEAVY', // 720 (highest)
];

/**
 * If a generic layout would overflow its word capacity, return the smallest
 * higher-capacity generic layout that fits (or the highest-capacity one if nothing
 * fits — clean continuation pages then absorb the remainder). Returns null when no
 * reroute is needed or the layout is semantic/forced.
 */
export function escalateForOverflow(template: LayoutTemplateId, wordCount: number): LayoutTemplateId | null {
  if (!REROUTABLE_BY_CAPACITY.includes(template)) return null;
  if (wordCount <= DEFAULT_LAYOUT_CAPACITY[template].maxWords) return null;
  const fits = REROUTABLE_BY_CAPACITY.find((t) => DEFAULT_LAYOUT_CAPACITY[t].maxWords >= wordCount);
  const target = fits ?? REROUTABLE_BY_CAPACITY[REROUTABLE_BY_CAPACITY.length - 1];
  if (!target || target === template) return null;
  return target;
}

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

// ─── Lean prompt architecture (blueprint is the source of truth) ───────────────
// The image prompt is now assembled in code: Master Style DNA + a SUBJECT PACKAGE +
// a short composition pointer to the blueprint image + a short rule set. The verbose
// per-layout templates, manuscript-prose dump, and repeated zone/no-text language are
// gone — the blueprint image carries the layout, so the prompt stops describing it.

export interface SubjectPackage {
  primary: string;
  supporting: string[];
  environment: string;
  mood: string;
}

// Deterministic supporting-element vocabulary (small studies for the ORANGE zones),
// keyed to subject/title keywords. New-England wilderness motifs only.
const SUPPORTING_VOCAB: Array<{ test: RegExp; items: string[] }> = [
  { test: /moose|deer|bear|lynx|fox|otter|beaver|animal|wildlife|track|scat/i, items: ['Animal tracks', 'Pine branch', 'Wetland grasses'] },
  { test: /river|stream|brook|water|crossing|falls/i, items: ['River stones', 'Fern cluster', 'Moss-covered log'] },
  { test: /pine|spruce|fir|hemlock|tree|forest|understory|woodland|hardwood|maple|birch/i, items: ['Fern cluster', 'Pinecone', 'Moss-covered log'] },
  { test: /mountain|alpine|ridge|summit|treeline|rocky|boulder|granite|geology|terrain|valley/i, items: ['Lichen-covered rock', 'Hardy alpine shrub', 'Weathered granite'] },
  { test: /mushroom|fungi|fungus/i, items: ['Fallen leaves', 'Forest duff', 'Moss patch'] },
  { test: /tick|lyme|hazard|safety|weather|hypothermia|storm/i, items: ['Pine branch', 'Lichen-covered rock', 'Fern cluster'] },
  { test: /flower|trillium|botanical|plant|fern|fiddlehead|wildflower/i, items: ['Leaf detail', 'Seed pod', 'Moss patch'] },
];
const DEFAULT_SUPPORTING = ['Fern cluster', 'Pinecone', 'Moss-covered log'];

const ENVIRONMENT_VOCAB: Array<{ test: RegExp; env: string }> = [
  { test: /boreal|black spruce|balsam|bog|tamarack|north(ern)?\b/i, env: 'Northern boreal forest and wetland' },
  { test: /alpine|treeline|presidential|summit|tundra|above treeline/i, env: 'Alpine zone above treeline' },
  { test: /hardwood|sugar maple|birch|beech|deciduous/i, env: 'Temperate New England hardwood forest' },
  { test: /river|stream|brook|wetland|marsh|water|crossing/i, env: 'New England river corridor and woodland' },
  { test: /mountain|ridge|granite|rocky|geology|valley|bones of the land/i, env: 'New England mountain terrain' },
];
const DEFAULT_ENVIRONMENT = 'Temperate New England woodland';

/** Derive the SUBJECT PACKAGE deterministically from the page (no manuscript prose). */
export function deriveSubjectPackage(page: PageManifest): SubjectPackage {
  const hay = `${page.entryTitle} ${page.imageSubject}`;
  const supporting = (SUPPORTING_VOCAB.find((v) => v.test.test(hay))?.items ?? DEFAULT_SUPPORTING).slice(0, 3);
  const environment = ENVIRONMENT_VOCAB.find((v) => v.test.test(hay))?.env ?? DEFAULT_ENVIRONMENT;
  const harsh = isDangerPage(page) || /hazard|winter|hypothermia|storm|cold|exposed|spruce trap|disorientation/i.test(hay);
  const mood = harsh
    ? 'Cold, stark, exposed wilderness; flat overcast light'
    : 'Quiet morning atmosphere; soft natural light';
  return { primary: page.imageSubject, supporting, environment, mood };
}

const LEAN_LAYOUT_RULES = [
  'LAYOUT RULES',
  '- The page is one continuous illustrated page.',
  '- BLUE = primary image priority. ORANGE = supporting studies. RED = the Reading Field (calm parchment).',
  '- Open the illustration organically into the Reading Field; never wall it off with a box, panel, or hard edge.',
  '- Keep the Reading Field calm, open, and low-detail; place no important subjects there.',
  '- Supporting studies sit directly on the page like museum specimen studies — no cards, sticky notes, boxes, frames, or colored/yellow backgrounds.',
  '- Generate imagery only. No words, letters, labels, captions, annotations, page numbers, or typography anywhere.',
].join('\n');

/** Assemble the lean image prompt: Style DNA + SUBJECT PACKAGE + blueprint pointer + rules. */
export function assembleLeanPrompt(masterStyleDna: string, pkg: SubjectPackage): string {
  return [
    masterStyleDna.trim(),
    '',
    'SUBJECT PACKAGE',
    '',
    'PRIMARY SUBJECT',
    `- ${pkg.primary}`,
    '',
    'SUPPORTING SUBJECTS',
    ...pkg.supporting.map((s) => `- ${s}`),
    '',
    'ENVIRONMENT',
    `- ${pkg.environment}`,
    '',
    'MOOD',
    `- ${pkg.mood}`,
    '',
    'COMPOSITION — follow the attached blueprint image. The whole page is ONE continuous illustrated page.',
    'RED zones = the READING FIELD: a calm, open, low-detail parchment area where typography will be placed later. It is NOT a box — place no important subjects here.',
    'BLUE zones = primary image priority: the main subject and the environmental scene; concentrate the strongest detail here.',
    'ORANGE zones = supporting study areas: small naturalist specimen studies placed directly on the page.',
    'The illustration must OPEN ORGANICALLY into the Reading Field — let the artwork dissolve into it through a natural transition: mist, light sky, pale terrain, calm water, paper tone, or atmospheric fade. No hard edge, no seam, no rectangle.',
    'Keep the Reading Field calm and open. The renderer/layout system owns final typography and readability — you only keep this area clear.',
    '',
    'Supporting studies feel like museum / naturalist studies placed directly on the page — delicate watercolor or ink specimen studies, hand-placed on the same paper. No cards. No sticky notes. No yellow or colored backgrounds. No boxes. No frames. No rectangles behind them.',
    '',
    LEAN_LAYOUT_RULES,
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

  // Phase 2 — overflow auto-routing. If an auto-selected general layout would
  // overflow its capacity, escalate to a higher-capacity general layout. Operator-
  // forced and semantic layouts are left untouched (clean continuation handles them).
  if (!options.forcedLayoutTemplate) {
    const escalated = escalateForOverflow(selected.template, wordCount);
    if (escalated) {
      const from = selected.template;
      selected.template = escalated;
      selected.reasons = [...selected.reasons, `overflow_autoroute_to_${escalated.toLowerCase()}`];
      selected.rule = 'overflow_autoroute';
      selected.explanation = `${selected.explanation} Auto-routed from ${from} to ${escalated} because ${wordCount} words exceed the original layout's capacity.`;
    }
  }
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

  // Lean prompt: assembled in code from Master Style DNA + SUBJECT PACKAGE + a short
  // blueprint pointer + a short rule set. The verbose per-layout templates, the
  // manuscript-prose dump, and the repeated zone/no-text language are no longer
  // emitted — the blueprint image is the source of truth for layout. (The old template
  // helpers remain defined in this file but are no longer used; cleanup pending.)
  const subjectPackage = deriveSubjectPackage(page);
  const prompt = assembleLeanPrompt(config.imageGeneration.masterStyleBlockText, subjectPackage);

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
