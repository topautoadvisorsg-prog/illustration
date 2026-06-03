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

Preserve future text areas above all else. Do not allow illustrations, background elements, diagrams, labels, decorative details, or environmental elements to consume areas intended for written educational content. When in doubt, leave more negative space.

Generate clean artwork only. The illustration must contain ZERO readable text of any kind: no subject names, labels, captions, titles, headings, paragraphs, article text, fake encyclopedia text, page numbers, headers, reference notes, measurements, callouts, or annotations. Do not draw arrows, leader lines, or pointer marks with text. All labels, names, annotations, arrows, and typography are added later by the layout/composition system — never by the image model.

Do not generate readable text by default. If a future prompt explicitly supplies an explicit subject-name label, render exactly that supplied label, large and legible, with no extra words. This planner currently supplies no such label text.

Use minimal annotation only when structurally necessary. Limit callouts to 0-2 major, obvious educational features per subject. Avoid dense labeling systems, technical breakdowns, scientific poster layouts, and small-detail callouts.

Do not build scientific-poster layouts, dense labeling systems, or technical breakdowns. The image is pure subject artwork; the educational markup is overlaid afterward.

Layouts define image placement, negative space, reading flow, content zones, and visual hierarchy. They do not define subject matter, article content, or detailed scientific analysis.

Prioritize readability over visual density. A simpler image with protected text placement is preferred over a beautiful image that consumes the content area.

Subject-specific flexibility is allowed for wilderness subjects as long as the intended text zones remain clear.

Negative space is intentional. Do not fill empty areas simply because space is available.

Final rule: the educational knowledge belongs primarily in the written article. The illustration supports the lesson; it does not replace it.`;

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
    artBox: LayoutAllocation['artBox'];
  };
  agent: {
    id: string;
    name: string;
    mission: string;
    expertFrame: string;
  };
  textFitStatus: 'PENDING_PREVIEW' | 'BLOCKED_LAYOUT_LIBRARY';
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

function chooseLayout(page: PageManifest, wordCount: number, config: ProjectConfig): { template: LayoutTemplateId; reasons: string[] } {
  // Layout intent comes from what the page IS (title + image subject), not from
  // incidental vocabulary in the body prose. This prevents a single word like
  // "diagnostic" or a "look-alike warning" subsection from forcing a long entry
  // into a low-capacity special layout that the text then overflows.
  const signal = signalText(page);
  const reasons: string[] = [];

  if (isDangerPage(page)) {
    reasons.push('danger_or_warning_signal');
    return { template: 'LAYOUT_4_DANGER_WARNING', reasons };
  }

  if (page.contentType) {
    reasons.push(`manifest_content_type_${page.contentType.toLowerCase()}`);
    switch (page.contentType) {
      case 'CHAPTER_OPENER':
        return { template: 'LAYOUT_5_CHAPTER_OPENER', reasons };
      case 'REFERENCE_PAGE':
        return { template: 'LAYOUT_6_BACK_MATTER', reasons };
      case 'ENCYCLOPEDIA_ENTRY':
        return { template: 'LAYOUT_2_TEXT_HEAVY', reasons };
      case 'WARNING_PAGE':
        return { template: 'LAYOUT_4_DANGER_WARNING', reasons };
      case 'COMPARISON':
      case 'MULTI_SPECIES_COMPARISON':
        return { template: config.layoutPolicy.comparisonTemplate, reasons };
      case 'DIAGNOSTIC_DIAGRAM':
      case 'IDENTIFICATION_GUIDE':
        return { template: 'LAYOUT_12_DIAGNOSTIC_DIAGRAM', reasons };
      case 'HABITAT_OVERVIEW':
      case 'TERRAIN_ANALYSIS':
        return { template: wordCount > 180 ? 'LAYOUT_13_FEATURE_BANNER' : 'LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD', reasons };
      case 'PROGRESSION_STUDY':
        return { template: 'LAYOUT_15_PROGRESSION_STUDY', reasons };
      case 'CUTAWAY_ILLUSTRATION':
        return { template: 'LAYOUT_16_CUTAWAY_FEATURE', reasons };
      case 'FIELD_NOTES_PAGE':
        return { template: 'LAYOUT_7_SCATTERED_VIGNETTES', reasons };
      case 'BOTANICAL_PLATE':
        return { template: 'LAYOUT_10_FULL_PAGE_PLATE', reasons };
      case 'SIDEBAR_FEATURE':
        return { template: 'LAYOUT_14_SIDEBAR_FEATURE', reasons };
      case 'ANIMAL_PROFILE':
      case 'SPECIES_PROFILE':
        if (wordCount > 900) return { template: 'LAYOUT_14_SIDEBAR_FEATURE', reasons: [...reasons, 'long_profile_sidebar_art'] };
        if (wordCount > 650) return { template: 'LAYOUT_8_MARGIN_ILLUSTRATION', reasons: [...reasons, 'long_profile_margin_art'] };
        if (wordCount > 420) return { template: 'LAYOUT_2_TEXT_HEAVY', reasons: [...reasons, 'dense_profile_corner_art'] };
        if (wordCount < 180) return { template: 'LAYOUT_3_ILLUSTRATION_DOMINANT', reasons: [...reasons, 'short_profile_hero_art'] };
        return { template: config.layoutPolicy.defaultTemplate, reasons };
      default:
        break;
    }
  }

  if (includesAny(signal, ['chapter opener', 'chapter introduction', 'section introduction', 'opening page', 'opener'])) {
    reasons.push('chapter_opener_signal');
    return { template: 'LAYOUT_5_CHAPTER_OPENER', reasons };
  }

  if (includesAny(signal, ['glossary', 'index', 'back matter', 'quick reference', 'reference table', 'reference grid'])) {
    reasons.push('reference_or_back_matter_signal');
    return { template: 'LAYOUT_6_BACK_MATTER', reasons };
  }

  if (includesAny(signal, ['hazard', 'extreme weather', 'lyme', 'tick-borne', 'tick borne', 'hypothermia', 'river crossing', 'spruce trap', 'disorientation'])) {
    reasons.push('hazard_section_signal');
    return { template: 'LAYOUT_4_DANGER_WARNING', reasons };
  }

  if (includesAny(signal, ['life cycle', 'lifecycle', 'growth stage', 'growth stages', 'stage sequence', 'progression', 'development over time', 'seedling', 'sapling', 'mature stage', 'seasonal sequence'])) {
    reasons.push('progression_or_lifecycle_signal');
    return { template: 'LAYOUT_15_PROGRESSION_STUDY', reasons };
  }

  if (includesAny(signal, ['cutaway', 'cut away', 'cross-section', 'cross section', 'layered', 'layers', 'internal structure', 'hidden relationship', 'root layer', 'soil layer', 'strata', 'stratum', 'groundwater zone'])) {
    reasons.push('cutaway_or_layer_signal');
    return { template: 'LAYOUT_16_CUTAWAY_FEATURE', reasons };
  }

  if (includesAny(signal, ['compare', 'comparison', 'look-alike', 'look alike', 'versus', ' vs ', 'similar species'])) {
    reasons.push('comparison_or_lookalike_signal');
    return { template: config.layoutPolicy.comparisonTemplate, reasons };
  }

  if (includesAny(signal, ['diagram', 'anatomy', 'diagnostic', 'parts', 'major features', 'identifying features'])) {
    reasons.push('diagnostic_diagram_signal');
    return { template: 'LAYOUT_12_DIAGNOSTIC_DIAGRAM', reasons };
  }

  if (includesAny(signal, ['overview', 'region overview', 'feature banner', 'visual header', 'mountain range', 'river system', 'watershed', 'landscape context'])) {
    reasons.push('feature_banner_signal');
    return { template: 'LAYOUT_13_FEATURE_BANNER', reasons };
  }

  if (includesAny(signal, ['geography', 'geology', 'climate', 'season', 'seasons', 'wilderness zone', 'wilderness zones', 'terrain', 'ecoregion'])) {
    reasons.push('terrain_or_region_structure_signal');
    return { template: 'LAYOUT_13_FEATURE_BANNER', reasons };
  }

  if (includesAny(signal, ['track', 'tracks', 'habitat scene', 'signs', 'scat', 'trail'])) {
    reasons.push('track_or_habitat_signal');
    return { template: 'LAYOUT_7_SCATTERED_VIGNETTES', reasons };
  }

  if (includesAny(signal, ['tree', 'sapling', 'tall plant', 'vine', 'trunk', 'bark'])) {
    reasons.push('tall_subject_signal');
    return { template: wordCount >= 300 ? 'LAYOUT_14_SIDEBAR_FEATURE' : 'LAYOUT_8_MARGIN_ILLUSTRATION', reasons };
  }

  if (wordCount < 200) {
    reasons.push('short_text_under_200_words');
    return { template: 'LAYOUT_3_ILLUSTRATION_DOMINANT', reasons };
  }

  if (wordCount > 400) {
    reasons.push('long_text_over_400_words');
    return { template: config.layoutPolicy.longTextTemplate, reasons };
  }

  reasons.push('standard_entry_word_range');
  return { template: config.layoutPolicy.defaultTemplate, reasons };
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

function artBriefText(page: PageManifest, allocation: LayoutAllocation): string {
  const box = allocation.artBox;
  return [
    'ART BRIEF FOR IMAGE GENERATION',
    `Page subject: ${page.imageSubject}.`,
    `Layout architecture: ${allocation.architecture}.`,
    `Image share on opening page: ${allocation.openingPageImagePercent}%. Text share: ${allocation.openingPageTextPercent}%.`,
    `Image placement: ${allocation.imagePlacement}.`,
    `Text placement: ${allocation.textPlacement}.`,
    `Art slot box relative to text frame: x=${box.xIn}in, y=${box.yIn}in, width=${box.widthIn}in, height=${box.heightIn}in.`,
    `Recommended minimum source art: ${box.recommendedWidthPx}x${box.recommendedHeightPx}px at 300 DPI, aspect ${box.aspectRatio}.`,
    `Include at least ${box.bleedPaddingPx}px extra usable texture/detail around important subject edges for crop and bleed safety.`,
    box.overlaySafeArea,
    'Do not render readable text, titles, labels, captions, page numbers, or typography inside the image. Cover/chapter titles are overlaid later by the layout engine.',
  ].join('\n');
}

export function planPage(page: PageManifest, config: ProjectConfig): PagePlanningDecision {
  const agent = getAgentContract('PAGE_PLANNER');
  const wordCount = countPageWords(page.bodyMarkdown);
  const selected = chooseLayout(page, wordCount, config);
  // Layered model: classify the page's purpose (first-class), and decompose the
  // chosen render template into its coverage + architecture axes so the operator
  // sees what actually renders. Rendering still flows through `selected.template`.
  const contentType = classifyContentType(page).contentType;
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

  const prompt = replaceTemplatePlaceholders(appendPromptSafetyRules(promptTemplate), {
    '{MASTER_STYLE_DNA}': config.imageGeneration.masterStyleBlockText,
    '{SUBJECT}': page.imageSubject,
    '{SCIENTIFIC_DETAILS}': scientificDetails(page),
    '{COMPOSITION_NOTES}': [
      asset?.imageZoneDescription ?? asset?.imageSlotDescription ?? `Art slot follows ${selected.template}.`,
      artBriefText(page, allocation),
      labelTextRules(page),
    ].join('\n'),
  });
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
      textZone: asset?.textZoneDescription ?? 'Text zone has not been analyzed yet.',
      imageZone: asset?.imageZoneDescription ?? asset?.imageSlotDescription ?? 'Image zone has not been analyzed yet.',
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
      artBox: allocation.artBox,
    },
    agent: {
      id: agent.id,
      name: agent.name,
      mission: agent.mission,
      expertFrame: agent.expertFrame,
    },
    textFitStatus: blockers.length > 0 ? 'BLOCKED_LAYOUT_LIBRARY' : 'PENDING_PREVIEW',
  };
}
