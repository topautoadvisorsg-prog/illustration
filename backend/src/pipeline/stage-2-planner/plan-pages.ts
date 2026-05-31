/**
 * Stage 2 - deterministic page planner.
 *
 * What it does: reads page manifests, calculates text signals, selects one of
 * the 9 layout templates, and assembles the image-only prompt for the subject
 * art. No image API spend happens here.
 * Input: page manifests + project config layout prompt assets.
 * Output: page planning rows with layout template, prompt, prompt hash, and
 * operator-visible reason codes.
 */

import { createHash } from 'node:crypto';
import type { LayoutPromptAsset, LayoutTemplateId, PageManifest, ProjectConfig } from '@wildlands/shared';

export interface PagePlanningDecision {
  pageKey: string;
  entryTitle: string;
  wordCount: number;
  layoutTemplate: LayoutTemplateId;
  layoutReferenceLabel: string;
  prompt: string;
  promptSha256: string;
  reasonCodes: string[];
  typography: {
    bodyFont: string;
    bodyPt: number;
    lineHeight: number;
  };
  textFitStatus: 'PENDING_PREVIEW';
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
};

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
    return { template: 'LAYOUT_4_DANGER_WARNING', reasons };
  }

  if (includesAny(text, ['compare', 'comparison', 'look-alike', 'look alike', 'versus', ' vs ', 'similar species'])) {
    reasons.push('comparison_or_lookalike_signal');
    return { template: config.layoutPolicy.comparisonTemplate, reasons };
  }

  if (includesAny(text, ['diagram', 'anatomy', 'diagnostic', 'parts', 'cross-section', 'cross section'])) {
    reasons.push('diagnostic_diagram_signal');
    return { template: 'LAYOUT_9_DIAGNOSTIC_DIAGRAM', reasons };
  }

  if (includesAny(text, ['track', 'tracks', 'habitat scene', 'signs', 'scat', 'trail'])) {
    reasons.push('track_or_habitat_signal');
    return { template: 'LAYOUT_7_SCATTERED_VIGNETTES', reasons };
  }

  if (includesAny(text, ['tree', 'sapling', 'tall plant', 'vine', 'trunk', 'bark'])) {
    reasons.push('tall_subject_signal');
    return { template: 'LAYOUT_8_MARGIN_ILLUSTRATION', reasons };
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

function promptHash(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex');
}

function replaceTemplatePlaceholders(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((current, [key, value]) => current.replaceAll(key, value), template);
}

function scientificDetails(page: PageManifest): string {
  const pieces = [
    page.scientificName ? `Scientific name: ${page.scientificName}.` : '',
    stripMarkdown(page.bodyMarkdown).slice(0, 900),
    page.warnings.length > 0 ? `Warnings: ${page.warnings.join('; ')}.` : '',
  ].filter(Boolean);
  return pieces.join(' ');
}

export function planPage(page: PageManifest, config: ProjectConfig): PagePlanningDecision {
  const wordCount = countPageWords(page.bodyMarkdown);
  const selected = chooseLayout(page, wordCount, config);
  const asset = assetForTemplate(config, selected.template);
  const capacity = asset ?? DEFAULT_LAYOUT_CAPACITY[selected.template];
  const promptTemplate = asset?.promptTemplate ?? (
    `Create the final illustration for {SUBJECT}. Scientific details: {SCIENTIFIC_DETAILS}. ` +
    `Use composition notes: {COMPOSITION_NOTES}. Do not render page text, labels, titles, or typography.`
  );
  const prompt = replaceTemplatePlaceholders(promptTemplate, {
    '{SUBJECT}': page.imageSubject,
    '{SCIENTIFIC_DETAILS}': scientificDetails(page),
    '{COMPOSITION_NOTES}': asset?.imageSlotDescription ?? `Art slot follows ${selected.template}.`,
  });

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
    prompt,
    promptSha256: promptHash(prompt),
    reasonCodes: [...selected.reasons, ...capacityReasons],
    typography: {
      bodyFont: config.typography.bodyFont,
      bodyPt: asset?.recommendedBodyPt ?? config.typography.bodyPt,
      lineHeight: asset?.recommendedLineHeight ?? config.typography.lineHeight,
    },
    textFitStatus: 'PENDING_PREVIEW',
  };
}
