import {
  PUBLISHING_STANDARD_PRESETS,
  PageManifestSchema,
  ProjectConfigSchema,
  type PageManifest,
  type ProjectConfig,
  type PublishingFormat,
} from '@wildlands/shared';
import { listManifests } from '../../db/repositories/manifests.repo.js';
import { getProject } from '../../db/repositories/projects.repo.js';
import { buildTextFitPreview } from '../../pipeline/stage-6-layout/text-fit-preview.js';

export interface FormatCalibrationOption {
  format: Exclude<PublishingFormat, 'CUSTOM'>;
  label: string;
  typographyPackage: string;
  trim: string;
  bodyPt: number;
  lineHeight: number;
  entries: number;
  estimatedProofPages: number;
  fits: number;
  tight: number;
  overflow: number;
  underfilled: number;
  averageFillPercent: number;
  score: number;
  verdict: 'BEST_FIT' | 'GOOD' | 'RISKY' | 'NOT_RECOMMENDED';
  operatorSummary: string;
  tradeoffs: string[];
}

export interface FormatCalibrationReport {
  chapterNumber: number;
  chapterTitle: string;
  currentFormat: string;
  recommendedFormat: string;
  recommendedLabel: string;
  nextAction: string;
  options: FormatCalibrationOption[];
}

function applyPreset(config: ProjectConfig, format: Exclude<PublishingFormat, 'CUSTOM'>): ProjectConfig {
  const preset = PUBLISHING_STANDARD_PRESETS[format];
  return ProjectConfigSchema.parse({
    ...config,
    editions: format === 'KINDLE_DIGITAL' ? ['KINDLE_EPUB'] : ['PREMIUM', 'KINDLE_EPUB'],
    publishingStandard: {
      format: preset.format,
      label: preset.label,
      typographyPackage: preset.typographyPackage,
      status: 'CONFIGURED',
    },
    trimSize: preset.trimSize,
    typography: { ...config.typography, ...preset.typography },
    outputProfile: { ...config.outputProfile, ...preset.outputProfile },
  });
}

function averageFillPercent(pages: ReturnType<typeof buildTextFitPreview>['pages']): number {
  if (pages.length === 0) return 0;
  const average = pages.reduce((sum, page) => sum + page.fit.fillRatio, 0) / pages.length;
  return Math.round(average * 100);
}

function estimatedProofPages(pages: ReturnType<typeof buildTextFitPreview>['pages']): number {
  return pages.reduce((sum, page) => sum + Math.max(1, page.allocation.estimatedRenderedPages), 0);
}

function scoreOption(option: Omit<FormatCalibrationOption, 'score' | 'verdict' | 'operatorSummary' | 'tradeoffs'>): number {
  const densityPenalty = Math.max(0, option.averageFillPercent - 82) * 1.6;
  const sparsePenalty = Math.max(0, 42 - option.averageFillPercent) * 0.8;
  const riskPenalty = option.overflow * 28 + option.tight * 8 + option.underfilled * 4;
  const pagePenalty = Math.max(0, option.estimatedProofPages - option.entries * 1.75) * 3;
  return Math.max(0, Math.round(100 - densityPenalty - sparsePenalty - riskPenalty - pagePenalty));
}

function verdictFor(score: number, overflow: number, tight: number): FormatCalibrationOption['verdict'] {
  if (overflow > 0) return 'NOT_RECOMMENDED';
  if (score >= 86 && tight <= 1) return 'BEST_FIT';
  if (score >= 72) return 'GOOD';
  return 'RISKY';
}

function summarizeOption(option: {
  label: string;
  overflow: number;
  tight: number;
  underfilled: number;
  entries: number;
}): string {
  if (option.overflow > 0) {
    return `${option.label} is risky for this chapter: ${option.overflow} page(s) overflow at this geometry.`;
  }
  if (option.tight > 0) {
    return `${option.label} works, but ${option.tight} page(s) are tight. Review proof pages before image spend.`;
  }
  if (option.underfilled > option.entries * 0.35) {
    return `${option.label} is spacious for this chapter. It may need stronger illustration moments to avoid empty-looking pages.`;
  }
  return `${option.label} gives this chapter a clean early fit with manageable density.`;
}

function tradeoffsFor(option: {
  format: Exclude<PublishingFormat, 'CUSTOM'>;
  averageFillPercent: number;
  tight: number;
  overflow: number;
}): string[] {
  const tradeoffs: string[] = [];
  if (option.format === 'PAPERBACK_6X9') tradeoffs.push('Compact paperback means more pages and less room for large art.');
  if (option.format === 'HARDCOVER_7X10') tradeoffs.push('Balanced premium format for field-guide reading and illustration space.');
  if (option.format === 'LARGE_FORMAT_HARDCOVER_8_5X11') tradeoffs.push('Large format gives more room for reference art but creates a bigger, costlier book.');
  if (option.format === 'KINDLE_DIGITAL') tradeoffs.push('Digital profile is useful for reading flow, but final Kindle output is reflowable.');
  if (option.averageFillPercent > 82) tradeoffs.push('Text density is high; proof review matters.');
  if (option.averageFillPercent < 42) tradeoffs.push('Text density is low; consider feature or reference art to make pages feel intentional.');
  if (option.tight > 0) tradeoffs.push(`${option.tight} tight page(s) need visual review.`);
  if (option.overflow > 0) tradeoffs.push(`${option.overflow} overflow page(s) need layout changes before approval.`);
  return tradeoffs;
}

function chapterTitleFrom(pageManifests: PageManifest[], chapterNumber: number): string {
  const first = pageManifests.find((page) => page.chapterNumber === chapterNumber);
  return first?.entryTitle ? `Chapter ${chapterNumber}: ${first.entryTitle}` : `Chapter ${chapterNumber}`;
}

export function buildFormatCalibrationReport(
  pageManifests: PageManifest[],
  config: ProjectConfig,
  chapterNumber: number,
): FormatCalibrationReport {
  const chapterPages = pageManifests.filter((page) => page.chapterNumber === chapterNumber);
  if (chapterPages.length === 0) throw new Error(`Chapter ${chapterNumber} has no page entries to calibrate.`);
  const options = (Object.keys(PUBLISHING_STANDARD_PRESETS) as Array<Exclude<PublishingFormat, 'CUSTOM'>>).map((format) => {
    const preset = PUBLISHING_STANDARD_PRESETS[format];
    const candidateConfig = applyPreset(config, format);
    const textFit = buildTextFitPreview(chapterPages, candidateConfig);
    const base = {
      format,
      label: preset.label,
      typographyPackage: preset.typographyPackage,
      trim: `${preset.trimSize.widthIn} x ${preset.trimSize.heightIn}`,
      bodyPt: preset.typography.bodyPt,
      lineHeight: preset.typography.lineHeight,
      entries: chapterPages.length,
      estimatedProofPages: estimatedProofPages(textFit.pages),
      fits: textFit.totals.fits,
      tight: textFit.totals.tight,
      overflow: textFit.totals.overflow,
      underfilled: textFit.totals.underfilled,
      averageFillPercent: averageFillPercent(textFit.pages),
    };
    const score = scoreOption(base);
    const withVerdict = { ...base, score, verdict: verdictFor(score, base.overflow, base.tight) };
    return {
      ...withVerdict,
      operatorSummary: summarizeOption(withVerdict),
      tradeoffs: tradeoffsFor(withVerdict),
    };
  });

  const ranked = [...options].sort((a, b) => b.score - a.score || a.estimatedProofPages - b.estimatedProofPages);
  const recommended = ranked[0];
  if (!recommended) throw new Error('No publishing standards are available for calibration.');

  return {
    chapterNumber,
    chapterTitle: chapterTitleFrom(pageManifests, chapterNumber),
    currentFormat: config.publishingStandard?.format ?? 'HARDCOVER_7X10',
    recommendedFormat: recommended.format,
    recommendedLabel: recommended.label,
    nextAction: `Review ${recommended.label} first. If it matches the book vision, keep that standard and render a chapter proof.`,
    options: ranked,
  };
}

export async function calibrateProjectChapterFormats(projectId: string, chapterNumber: number): Promise<FormatCalibrationReport | undefined> {
  const project = await getProject(projectId);
  if (!project) return undefined;
  const pageManifests = (await listManifests(projectId, 'PAGE'))
    .map((row) => PageManifestSchema.parse(row.content))
    .sort((a, b) => a.pageNumber - b.pageNumber);
  return buildFormatCalibrationReport(pageManifests, ProjectConfigSchema.parse(project.config), chapterNumber);
}
