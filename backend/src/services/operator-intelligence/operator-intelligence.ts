import {
  ChapterManifestSchema,
  PageManifestSchema,
  ProjectConfigSchema,
  type ChapterManifest,
  type PageManifest,
  type ProjectConfig,
} from '@wildlands/shared';
import { listImagesForProject, type ProjectImageLibraryRow } from '../../db/repositories/images.repo.js';
import { listManifests, listPages, type ManifestRow, type PageRow } from '../../db/repositories/manifests.repo.js';
import { getProject } from '../../db/repositories/projects.repo.js';

export type OperatorIntelligenceStatus = 'READY' | 'NEEDS_REVIEW' | 'BLOCKED';
export type OperatorFindingSeverity = 'BLOCKER' | 'WARNING' | 'INFO';
export type OperatorFindingCategory = 'TEXT_FIT' | 'IMAGE' | 'LAYOUT' | 'PROOF' | 'WORKFLOW';

export interface OperatorFinding {
  severity: OperatorFindingSeverity;
  category: OperatorFindingCategory;
  scope: 'CHAPTER' | 'PAGE';
  pageKey?: string;
  message: string;
  recommendedAction: string;
}

export interface OperatorChapterSummary {
  chapterNumber: number;
  chapterTitle: string;
  pages: number;
  layoutApproved: boolean;
  pagesPlanned: number;
  pagesWithImages: number;
  pagesWithApprovedImages: number;
  pagesPrintReady: number;
  missingImages: number;
  unapprovedImages: number;
  placeholderPages: number;
}

export interface OperatorChapterIntelligence {
  status: OperatorIntelligenceStatus;
  nextAction: string;
  summary: OperatorChapterSummary;
  findings: OperatorFinding[];
}

interface EvaluateChapterIntelligenceInput {
  chapter: ChapterManifest;
  pageManifests: PageManifest[];
  pageRows: PageRow[];
  imageRows: ProjectImageLibraryRow[];
  layoutApproval?: ProjectConfig['layoutApprovals'][string];
  textFitPersisted?: boolean;
}

function activeImagesByPageId(rows: ProjectImageLibraryRow[]): Map<string, ProjectImageLibraryRow> {
  const map = new Map<string, ProjectImageLibraryRow>();
  for (const row of rows) {
    if (row.image.active && !map.has(row.page.id)) {
      map.set(row.page.id, row);
    }
  }
  return map;
}

function chapterNextAction(findings: OperatorFinding[]): string {
  if (findings.some((finding) => finding.category === 'WORKFLOW' && finding.severity === 'BLOCKER')) {
    return 'Generate the manuscript breakdown and page plan before rendering proofs.';
  }
  if (findings.some((finding) => finding.category === 'LAYOUT' && finding.severity === 'BLOCKER')) {
    return 'Run Text-Fit, inspect the Page Plan, then approve the chapter layout before image spend.';
  }
  if (findings.some((finding) => finding.category === 'LAYOUT' && finding.scope === 'PAGE')) {
    return 'Complete the flagged page plans so every page has a stable layout and prompt.';
  }
  if (findings.some((finding) => finding.category === 'IMAGE' && finding.severity === 'WARNING')) {
    return 'Render the chapter with placeholders for layout proofing, then generate, reuse, or approve art for the flagged pages.';
  }
  if (findings.some((finding) => finding.category === 'TEXT_FIT')) {
    return 'Render the selected chapter and click individual pages to verify text flow before moving deeper into image production.';
  }
  return 'Render the selected chapter and review focused page proofs.';
}

export function evaluateChapterIntelligence(input: EvaluateChapterIntelligenceInput): OperatorChapterIntelligence {
  const chapterPageKeys = new Set(input.chapter.pageKeys);
  const pageManifests = input.pageManifests
    .filter((page) => chapterPageKeys.has(page.pageId))
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const pageRowsByKey = new Map(input.pageRows.map((page) => [page.pageKey, page]));
  const activeImages = activeImagesByPageId(input.imageRows);
  const hasTextFitProof = Boolean(input.layoutApproval?.textFitSummary || input.textFitPersisted);
  const findings: OperatorFinding[] = [];

  if (pageManifests.length === 0) {
    findings.push({
      severity: 'BLOCKER',
      category: 'WORKFLOW',
      scope: 'CHAPTER',
      message: `Chapter ${input.chapter.chapterNumber} has no page manifests.`,
      recommendedAction: 'Regenerate the deterministic manuscript breakdown before rendering.',
    });
  }

  if (!input.layoutApproval) {
    findings.push({
      severity: 'BLOCKER',
      category: 'LAYOUT',
      scope: 'CHAPTER',
      message: `Chapter ${input.chapter.chapterNumber} layout is not approved.`,
      recommendedAction: 'Run Text-Fit, review the page plan, and approve the chapter layout gate.',
    });
  }

  if (!hasTextFitProof) {
    findings.push({
      severity: input.layoutApproval ? 'INFO' : 'WARNING',
      category: 'TEXT_FIT',
      scope: 'CHAPTER',
      message: 'No saved text-fit proof is attached to this chapter yet.',
      recommendedAction: 'Run Text-Fit and approve the chapter layout so the fit summary is recorded.',
    });
  }

  let pagesPlanned = 0;
  let pagesWithImages = 0;
  let pagesWithApprovedImages = 0;
  let pagesPrintReady = 0;

  for (const manifest of pageManifests) {
    const pageRow = pageRowsByKey.get(manifest.pageId);
    if (!pageRow) {
      findings.push({
        severity: 'BLOCKER',
        category: 'WORKFLOW',
        scope: 'PAGE',
        pageKey: manifest.pageId,
        message: `${manifest.pageId} has a page manifest but no page row.`,
        recommendedAction: 'Regenerate or repair the manifest/page persistence before rendering.',
      });
      continue;
    }

    if (pageRow.layoutTemplate && pageRow.imagePrompt && pageRow.imagePromptSha256) {
      pagesPlanned += 1;
    } else {
      findings.push({
        severity: 'BLOCKER',
        category: 'LAYOUT',
        scope: 'PAGE',
        pageKey: manifest.pageId,
        message: `${manifest.pageId} is missing a locked layout template or image prompt.`,
        recommendedAction: 'Run Page Plan for the project so the page has stable composition instructions.',
      });
    }

    const image = activeImages.get(pageRow.id);
    if (!image) {
      findings.push({
        severity: input.layoutApproval ? 'WARNING' : 'INFO',
        category: 'IMAGE',
        scope: 'PAGE',
        pageKey: manifest.pageId,
        message: `${manifest.pageId} has no active image asset; placeholder art will render.`,
        recommendedAction: 'Use the placeholder for text/layout review, then generate or reuse an asset when ready.',
      });
      continue;
    }

    pagesWithImages += 1;
    if (image.image.status === 'APPROVED' || image.image.status === 'PRINT_READY') pagesWithApprovedImages += 1;
    if (image.image.status === 'PRINT_READY') pagesPrintReady += 1;
    if (image.image.status !== 'APPROVED' && image.image.status !== 'PRINT_READY') {
      findings.push({
        severity: 'WARNING',
        category: 'IMAGE',
        scope: 'PAGE',
        pageKey: manifest.pageId,
        message: `${manifest.pageId} active image is ${image.image.status}, not approved.`,
        recommendedAction: 'Approve, reject, regenerate, or reuse a better image before final chapter export.',
      });
    }
  }

  const summary: OperatorChapterSummary = {
    chapterNumber: input.chapter.chapterNumber,
    chapterTitle: input.chapter.chapterTitle,
    pages: pageManifests.length,
    layoutApproved: Boolean(input.layoutApproval),
    pagesPlanned,
    pagesWithImages,
    pagesWithApprovedImages,
    pagesPrintReady,
    missingImages: Math.max(0, pageManifests.length - pagesWithImages),
    unapprovedImages: Math.max(0, pagesWithImages - pagesWithApprovedImages),
    placeholderPages: Math.max(0, pageManifests.length - pagesWithImages),
  };

  const hasBlocker = findings.some((finding) => finding.severity === 'BLOCKER');
  const hasWarning = findings.some((finding) => finding.severity === 'WARNING');
  return {
    status: hasBlocker ? 'BLOCKED' : hasWarning ? 'NEEDS_REVIEW' : 'READY',
    nextAction: chapterNextAction(findings),
    summary,
    findings,
  };
}

function parseChapter(manifests: ManifestRow[], chapterNumber: number): ChapterManifest | undefined {
  for (const manifest of manifests) {
    const parsed = ChapterManifestSchema.safeParse(manifest.content);
    if (parsed.success && parsed.data.chapterNumber === chapterNumber) return parsed.data;
  }
  return undefined;
}

function parsePageManifests(manifests: ManifestRow[]): PageManifest[] {
  return manifests.flatMap((manifest) => {
    const parsed = PageManifestSchema.safeParse(manifest.content);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function getChapterOperatorIntelligence(
  projectId: string,
  chapterNumber: number,
): Promise<OperatorChapterIntelligence | undefined> {
  const project = await getProject(projectId);
  if (!project) return undefined;

  const [chapterManifestRows, pageManifestRows, pageRows, imageRows] = await Promise.all([
    listManifests(projectId, 'CHAPTER'),
    listManifests(projectId, 'PAGE'),
    listPages(projectId),
    listImagesForProject(projectId),
  ]);

  const chapter = parseChapter(chapterManifestRows, chapterNumber);
  if (!chapter) return undefined;

  const config = ProjectConfigSchema.parse(project.config);
  const layoutApproval = config.layoutApprovals?.[String(chapterNumber)];
  return evaluateChapterIntelligence({
    chapter,
    pageManifests: parsePageManifests(pageManifestRows),
    pageRows,
    imageRows: imageRows.filter((row) => row.page.chapterNumber === chapterNumber),
    layoutApproval,
    textFitPersisted: Boolean(layoutApproval?.textFitSummary),
  });
}
