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
  BookManifestSchema,
  ChapterManifestSchema,
  PageManifestSchema,
  type PageManifest,
  type ProjectConfig,
} from '@wildlands/shared';
import { getProject } from '../../db/repositories/projects.repo.js';
import { listManifests, listPages } from '../../db/repositories/manifests.repo.js';
import { getActiveImage } from '../../db/repositories/images.repo.js';
import { recordExport } from '../../db/repositories/exports.repo.js';
import { LocalStorageService } from '../../services/storage/local-storage.js';
import { logger } from '../../lib/logger.js';
import { computePageGeometry } from './page-geometry.js';
import { buildChapterHtml, type ChapterPageRender } from './render-html.js';
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
  storage: LocalStorageService,
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

  const storage = new LocalStorageService();
  const pageRows = await listPages(projectId);
  const rowByKey = new Map(pageRows.map((row) => [row.pageKey, row]));
  const geometry = computePageGeometry(config.trimSize);

  const pages: ChapterPageRender[] = [];
  for (const pm of pageManifests) {
    const imageDataUri = await imageDataUriForPage(storage, rowByKey.get(pm.pageId)?.id, renderImageTargetPx(pm, config, geometry));
    pages.push({
      entryTitle: pm.entryTitle,
      scientificName: pm.scientificName,
      bodyMarkdown: pm.bodyMarkdown,
      layoutTemplate: pm.layoutTemplate,
      imageDataUri,
    });
  }

  const polyfillJs = await loadPagedPolyfill();
  const html = buildChapterHtml(
    pages,
    config,
    { chapterNumber, chapterTitle: chapterRow.chapterTitle },
    { geometry, polyfillJs },
  );

  logger.info({ projectId, chapterNumber, pages: pages.length }, 'Stage 6: rendering chapter PDF');
  const { buffer, totalPages } = await renderHtmlToPdf(html, geometry);

  await storage.writeProjectFile(projectId, ['chapters', `CH${pad2(chapterNumber)}.pdf`], buffer);
  return { chapterNumber, pdf: buffer, totalPages };
}

export interface BookRenderResult {
  pdf: Buffer;
  pageCount: number;
  chaptersRendered: number;
  preflight: PreflightReport;
  storedPath: string;
}

export async function renderBookPdf(projectId: string): Promise<BookRenderResult> {
  if (!isChromiumAvailable()) throw new RenderBlockedError('Chromium is not available on this host.', 'no_chromium');

  const project = await getProject(projectId);
  if (!project) throw new RenderBlockedError('Project not found.', 'not_found');
  const config = project.config as ProjectConfig;

  const chapters = (await listManifests(projectId, 'CHAPTER'))
    .map((r) => ChapterManifestSchema.parse(r.content))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
  if (chapters.length === 0) throw new RenderBlockedError('No chapters to render. Generate manifests first.', 'no_chapters');

  const chapterPdfs: Buffer[] = [];
  for (const chapter of chapters) {
    const { pdf } = await renderChapterPdf(projectId, chapter.chapterNumber);
    chapterPdfs.push(pdf);
  }

  const { pdf, pageCount } = await stitchPdfs(chapterPdfs);

  const [bookRow] = await listManifests(projectId, 'BOOK');
  const expectedPages = bookRow ? BookManifestSchema.parse(bookRow.content).totalPages : undefined;
  const preflight = await preflightBook(pdf, config.trimSize, expectedPages);

  const storage = new LocalStorageService();
  const stored = await storage.writeProjectFile(projectId, ['editions', 'PREMIUM.pdf'], pdf);
  await recordExport({
    projectId,
    kind: 'PREMIUM_PDF',
    status: preflight.passed ? 'READY' : 'FAILED',
    filePath: stored.relativePath,
    sha256: createHash('sha256').update(pdf).digest('hex'),
    fileSizeBytes: pdf.byteLength,
  });

  logger.info({ projectId, pageCount, passed: preflight.passed }, 'Stage 7: book stitched + preflighted');
  return { pdf, pageCount, chaptersRendered: chapters.length, preflight, storedPath: stored.relativePath };
}
