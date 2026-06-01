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
  type LayoutPromptAsset,
  type LayoutTemplateId,
  type PageManifest,
  type ProjectConfig,
} from '@wildlands/shared';
import { getAgentContract } from '../../agents/agent-contracts.js';

const REQUIRED_PROMPT_PLACEHOLDERS = ['{MASTER_STYLE_DNA}', '{SUBJECT}', '{SCIENTIFIC_DETAILS}', '{COMPOSITION_NOTES}'] as const;

const IMAGE_PROMPT_SAFETY_RULES = `LAYOUT SYSTEM RULES

Treat the selected layout as a strong reference template, not a rigid rule. Minor composition adjustments are allowed when they improve readability, subject presentation, or overall page quality.

Preserve future text areas above all else. Do not allow illustrations, background elements, diagrams, labels, decorative details, or environmental elements to consume areas intended for written educational content. When in doubt, leave more negative space.

Do not generate readable text by default. The only permitted image text is an explicit subject-name label supplied by the prompt. If a label is used, render exactly the supplied label text, large and legible, with no extra words. Do not render paragraphs, article text, captions, educational content, fake encyclopedia text, page numbers, headers, reference notes, or unrequested labels.

Use minimal annotation only when structurally necessary. Limit callouts to 0-2 major, obvious educational features per subject. Avoid dense labeling systems, technical breakdowns, scientific poster layouts, and small-detail callouts.

Layouts define image placement, negative space, reading flow, content zones, and visual hierarchy. They do not define subject matter, article content, or detailed scientific analysis.

Prioritize readability over visual density. A simpler image with protected text placement is preferred over a beautiful image that consumes the content area.

Subject-specific flexibility is allowed for wilderness subjects as long as the intended text zones remain clear.

Negative space is intentional. Do not fill empty areas simply because space is available.

Final rule: the educational knowledge belongs primarily in the written article. The illustration supports the lesson; it does not replace it.`;

export interface PagePlanningDecision {
  pageKey: string;
  entryTitle: string;
  wordCount: number;
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

function stripMarkdown(markdown: string): string {
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

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function chooseLayout(page: PageManifest, wordCount: number, config: ProjectConfig): { template: LayoutTemplateId; reasons: string[] } {
  const text = normalizeText(`${page.entryTitle}\n${page.imageSubject}\n${page.bodyMarkdown}\n${page.warnings.join('\n')}`);
  const reasons: string[] = [];

  if (page.warnings.length > 0 || includesAny(text, ['toxic', 'poison', 'deadly', 'danger', 'warning', 'do not eat'])) {
    reasons.push('danger_or_warning_signal');
    return { template: 'LAYOUT_12_DIAGNOSTIC_DIAGRAM', reasons };
  }

  if (includesAny(text, ['chapter opener', 'chapter introduction', 'section introduction', 'opening page', 'opener'])) {
    reasons.push('chapter_opener_signal');
    return { template: 'LAYOUT_5_CHAPTER_OPENER', reasons };
  }

  if (includesAny(text, ['life cycle', 'lifecycle', 'growth stage', 'growth stages', 'stage sequence', 'progression', 'development over time', 'seedling', 'sapling', 'mature stage', 'seasonal sequence'])) {
    reasons.push('progression_or_lifecycle_signal');
    return { template: 'LAYOUT_15_PROGRESSION_STUDY', reasons };
  }

  if (includesAny(text, ['cutaway', 'cut away', 'cross-section', 'cross section', 'layered', 'layers', 'internal structure', 'hidden relationship', 'root layer', 'soil layer', 'strata', 'stratum', 'groundwater zone'])) {
    reasons.push('cutaway_or_layer_signal');
    return { template: 'LAYOUT_16_CUTAWAY_FEATURE', reasons };
  }

  if (includesAny(text, ['compare', 'comparison', 'look-alike', 'look alike', 'versus', ' vs ', 'similar species'])) {
    reasons.push('comparison_or_lookalike_signal');
    return { template: config.layoutPolicy.comparisonTemplate, reasons };
  }

  if (includesAny(text, ['diagram', 'anatomy', 'diagnostic', 'parts', 'major features', 'identifying features'])) {
    reasons.push('diagnostic_diagram_signal');
    return { template: 'LAYOUT_12_DIAGNOSTIC_DIAGRAM', reasons };
  }

  if (includesAny(text, ['overview', 'region overview', 'feature banner', 'visual header', 'mountain range', 'river system', 'watershed', 'landscape context'])) {
    reasons.push('feature_banner_signal');
    return { template: 'LAYOUT_13_FEATURE_BANNER', reasons };
  }

  if (includesAny(text, ['track', 'tracks', 'habitat scene', 'signs', 'scat', 'trail'])) {
    reasons.push('track_or_habitat_signal');
    return { template: 'LAYOUT_7_SCATTERED_VIGNETTES', reasons };
  }

  if (includesAny(text, ['tree', 'sapling', 'tall plant', 'vine', 'trunk', 'bark'])) {
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

function labelTextRules(page: PageManifest): string {
  const exactLabel = page.entryTitle.trim();
  return [
    `Exact optional subject-name label: "${exactLabel}".`,
    'Use this label only if the approved layout calls for a visible subject name/title.',
    'If used, it must be the only readable text in the generated image, set large and clear.',
    'Do not invent captions, notes, measurements, reference blurbs, article text, or additional labels.',
  ].join(' ');
}

export function planPage(page: PageManifest, config: ProjectConfig): PagePlanningDecision {
  const agent = getAgentContract('PAGE_PLANNER');
  const wordCount = countPageWords(page.bodyMarkdown);
  const selected = chooseLayout(page, wordCount, config);
  const rawAsset = assetForTemplate(config, selected.template);
  const asset = rawAsset ? LayoutPromptAssetSchema.parse(rawAsset) : undefined;
  const capacity = asset ?? DEFAULT_LAYOUT_CAPACITY[selected.template];
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
      bodyPt: asset?.recommendedBodyPt ?? config.typography.bodyPt,
      lineHeight: asset?.recommendedLineHeight ?? config.typography.lineHeight,
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
