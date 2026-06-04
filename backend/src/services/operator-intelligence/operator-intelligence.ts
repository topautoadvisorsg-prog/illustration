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
import { listExports, type ExportRow } from '../../db/repositories/exports.repo.js';

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

export type ProductionDashboardStatus =
  | 'NOT_STARTED'
  | 'PLANNING'
  | 'LAYOUT_REVIEW'
  | 'PROOFING'
  | 'IMAGE_PRODUCTION'
  | 'READY_FOR_EXPORT'
  | 'EXPORTED';

export interface ProductionDashboardChapter {
  chapterNumber: number;
  chapterTitle: string;
  status: OperatorIntelligenceStatus;
  nextAction: string;
  pages: number;
  pagesPlanned: number;
  layoutApproved: boolean;
  textFitSummary?: ProjectConfig['layoutApprovals'][string]['textFitSummary'];
  pagesWithImages: number;
  pagesWithApprovedImages: number;
  pagesPrintReady: number;
  missingImages: number;
  unapprovedImages: number;
  blockerCount: number;
  warningCount: number;
}

export interface ProductionDashboardItem {
  label: string;
  count: number;
  action: string;
}

export interface ProductionDashboardExport {
  kind: string;
  status: string;
  filePath: string | null;
  createdAt: string;
}

export interface ProjectProductionDashboard {
  status: ProductionDashboardStatus;
  nextAction: string;
  totals: {
    chapters: number;
    pages: number;
    pagesPlanned: number;
    layoutApprovedChapters: number;
    pagesWithImages: number;
    pagesWithApprovedImages: number;
    pagesPrintReady: number;
    missingImages: number;
    unapprovedImages: number;
    exportsReady: number;
  };
  chapters: ProductionDashboardChapter[];
  waitingOnOperator: ProductionDashboardItem[];
  waitingOnSystem: ProductionDashboardItem[];
  blockers: OperatorFinding[];
  recentExports: ProductionDashboardExport[];
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

function dashboardStatus(input: {
  projectStatus: string;
  chapters: number;
  pages: number;
  pagesPlanned: number;
  layoutApprovedChapters: number;
  pagesWithImages: number;
  pagesWithApprovedImages: number;
  missingImages: number;
  unapprovedImages: number;
}): ProductionDashboardStatus {
  if (input.projectStatus === 'EXPORTED') return 'EXPORTED';
  if (input.chapters === 0 || input.pages === 0) return 'NOT_STARTED';
  if (input.pagesPlanned < input.pages) return 'PLANNING';
  if (input.layoutApprovedChapters < input.chapters) return 'LAYOUT_REVIEW';
  if (input.pagesWithImages === 0) return 'PROOFING';
  if (input.missingImages > 0 || input.unapprovedImages > 0) return 'IMAGE_PRODUCTION';
  if (input.pagesWithApprovedImages >= input.pages) return 'READY_FOR_EXPORT';
  return 'IMAGE_PRODUCTION';
}

function dashboardNextAction(status: ProductionDashboardStatus): string {
  if (status === 'NOT_STARTED') return 'Upload the manuscript and generate the chapter/page breakdown.';
  if (status === 'PLANNING') return 'Run Page Plan until every page has a locked layout and prompt.';
  if (status === 'LAYOUT_REVIEW') return 'Run Text-Fit and approve layouts chapter by chapter before image spend.';
  if (status === 'PROOFING') return 'Render approved chapters with placeholder art and inspect page-shaped proofs.';
  if (status === 'IMAGE_PRODUCTION') return 'Generate, reuse, approve, reject, or upscale images for the flagged pages.';
  if (status === 'READY_FOR_EXPORT') return 'Run final proof checks and export the production PDF.';
  return 'Book is exported. Review exports and proof records before starting another edition.';
}

export function evaluateProjectProductionDashboard(input: {
  projectStatus: string;
  chapters: ChapterManifest[];
  pageManifests: PageManifest[];
  pageRows: PageRow[];
  imageRows: ProjectImageLibraryRow[];
  layoutApprovals: ProjectConfig['layoutApprovals'];
  exports: ExportRow[];
}): ProjectProductionDashboard {
  const chapterRows = input.chapters
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((chapter) => {
      const layoutApproval = input.layoutApprovals?.[String(chapter.chapterNumber)];
      const intelligence = evaluateChapterIntelligence({
        chapter,
        pageManifests: input.pageManifests,
        pageRows: input.pageRows,
        imageRows: input.imageRows.filter((row) => row.page.chapterNumber === chapter.chapterNumber),
        layoutApproval,
        textFitPersisted: Boolean(layoutApproval?.textFitSummary),
      });
      return {
        status: intelligence.status,
        nextAction: intelligence.nextAction,
        ...intelligence.summary,
        textFitSummary: layoutApproval?.textFitSummary,
        blockerCount: intelligence.findings.filter((finding) => finding.severity === 'BLOCKER').length,
        warningCount: intelligence.findings.filter((finding) => finding.severity === 'WARNING').length,
      };
    });

  const totals = chapterRows.reduce(
    (sum, chapter) => {
      sum.chapters += 1;
      sum.pages += chapter.pages;
      sum.pagesPlanned += chapter.pagesPlanned;
      if (chapter.layoutApproved) sum.layoutApprovedChapters += 1;
      sum.pagesWithImages += chapter.pagesWithImages;
      sum.pagesWithApprovedImages += chapter.pagesWithApprovedImages;
      sum.pagesPrintReady += chapter.pagesPrintReady;
      sum.missingImages += chapter.missingImages;
      sum.unapprovedImages += chapter.unapprovedImages;
      return sum;
    },
    {
      chapters: 0,
      pages: 0,
      pagesPlanned: 0,
      layoutApprovedChapters: 0,
      pagesWithImages: 0,
      pagesWithApprovedImages: 0,
      pagesPrintReady: 0,
      missingImages: 0,
      unapprovedImages: 0,
      exportsReady: input.exports.filter((row) => row.status === 'READY').length,
    },
  );

  const waitingOnOperator: ProductionDashboardItem[] = [
    {
      label: 'Layout approvals',
      count: Math.max(0, totals.chapters - totals.layoutApprovedChapters),
      action: 'Run Text-Fit and approve each chapter layout.',
    },
    {
      label: 'Missing images',
      count: totals.missingImages,
      action: 'Generate or reuse art only after text/layout proofing passes.',
    },
    {
      label: 'Unapproved active images',
      count: totals.unapprovedImages,
      action: 'Approve, reject, or regenerate image versions.',
    },
  ].filter((item) => item.count > 0);

  const waitingOnSystem: ProductionDashboardItem[] = [
    {
      label: 'Unplanned pages',
      count: Math.max(0, totals.pages - totals.pagesPlanned),
      action: 'Run Page Plan to lock layout/prompt data.',
    },
    {
      label: 'Upscale / print-ready pages',
      count: Math.max(0, totals.pagesWithApprovedImages - totals.pagesPrintReady),
      action: 'Upscale approved images before final export when required.',
    },
  ].filter((item) => item.count > 0);

  const blockers = chapterRows
    .flatMap((chapter) => {
      if (chapter.blockerCount === 0 && chapter.warningCount === 0) return [];
      return [
        {
          severity: chapter.blockerCount > 0 ? 'BLOCKER' as const : 'WARNING' as const,
          category: chapter.blockerCount > 0 ? 'WORKFLOW' as const : 'IMAGE' as const,
          scope: 'CHAPTER' as const,
          message: `Chapter ${chapter.chapterNumber}: ${chapter.blockerCount} blocker(s), ${chapter.warningCount} warning(s).`,
          recommendedAction: chapter.nextAction,
        },
      ];
    })
    .slice(0, 12);

  const status = dashboardStatus({ projectStatus: input.projectStatus, ...totals });
  return {
    status,
    nextAction: dashboardNextAction(status),
    totals,
    chapters: chapterRows,
    waitingOnOperator,
    waitingOnSystem,
    blockers,
    recentExports: input.exports
      .slice(-5)
      .reverse()
      .map((row) => ({
        kind: row.kind,
        status: row.status,
        filePath: row.filePath,
        createdAt: row.createdAt.toISOString(),
      })),
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

export async function getProjectProductionDashboard(projectId: string): Promise<ProjectProductionDashboard | undefined> {
  const project = await getProject(projectId);
  if (!project) return undefined;

  const [chapterManifestRows, pageManifestRows, pageRows, imageRows, exportRows] = await Promise.all([
    listManifests(projectId, 'CHAPTER'),
    listManifests(projectId, 'PAGE'),
    listPages(projectId),
    listImagesForProject(projectId),
    listExports(projectId),
  ]);
  const config = ProjectConfigSchema.parse(project.config);
  const chapters = chapterManifestRows.flatMap((manifest) => {
    const parsed = ChapterManifestSchema.safeParse(manifest.content);
    return parsed.success ? [parsed.data] : [];
  });

  return evaluateProjectProductionDashboard({
    projectStatus: project.status,
    chapters,
    pageManifests: parsePageManifests(pageManifestRows),
    pageRows,
    imageRows,
    layoutApprovals: config.layoutApprovals ?? {},
    exports: exportRows,
  });
}
