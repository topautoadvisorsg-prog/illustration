/**
 * Stage 6/7 — chapter + book render orchestrators.
 *
 * renderChapterPdf: gathers a chapter's page manifests + their approved/upscaled
 * art (or clean placeholders), builds one chapter HTML doc, and renders it to PDF
 * via Paged.js (chapter-by-chapter keeps memory bounded).
 *
 * renderBookPdf: renders every chapter, stitches them in order, runs KDP preflight,
 * stores the interior PDF, and records the export.
 *
 * Both need Chromium (Stage 6 render) + the DB, so they run on the deployed host,
 * not in unit tests. The pure pieces (buildChapterHtml, stitchPdfs, preflightBook)
 * are tested separately.
 */

import { createHash } from 'node:crypto';
import {
  ChapterManifestSchema,
  PageManifestSchema,
  ProofArtifactSchema,
  ProjectConfigSchema,
  type PageManifest,
  type ProofArtifact,
  type ProjectConfig,
} from '@wildlands/shared';
import { getProject, updateProjectConfig } from '../../db/repositories/projects.repo.js';
import { listManifests, listPages } from '../../db/repositories/manifests.repo.js';
import { getActiveImage } from '../../db/repositories/images.repo.js';
import { recordExport } from '../../db/repositories/exports.repo.js';
import { getProjectStorage, type ProjectStorage } from '../../services/storage/project-storage.js';
import { listPaginatedPagesForProject } from '../../db/repositories/pagination.repo.js';
import { logger } from '../../lib/logger.js';
import { computePageGeometry } from './page-geometry.js';
import { buildBookHtml, buildCoverHtml, buildPageHtml, computeCoverDimensions, type ChapterPageRender, type BookChapter } from './render-html.js';
import { directLayout } from './layout-director.js';
import { isChromiumAvailable, loadPagedPolyfill, renderHtmlToPdf } from './render-pdf.js';
import { preflightBook, stitchPdfs, type PreflightReport } from '../stage-7-pdf-compile/stitch-book.js';
import sharp from 'sharp';

export class RenderBlockedError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'RenderBlockedError';
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

async function imageDataUriForPage(
  storage: ProjectStorage,
  pageRowId: string | undefined,
  targetPx: { width: number; height: number },
): Promise<string | undefined> {
  if (!pageRowId) return undefined;
  const active = await getActiveImage(pageRowId);
  const path = active?.upscaledPath ?? active?.generatedPath;
  if (!path) return undefined;
  try {
    const buf = await storage.readProjectFile(path);
    const image = sharp(buf, { limitInputPixels: false });
    const metadata = await image.metadata();
    const needsResize = (metadata.width ?? 0) > targetPx.width || (metadata.height ?? 0) > targetPx.height;
    const renderBuffer = needsResize
      ? await image
          .resize({
            width: targetPx.width,
            height: targetPx.height,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .png({ compressionLevel: 9 })
          .toBuffer()
      : buf;
    return `data:image/png;base64,${renderBuffer.toString('base64')}`;
  } catch {
    return undefined; // missing file (e.g. ephemeral FS) -> placeholder
  }
}

function renderImageTargetPx(pm: PageManifest, config: ProjectConfig, geometry: ReturnType<typeof computePageGeometry>): { width: number; height: number } {
  const allocation = directLayout({
    bodyMarkdown: pm.bodyMarkdown,
    layoutTemplate: pm.layoutTemplate,
    geometry,
    bodyPt: config.typography.bodyPt,
    lineHeight: config.typography.lineHeight,
  });
  const box = allocation.artBox;
  return {
    width: Math.max(900, box.recommendedWidthPx + box.bleedPaddingPx * 2),
    height: Math.max(900, box.recommendedHeightPx + box.bleedPaddingPx * 2),
  };
}

export interface ChapterRenderResult {
  chapterNumber: number;
  pdf: Buffer;
  totalPages: number;
  artifact?: ProofArtifact;
}

export interface PageRenderResult {
  pageKey: string;
  chapterNumber: number;
  pdf: Buffer;
  totalPages: number;
  artifact?: ProofArtifact;
}

function proofArtifactId(kind: ProofArtifact['kind'], scope: string, sha256: string): string {
  return `${kind.toLowerCase()}-${scope}-${sha256.slice(0, 12)}`;
}

async function recordProofArtifact(
  projectId: string,
  config: ProjectConfig,
  input: {
    kind: ProofArtifact['kind'];
    title: string;
    storagePath: string;
    sha256: string;
    fileSizeBytes: number;
    totalPages: number;
    chapterNumber?: number;
    pageKey?: string;
  },
): Promise<ProofArtifact> {
  const scope = input.pageKey ?? (input.chapterNumber ? `ch${pad2(input.chapterNumber)}` : input.kind.toLowerCase());
  const artifact = ProofArtifactSchema.parse({
    id: proofArtifactId(input.kind, scope, input.sha256),
    kind: input.kind,
    title: input.title,
    chapterNumber: input.chapterNumber,
    pageKey: input.pageKey,
    storagePath: input.storagePath,
    sha256: input.sha256,
    fileSizeBytes: input.fileSizeBytes,
    totalPages: input.totalPages,
    createdAt: new Date().toISOString(),
  });
  const latestProject = await getProject(projectId);
  const latestConfig = latestProject ? ProjectConfigSchema.parse(latestProject.config) : config;
  const artifacts = [
    artifact,
    ...(latestConfig.proofArtifacts ?? []).filter((existing) => existing.id !== artifact.id),
  ].slice(0, 40);
  await updateProjectConfig(projectId, { ...latestConfig, proofArtifacts: artifacts });
  return artifact;
}

export async function renderPagePdf(projectId: string, pageKey: string): Promise<PageRenderResult> {
  if (!isChromiumAvailable()) throw new RenderBlockedError('Chromium is not available on this host.', 'no_chromium');

  const project = await getProject(projectId);
  if (!project) throw new RenderBlockedError('Project not found.', 'not_found');
  const config = project.config as ProjectConfig;

  const pageManifest = (await listManifests(projectId, 'PAGE'))
    .map((r) => PageManifestSchema.parse(r.content))
    .find((p) => p.pageId === pageKey);
  if (!pageManifest) throw new RenderBlockedError(`No page manifest found for ${pageKey}.`, 'no_page');

  const storage = getProjectStorage();
  const pageRows = await listPages(projectId);
  const pageRow = pageRows.find((row) => row.pageKey === pageKey);
  const geometry = computePageGeometry(config.trimSize);
  const renderPage = {
    ...pageManifest,
    layoutTemplate: (pageRow?.layoutTemplate ?? pageManifest.layoutTemplate) as PageManifest['layoutTemplate'],
  };
  const imageDataUri = await imageDataUriForPage(storage, pageRow?.id, renderImageTargetPx(renderPage, config, geometry));
  const polyfillJs = await loadPagedPolyfill();
  const html = buildPageHtml(renderPage, config, {
    geometry,
    imageDataUri,
    polyfillJs,
    chapterLabel: `Chapter ${renderPage.chapterNumber}`,
  });

  logger.info({ projectId, pageKey }, 'Stage 6: rendering single page PDF');
  const { buffer, totalPages } = await renderHtmlToPdf(html, geometry);

  const stored = await storage.writeProjectFile(projectId, ['pages', `${pageKey}.pdf`], buffer);
  const artifact = await recordProofArtifact(projectId, config, {
    kind: 'PAGE_PROOF',
    title: `${pageKey} Page Proof`,
    chapterNumber: renderPage.chapterNumber,
    pageKey,
    storagePath: stored.relativePath,
    sha256: stored.sha256,
    fileSizeBytes: stored.sizeBytes,
    totalPages,
  });
  return { pageKey, chapterNumber: renderPage.chapterNumber, pdf: buffer, totalPages, artifact };
}

export async function renderChapterPdf(projectId: string, chapterNumber: number): Promise<ChapterRenderResult> {
  if (!isChromiumAvailable()) throw new RenderBlockedError('Chromium is not available on this host.', 'no_chromium');

  const project = await getProject(projectId);
  if (!project) throw new RenderBlockedError('Project not found.', 'not_found');
  const config = project.config as ProjectConfig;

  const manifestRows = await listManifests(projectId, 'CHAPTER');
  const chapterRow = manifestRows
    .map((r) => ChapterManifestSchema.parse(r.content))
    .find((c) => c.chapterNumber === chapterNumber);
  if (!chapterRow) throw new RenderBlockedError(`No chapter ${chapterNumber} manifest found.`, 'no_chapter');

  const pageManifests = (await listManifests(projectId, 'PAGE'))
    .map((r) => PageManifestSchema.parse(r.content))
    .filter((p) => p.chapterNumber === chapterNumber)
    .sort((a, b) => a.pageNumber - b.pageNumber);
  if (pageManifests.length === 0) throw new RenderBlockedError(`Chapter ${chapterNumber} has no pages.`, 'no_pages');

  const storage = getProjectStorage();
  const pageRows = await listPages(projectId);
  const rowByKey = new Map(pageRows.map((row) => [row.pageKey, row]));
  const geometry = computePageGeometry(config.trimSize);

  const entryPdfs: Buffer[] = [];
  const chapterLabel = `Chapter ${chapterNumber} — ${chapterRow.chapterTitle}`;
  const polyfillJs = await loadPagedPolyfill();

  for (const pm of pageManifests) {
    const pageRow = rowByKey.get(pm.pageId);
    const renderPage = {
      ...pm,
      layoutTemplate: (pageRow?.layoutTemplate ?? pm.layoutTemplate) as PageManifest['layoutTemplate'],
    };
    const imageDataUri = await imageDataUriForPage(storage, pageRow?.id, renderImageTargetPx(renderPage, config, geometry));
    const html = buildPageHtml(renderPage, config, {
      geometry,
      imageDataUri,
      polyfillJs,
      chapterLabel,
    });
    const { buffer } = await renderHtmlToPdf(html, geometry);
    entryPdfs.push(buffer);
  }

  logger.info({ projectId, chapterNumber, pages: pageManifests.length }, 'Stage 6: stitching chapter proof from entry renders');
  const { pdf: buffer, pageCount: totalPages } = await stitchPdfs(entryPdfs);

  const stored = await storage.writeProjectFile(projectId, ['chapters', `CH${pad2(chapterNumber)}.pdf`], buffer);
  const artifact = await recordProofArtifact(projectId, config, {
    kind: 'CHAPTER_PROOF',
    title: `Chapter ${chapterNumber} Proof`,
    chapterNumber,
    storagePath: stored.relativePath,
    sha256: stored.sha256,
    fileSizeBytes: stored.sizeBytes,
    totalPages,
  });
  return { chapterNumber, pdf: buffer, totalPages, artifact };
}

export interface BookRenderResult {
  pdf: Buffer;
  pageCount: number;
  chaptersRendered: number;
  preflight: PreflightReport;
  storedPath: string;
  artifact?: ProofArtifact;
}

/** Pull the introduction + glossary prose out of the manuscript's matter sections. */
function extractMatterSections(markdown: string): { introMarkdown?: string; glossaryMarkdown?: string } {
  const sectionUnder = (re: RegExp): string | undefined => {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex((l) => /^#{1,3}\s+/.test(l) && re.test(l));
    if (start === -1) return undefined;
    const startLevel = (lines[start]!.match(/^#+/) ?? ['#'])[0].length;
    const body: string[] = [];
    for (let i = start + 1; i < lines.length; i += 1) {
      const h = lines[i]!.match(/^(#+)\s+/);
      if (h && h[1]!.length <= startLevel) break; // next same/higher heading ends the section
      body.push(lines[i]!);
    }
    const text = body.join('\n').trim();
    return text ? text.slice(0, 12000) : undefined; // cap so a giant section can't blow up the render
  };
  return {
    introMarkdown: sectionUnder(/introduction|front\s*matter|foreword|preface/i),
    glossaryMarkdown: sectionUnder(/glossary/i),
  };
}

async function gatherChapterPages(
  projectId: string,
  config: ProjectConfig,
  geometry: ReturnType<typeof computePageGeometry>,
): Promise<BookChapter[]> {
  const chapters = (await listManifests(projectId, 'CHAPTER'))
    .map((r) => ChapterManifestSchema.parse(r.content))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
  const allPageManifests = (await listManifests(projectId, 'PAGE')).map((r) => PageManifestSchema.parse(r.content));
  const pageRows = await listPages(projectId);
  const rowByKey = new Map(pageRows.map((row) => [row.pageKey, row]));
  const storage = getProjectStorage();

  const result: BookChapter[] = [];
  for (const chapter of chapters) {
    const pms = allPageManifests
      .filter((p) => p.chapterNumber === chapter.chapterNumber)
      .sort((a, b) => a.pageNumber - b.pageNumber);
    const pages: ChapterPageRender[] = [];
    for (const pm of pms) {
      const pageRow = rowByKey.get(pm.pageId);
      const renderPage = { ...pm, layoutTemplate: (pageRow?.layoutTemplate ?? pm.layoutTemplate) as PageManifest['layoutTemplate'] };
      const imageDataUri = await imageDataUriForPage(storage, pageRow?.id, renderImageTargetPx(renderPage, config, geometry));
      pages.push({
        entryTitle: renderPage.entryTitle,
        scientificName: renderPage.scientificName,
        bodyMarkdown: renderPage.bodyMarkdown,
        layoutTemplate: renderPage.layoutTemplate,
        imageDataUri,
      });
    }
    result.push({ chapterNumber: chapter.chapterNumber, chapterTitle: chapter.chapterTitle, pages });
  }
  return result;
}

/**
 * Render the COMPLETE book interior in one pass: front matter (title, copyright,
 * TOC, introduction) → chapters → back matter (glossary, index, colophon), with
 * continuous page numbers and auto-filled TOC/index page references.
 */
export async function renderBookPdf(projectId: string): Promise<BookRenderResult> {
  if (!isChromiumAvailable()) throw new RenderBlockedError('Chromium is not available on this host.', 'no_chromium');

  const project = await getProject(projectId);
  if (!project) throw new RenderBlockedError('Project not found.', 'not_found');
  const config = project.config as ProjectConfig;
  const geometry = computePageGeometry(config.trimSize);

  const chapters = await gatherChapterPages(projectId, config, geometry);
  if (chapters.length === 0) throw new RenderBlockedError('No chapters to render. Generate manifests first.', 'no_chapters');

  let matter: { introMarkdown?: string; glossaryMarkdown?: string } = {};
  if (project.manuscriptPath) {
    try {
      const md = (await getProjectStorage().readProjectFile(project.manuscriptPath)).toString('utf8');
      matter = extractMatterSections(md);
    } catch {
      /* manuscript file missing on ephemeral FS — render without intro/glossary */
    }
  }

  const polyfillJs = await loadPagedPolyfill();
  const html = buildBookHtml({ ...matter, chapters }, config, { geometry, polyfillJs });
  logger.info({ projectId, chapters: chapters.length }, 'Stage 7: rendering full book interior');
  const { buffer: pdf, totalPages: pageCount } = await renderHtmlToPdf(html, geometry);

  const preflight = await preflightBook(pdf, config.trimSize, undefined);

  const storage = getProjectStorage();
  const stored = await storage.writeProjectFile(projectId, ['editions', 'PREMIUM.pdf'], pdf);
  await recordExport({
    projectId,
    kind: 'PREMIUM_PDF',
    status: preflight.passed ? 'READY' : 'FAILED',
    filePath: stored.relativePath,
    sha256: createHash('sha256').update(pdf).digest('hex'),
    fileSizeBytes: pdf.byteLength,
  });
  const artifact = await recordProofArtifact(projectId, config, {
    kind: 'BOOK_PROOF',
    title: 'Full Book PDF Proof',
    storagePath: stored.relativePath,
    sha256: stored.sha256,
    fileSizeBytes: stored.sizeBytes,
    totalPages: pageCount,
  });

  logger.info({ projectId, pageCount, passed: preflight.passed }, 'Stage 7: book rendered + preflighted');
  return { pdf, pageCount, chaptersRendered: chapters.length, preflight, storedPath: stored.relativePath, artifact };
}

export interface CoverRenderResult {
  pdf: Buffer;
  storedPath: string;
  pageCount: number;
  dimensions: ReturnType<typeof computeCoverDimensions>;
  validation: CoverValidation;
  artifact?: ProofArtifact;
}

export interface CoverValidation {
  checks: Array<{ key: string; ok: boolean; message: string }>;
  ready: boolean;
}

function validateCoverInputs(config: ProjectConfig, pageCount: number, dimensions: ReturnType<typeof computeCoverDimensions>): CoverValidation {
  const hooks = config.publishing.bookDescription?.hooks ?? [];
  const checks = [
    {
      key: 'page_count',
      ok: pageCount > 0,
      message: pageCount > 0 ? `Cover sized from ${pageCount} planned interior pages.` : 'No planned pages found for spine calculation.',
    },
    {
      key: 'spine_width',
      ok: dimensions.spineIn >= 0.06,
      message: `Spine width ${dimensions.spineIn.toFixed(3)}in.`,
    },
    {
      key: 'back_cover_copy',
      ok: hooks.length > 0,
      message: hooks.length > 0 ? `${hooks.length} back-cover hook(s) supplied.` : 'No publishing.bookDescription.hooks supplied; using title/subtitle placeholder.',
    },
    {
      key: 'cover_art',
      ok: Boolean(config.publishing.coverAssetPath),
      message: config.publishing.coverAssetPath ? 'Cover art asset configured.' : 'No cover art asset configured; rendering typographic cover.',
    },
    {
      key: 'barcode_zone',
      ok: true,
      message: '2x1.2in barcode zone reserved on back cover.',
    },
  ];
  return { checks, ready: checks.every((c) => c.ok) };
}

/** Render the print-ready full-wrap cover PDF (spine width from interior page count). */
export async function renderCoverPdf(projectId: string): Promise<CoverRenderResult> {
  if (!isChromiumAvailable()) throw new RenderBlockedError('Chromium is not available on this host.', 'no_chromium');
  const project = await getProject(projectId);
  if (!project) throw new RenderBlockedError('Project not found.', 'not_found');
  const config = project.config as ProjectConfig;

  // Page count drives spine width. Do NOT render the entire interior just to
  // size the cover; the active production path already has a spine/page table.
  // This keeps cover validation cheap and avoids pulling the legacy full-book
  // renderer into a cover-only request.
  const pageCount = (await listPaginatedPagesForProject(projectId)).length;
  if (pageCount === 0) throw new RenderBlockedError('No planned pages found; run pagination/front matter before rendering the cover.', 'no_pages');
  const polyfillJs = await loadPagedPolyfill();
  const dims = computeCoverDimensions(config, pageCount);
  const validation = validateCoverInputs(config, pageCount, dims);
  let coverArtDataUri: string | undefined;
  if (config.publishing.coverAssetPath) {
    try {
      const coverBuf = await getProjectStorage().readProjectFile(config.publishing.coverAssetPath);
      coverArtDataUri = `data:image/png;base64,${coverBuf.toString('base64')}`;
    } catch {
      validation.checks.push({
        key: 'cover_art_file',
        ok: false,
        message: `Configured cover art asset could not be read: ${config.publishing.coverAssetPath}`,
      });
      validation.ready = false;
    }
  }
  const html = buildCoverHtml(config, pageCount, { polyfillJs, coverArtDataUri });
  const { buffer } = await renderHtmlToPdf(html, {
    pageWidthIn: dims.fullWidthIn,
    pageHeightIn: dims.fullHeightIn,
  } as unknown as ReturnType<typeof computePageGeometry>);

  const storage = getProjectStorage();
  const stored = await storage.writeProjectFile(projectId, ['editions', 'COVER.pdf'], buffer);
  const artifact = await recordProofArtifact(projectId, config, {
    kind: 'COVER_PROOF',
    title: 'Full Wrap Cover Proof',
    storagePath: stored.relativePath,
    sha256: stored.sha256,
    fileSizeBytes: stored.sizeBytes,
    totalPages: 1,
  });
  return { pdf: buffer, storedPath: stored.relativePath, pageCount, dimensions: dims, validation, artifact };
}
