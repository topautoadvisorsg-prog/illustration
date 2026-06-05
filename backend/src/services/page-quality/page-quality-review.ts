import { createHash } from 'node:crypto';
import {
  PageManifestSchema,
  LayoutTemplateIdSchema,
  ProjectConfigSchema,
  type LayoutTemplateId,
  type PageManifest,
  type PageQualityResolution,
  type ProjectConfig,
} from '@wildlands/shared';
import { listManifests } from '../../db/repositories/manifests.repo.js';
import { listPages } from '../../db/repositories/manifests.repo.js';
import { getProject } from '../../db/repositories/projects.repo.js';
import { buildTextFitPreview, type PageFitPreview } from '../../pipeline/stage-6-layout/text-fit-preview.js';
import { getLayoutProfile } from '../../pipeline/stage-6-layout/layout-profiles.js';
import { decomposeTemplate } from '../../pipeline/stage-2-planner/layered-layout.js';

export type PageQualitySeverity = 'BLOCKER' | 'WARNING' | 'INFO';
export type PageQualityScope = 'BOOK' | 'CHAPTER' | 'PAGE';
export type PageQualityCategory =
  | 'CONTINUATION'
  | 'WHITESPACE'
  | 'RHYTHM'
  | 'ILLUSTRATION_BALANCE'
  | 'LAYOUT_DIVERSITY'
  | 'PUBLISHING_STYLE';

export interface PublishingStyleProfile {
  id: 'WILDLANDS_NATURAL_HISTORY';
  label: string;
  editorialIdentity: string;
  whitespaceTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
  educationalDensity: 'MEDIUM' | 'HIGH';
  visualDensity: 'MEDIUM';
  featurePageTargetPercent: { min: number; max: number };
  mixedPageTargetPercent: { min: number; max: number };
  textFirstTargetPercent: { min: number; max: number };
  /** Plain-English goal for how much visual presence a page should carry. */
  visualPresenceGoal: string;
  /** The three illustration layers the publishing direction thinks in. */
  illustrationLayers: Array<{ layer: string; purpose: string; examples: string[] }>;
  principles: string[];
}

export interface PageQualityRecommendation {
  primaryAction: string;
  alternatives: string[];
  expectedResult: string;
}

export interface PageQualityFinding {
  findingId: string;
  severity: PageQualitySeverity;
  scope: PageQualityScope;
  category: PageQualityCategory;
  pageKey?: string;
  chapterNumber?: number;
  layoutTemplate?: LayoutTemplateId | string;
  problem: string;
  whyItMatters: string;
  recommendedFix: string;
  expectedResult: string;
  alternatives: string[];
  metrics: Record<string, number | string | boolean>;
  resolution?: PageQualityResolution;
}

export interface ChapterQualitySummary {
  chapterNumber: number;
  pages: number;
  featurePercent: number;
  mixedPercent: number;
  textFirstPercent: number;
  dominantLayout?: string;
  dominantLayoutPercent: number;
  findings: number;
}

export interface PageQualityReview {
  status: 'READY' | 'NEEDS_REVIEW' | 'BLOCKED';
  nextAction: string;
  publishingStyle: PublishingStyleProfile;
  totals: {
    pages: number;
    findings: number;
    blockers: number;
    warnings: number;
    infos: number;
    awkwardContinuations: number;
    underfilledPages: number;
    rhythmFindings: number;
  };
  distribution: {
    featurePercent: number;
    mixedPercent: number;
    textFirstPercent: number;
    layoutCounts: Array<{ layoutTemplate: string; count: number }>;
  };
  chapters: ChapterQualitySummary[];
  findings: PageQualityFinding[];
}

export const WILDLANDS_PUBLISHING_STYLE: PublishingStyleProfile = {
  id: 'WILDLANDS_NATURAL_HISTORY',
  label: 'Premium Natural History Field Guide',
  editorialIdentity: 'Premium natural history encyclopedia, wilderness field guide, expedition journal, and cinematic naturalist presentation.',
  whitespaceTolerance: 'MEDIUM',
  educationalDensity: 'HIGH',
  visualDensity: 'MEDIUM',
  featurePageTargetPercent: { min: 5, max: 10 },
  mixedPageTargetPercent: { min: 20, max: 30 },
  textFirstTargetPercent: { min: 60, max: 70 },
  visualPresenceGoal:
    'Almost every page carries some visual element so no page feels visually abandoned. Some pages are art-heavy, some text-heavy — all feel intentionally designed. This is a premium illustrated wilderness publication, not an art book and not a textbook.',
  illustrationLayers: [
    {
      layer: 'Feature Art',
      purpose: 'Visually impressive landmark pages that reset the reader.',
      examples: ['chapter openers', 'full-page plates', 'major landscapes', 'signature wildlife', 'feature banners'],
    },
    {
      layer: 'Supporting Illustration',
      purpose: 'Support learning and visual rhythm without dominating the page.',
      examples: ['50/50 layouts', '25% layouts', 'side/corner art', 'comparison studies', 'reference layouts'],
    },
    {
      layer: 'Visual Identity',
      purpose: 'Maintain visual quality on text-led pages without requiring major artwork (often a shared, repeating accent).',
      examples: ['botanical accents', 'naturalist sketches', 'page framing', 'pine branches', 'specimen studies', 'map fragments'],
    },
  ],
  principles: [
    'Every page should contribute visually — never let a page feel visually abandoned, even when it is text-heavy.',
    'Think in three layers: Feature Art, Supporting Illustration, and Visual Identity accents (corner/edge/botanical ornaments that need no major artwork).',
    'Alternating illustration and text pages/spreads is a strong default rhythm — use it, but never let it become mechanical.',
    'Aim for controlled variety, not uniformity: mix feature, comparison, reference, illustration-dominant, and text-dominant layouts as the content earns them.',
    'Color interiors should read like color pages — make meaningful use of visual design without forcing large illustrations everywhere.',
    'Protect readability before image spend.',
    'Let important terrain, habitat, safety, and identification moments earn stronger visual treatment.',
    'Avoid orphaned continuation pages that feel like leftovers.',
    'Use empty space when it feels editorial, not when it feels accidental.',
    'These are guidance, not formulas: apply professional judgment per chapter, never blind rules like "one image every X pages".',
  ],
};

const FEATURE_LAYOUTS = new Set<LayoutTemplateId>([
  'LAYOUT_5_CHAPTER_OPENER',
  'LAYOUT_10_FULL_PAGE_PLATE',
  'LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD',
  'LAYOUT_13_FEATURE_BANNER',
]);

const TEXT_FIRST_LAYOUTS = new Set<LayoutTemplateId>([
  'LAYOUT_2_TEXT_HEAVY',
  'LAYOUT_6_BACK_MATTER',
  'LAYOUT_8_MARGIN_ILLUSTRATION',
]);

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function stableFindingId(finding: Omit<PageQualityFinding, 'findingId'>): string {
  const raw = [
    finding.scope,
    finding.category,
    finding.pageKey ?? '',
    finding.chapterNumber ?? '',
    finding.layoutTemplate ?? '',
    finding.problem,
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function attachFindingIds(findings: Array<Omit<PageQualityFinding, 'findingId'> | PageQualityFinding>): PageQualityFinding[] {
  return findings.map((finding) => {
    if ('findingId' in finding && finding.findingId) return finding;
    return { ...finding, findingId: stableFindingId(finding) };
  });
}

function layoutBand(layoutTemplate: string): 'FEATURE' | 'MIXED' | 'TEXT_FIRST' {
  const template = layoutTemplate as LayoutTemplateId;
  if (FEATURE_LAYOUTS.has(template)) return 'FEATURE';
  if (TEXT_FIRST_LAYOUTS.has(template)) return 'TEXT_FIRST';
  return 'MIXED';
}

function countLayouts(pages: PageFitPreview[]): Array<{ layoutTemplate: string; count: number }> {
  const counts = new Map<string, number>();
  for (const page of pages) counts.set(page.layoutTemplate, (counts.get(page.layoutTemplate) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([layoutTemplate, count]) => ({ layoutTemplate, count }))
    .sort((a, b) => b.count - a.count || a.layoutTemplate.localeCompare(b.layoutTemplate));
}

function distributionFor(pages: PageFitPreview[]): { featurePercent: number; mixedPercent: number; textFirstPercent: number } {
  if (pages.length === 0) return { featurePercent: 0, mixedPercent: 0, textFirstPercent: 0 };
  const counts = { FEATURE: 0, MIXED: 0, TEXT_FIRST: 0 };
  for (const page of pages) counts[layoutBand(page.layoutTemplate)] += 1;
  return {
    featurePercent: roundPercent((counts.FEATURE / pages.length) * 100),
    mixedPercent: roundPercent((counts.MIXED / pages.length) * 100),
    textFirstPercent: roundPercent((counts.TEXT_FIRST / pages.length) * 100),
  };
}

function continuationTailRatio(page: PageFitPreview): number {
  if (page.allocation.estimatedRenderedPages <= 1) return 0;
  const openingCapacity = page.fit.capacityChars;
  const continuationCapacity = Math.max(1, page.allocation.wordsPerContinuationPage * 6);
  const remaining = Math.max(0, page.fit.charCount - openingCapacity);
  const continuationPages = Math.max(1, page.allocation.estimatedRenderedPages - 1);
  const lastPageChars = remaining - (continuationPages - 1) * continuationCapacity;
  return Math.max(0, Math.min(1, lastPageChars / continuationCapacity));
}

function alternativeForMoreTextCapacity(layoutTemplate: string): string {
  const profile = getLayoutProfile(layoutTemplate as LayoutTemplateId);
  if (profile.artAreaFraction >= 0.4) return 'Switch to Text Heavy or Margin Art to give the text more first-page capacity.';
  return 'Reduce the art slot slightly or tighten typography within approved readability limits.';
}

function underfilledFix(page: PageFitPreview): PageQualityRecommendation {
  const composition = decomposeTemplate(page.layoutTemplate as LayoutTemplateId);
  if (composition.contentType === 'WARNING_PAGE') {
    return {
      primaryAction: 'Convert this into a stronger safety/reference feature instead of leaving a sparse warning page.',
      alternatives: ['Use Illustration Dominant if the warning subject is visual.', 'Merge with the adjacent warning/reference page if the content is only a short note.'],
      expectedResult: 'The page feels intentional: either a clear safety plate or a compact reference unit, not accidental empty space.',
    };
  }
  return {
    primaryAction: 'Switch to an illustration-dominant or feature layout with larger supporting art.',
    alternatives: ['Add a comparison/reference study if the manuscript supports it.', 'Merge with a nearby short entry if it belongs in the same reading flow.'],
      expectedResult: 'Whitespace becomes intentional editorial breathing room around a stronger visual moment.',
  };
}

function pushPageFindings(findings: Array<Omit<PageQualityFinding, 'findingId'>>, page: PageFitPreview): void {
  const tailRatio = continuationTailRatio(page);
  if (page.allocation.estimatedRenderedPages > 1 && tailRatio > 0 && tailRatio < 0.28) {
    findings.push({
      severity: 'WARNING',
      scope: 'PAGE',
      category: 'CONTINUATION',
      pageKey: page.pageKey,
      chapterNumber: Number(page.pageKey.slice(2, 4)),
      layoutTemplate: page.layoutTemplate,
      problem: 'Awkward continuation risk.',
      whyItMatters: 'A tiny continuation page can feel like leftover text rather than an intentionally designed page.',
      recommendedFix: alternativeForMoreTextCapacity(page.layoutTemplate),
      expectedResult: 'The short tail is pulled back into the opening page or becomes a fuller continuation with a clearer purpose.',
      alternatives: [
        'Split the entry into two purposeful pages if the continuation contains a distinct section.',
        'Move a subsection into a nearby reference page if it belongs with adjacent material.',
      ],
      metrics: {
        estimatedRenderedPages: page.allocation.estimatedRenderedPages,
        continuationTailPercent: roundPercent(tailRatio * 100),
        fillRatio: page.fit.fillRatio,
      },
    });
  }

  if (page.allocation.estimatedRenderedPages >= 4) {
    findings.push({
      severity: 'WARNING',
      scope: 'PAGE',
      category: 'CONTINUATION',
      pageKey: page.pageKey,
      chapterNumber: Number(page.pageKey.slice(2, 4)),
      layoutTemplate: page.layoutTemplate,
      problem: 'Long entry is acting like a mini-section.',
      whyItMatters: 'A long run of continuation pages can flatten the book rhythm and hide natural editorial breaks.',
      recommendedFix: 'Split this entry into multiple planned pages with distinct layout purposes.',
      expectedResult: 'The content becomes easier to review and each page can earn its own composition.',
      alternatives: [
        'Create a feature opener followed by text-first continuation pages.',
        'Move checklists/protocols into a reference layout.',
      ],
      metrics: {
        estimatedRenderedPages: page.allocation.estimatedRenderedPages,
        fillRatio: page.fit.fillRatio,
      },
    });
  }

  if (page.fit.status === 'UNDERFILLED' || page.fit.fillRatio < 0.25) {
    const rec = underfilledFix(page);
    findings.push({
      severity: 'INFO',
      scope: 'PAGE',
      category: 'WHITESPACE',
      pageKey: page.pageKey,
      chapterNumber: Number(page.pageKey.slice(2, 4)),
      layoutTemplate: page.layoutTemplate,
      problem: 'Underfilled page.',
      whyItMatters: 'In this publishing style, sparse pages should feel like intentional plates, guides, or reference moments.',
      recommendedFix: rec.primaryAction,
      expectedResult: rec.expectedResult,
      alternatives: rec.alternatives,
      metrics: {
        fillRatio: page.fit.fillRatio,
        estimatedRenderedPages: page.allocation.estimatedRenderedPages,
      },
    });
  }
}

function pushChapterFindings(
  findings: Array<Omit<PageQualityFinding, 'findingId'>>,
  chapterPages: PageFitPreview[],
  chapterNumber: number,
): ChapterQualitySummary {
  const dist = distributionFor(chapterPages);
  const layoutCounts = countLayouts(chapterPages);
  const dominant = layoutCounts[0];
  const dominantLayoutPercent = dominant ? roundPercent((dominant.count / chapterPages.length) * 100) : 0;
  const before = findings.length;

  if (dominant && chapterPages.length >= 4 && dominantLayoutPercent >= 45) {
    findings.push({
      severity: 'INFO',
      scope: 'CHAPTER',
      category: 'LAYOUT_DIVERSITY',
      chapterNumber,
      layoutTemplate: dominant.layoutTemplate,
      problem: 'Layout repetition detected.',
      whyItMatters: 'Repeated page shapes can make the chapter feel mechanically generated even when every page technically fits.',
      recommendedFix: 'Replace some repeated layouts with feature, reference, or text-first alternatives based on subject importance.',
      expectedResult: 'The chapter gains a more deliberate visual rhythm while preserving the manuscript order.',
      alternatives: [
        'Promote one high-value subject to a feature layout.',
        'Route dense safety/reference pages to text-first layouts.',
        'Use mixed layouts only when the subject benefits from visual comparison.',
      ],
      metrics: {
        dominantLayoutPercent,
        dominantLayoutCount: dominant.count,
        chapterPages: chapterPages.length,
      },
    });
  }

  if (chapterPages.length >= 8 && dist.featurePercent < WILDLANDS_PUBLISHING_STYLE.featurePageTargetPercent.min) {
    findings.push({
      severity: 'INFO',
      scope: 'CHAPTER',
      category: 'ILLUSTRATION_BALANCE',
      chapterNumber,
      problem: 'Low feature-page rhythm.',
      whyItMatters: 'A premium natural history chapter benefits from occasional visual landmarks that reset the reader.',
      recommendedFix: 'Promote one chapter-defining subject to a chapter opener, full plate, or landscape spread.',
      expectedResult: 'The chapter gets a stronger visual landmark without turning every page into an illustration page.',
      alternatives: [
        'Use a feature banner for major terrain or habitat context.',
        'Use a full plate for a showcase species or essential recognition subject.',
      ],
      metrics: {
        featurePercent: dist.featurePercent,
        targetMin: WILDLANDS_PUBLISHING_STYLE.featurePageTargetPercent.min,
      },
    });
  }

  return {
    chapterNumber,
    pages: chapterPages.length,
    featurePercent: dist.featurePercent,
    mixedPercent: dist.mixedPercent,
    textFirstPercent: dist.textFirstPercent,
    dominantLayout: dominant?.layoutTemplate,
    dominantLayoutPercent,
    findings: findings.length - before,
  };
}

function pushBookFindings(
  findings: Array<Omit<PageQualityFinding, 'findingId'>>,
  pages: PageFitPreview[],
  distribution: PageQualityReview['distribution'],
): void {
  const style = WILDLANDS_PUBLISHING_STYLE;
  if (distribution.featurePercent < style.featurePageTargetPercent.min) {
    findings.push({
      severity: 'INFO',
      scope: 'BOOK',
      category: 'PUBLISHING_STYLE',
      problem: 'Book has fewer feature pages than the Wildlands publishing style target.',
      whyItMatters: 'The book may read as text-processing output instead of a premium natural history object.',
      recommendedFix: 'Promote a small number of chapter-defining subjects to full plate, chapter opener, or landscape spread treatments.',
      expectedResult: 'The book gains visual landmarks while keeping the manuscript educational and text-led.',
      alternatives: ['Use feature banners for terrain chapters.', 'Use full plates sparingly for high-value recognition subjects.'],
      metrics: {
        featurePercent: distribution.featurePercent,
        targetMin: style.featurePageTargetPercent.min,
        pages: pages.length,
      },
    });
  }
  if (distribution.mixedPercent > style.mixedPageTargetPercent.max + 20) {
    findings.push({
      severity: 'INFO',
      scope: 'BOOK',
      category: 'PUBLISHING_STYLE',
      problem: 'Mixed/illustrated layouts dominate the book plan.',
      whyItMatters: 'Too many mixed pages can flatten the visual rhythm and reduce the contrast between ordinary pages and special pages.',
      recommendedFix: 'Move dense entries toward text-first layouts and reserve mixed layouts for subjects that need visual comparison or identification support.',
      expectedResult: 'Illustrations feel purposeful instead of evenly sprayed across the book.',
      alternatives: ['Use Text Heavy for long prose entries.', 'Use Reference layouts for protocols, lists, and back-matter-like material.'],
      metrics: {
        mixedPercent: distribution.mixedPercent,
        targetMax: style.mixedPageTargetPercent.max,
      },
    });
  }
}

function nextActionFor(findings: PageQualityFinding[]): string {
  if (findings.some((finding) => finding.severity === 'BLOCKER')) {
    return 'Fix blocked page-quality findings before approving layouts.';
  }
  if (findings.some((finding) => finding.scope === 'PAGE' && finding.category === 'CONTINUATION')) {
    return 'Review awkward continuation recommendations before approving layouts.';
  }
  if (findings.length > 0) {
    return 'Review the publishing director recommendations, then approve layouts or adjust the page plan.';
  }
  return 'Page quality review found no major rhythm issues. Approve chapter layouts when the proof looks right.';
}

export function buildPageQualityReview(
  pageManifests: PageManifest[],
  config: ProjectConfig,
  layoutOverrides: Record<string, LayoutTemplateId> = {},
): PageQualityReview {
  const textFit = buildTextFitPreview(pageManifests, config, layoutOverrides);
  const rawFindings: Array<Omit<PageQualityFinding, 'findingId'>> = [];

  for (const page of textFit.pages) pushPageFindings(rawFindings, page);

  const chapters = Array.from(new Set(pageManifests.map((page) => page.chapterNumber))).sort((a, b) => a - b);
  const chapterSummaries = chapters.map((chapterNumber) =>
    pushChapterFindings(
      rawFindings,
      textFit.pages.filter((page) => Number(page.pageKey.slice(2, 4)) === chapterNumber),
      chapterNumber,
    ),
  );

  const distribution = { ...distributionFor(textFit.pages), layoutCounts: countLayouts(textFit.pages) };
  pushBookFindings(rawFindings, textFit.pages, distribution);
  const findings = attachFindingIds(rawFindings);

  const blockers = findings.filter((finding) => finding.severity === 'BLOCKER').length;
  const warnings = findings.filter((finding) => finding.severity === 'WARNING').length;
  const infos = findings.filter((finding) => finding.severity === 'INFO').length;

  return {
    status: blockers > 0 ? 'BLOCKED' : findings.length > 0 ? 'NEEDS_REVIEW' : 'READY',
    nextAction: nextActionFor(findings),
    publishingStyle: WILDLANDS_PUBLISHING_STYLE,
    totals: {
      pages: textFit.pages.length,
      findings: findings.length,
      blockers,
      warnings,
      infos,
      awkwardContinuations: findings.filter((finding) => finding.category === 'CONTINUATION').length,
      underfilledPages: findings.filter((finding) => finding.category === 'WHITESPACE').length,
      rhythmFindings: findings.filter((finding) => finding.category === 'RHYTHM' || finding.category === 'LAYOUT_DIVERSITY').length,
    },
    distribution,
    chapters: chapterSummaries,
    findings,
  };
}

export async function reviewProjectPageQuality(projectId: string): Promise<PageQualityReview | undefined> {
  const project = await getProject(projectId);
  if (!project) return undefined;
  const rows = await listManifests(projectId, 'PAGE');
  const pages = rows
    .map((row) => PageManifestSchema.parse(row.content))
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const pageRows = await listPages(projectId);
  const layoutOverrides = Object.fromEntries(
    pageRows.flatMap((row) => {
      const parsed = LayoutTemplateIdSchema.safeParse(row.layoutTemplate);
      return parsed.success ? [[row.pageKey, parsed.data]] : [];
    }),
  );
  return buildPageQualityReview(pages, ProjectConfigSchema.parse(project.config), layoutOverrides);
}
