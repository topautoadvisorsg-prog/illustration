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
  buildSeriesLine,
  buildBackCoverCopy,
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
import { buildBookHtml, buildCoverHtml, buildPageHtml, computeCoverDimensions, COVER_BLEED_IN, type ChapterPageRender, type BookChapter } from './render-html.js';
import { directLayout } from './layout-director.js';
import { isChromiumAvailable, loadPagedPolyfill, renderHtmlToPdf } from './render-pdf.js';
import { composeCoverPrint } from '../print-prep/cover-print.js';
import { preflightBook, stitchPdfs, type PreflightReport } from '../stage-7-pdf-compile/stitch-book.js';
import { assemblePagePrompt } from '../whole-page-render/assemble-page-prompt.js';
import { PAGE_TYPOGRAPHY_DNA } from '../whole-page-render/typography-dna.js';
import type { WholePageSpec } from '../whole-page-render/types.js';
import { getDefaultEdition } from '../../db/repositories/editions.repo.js';
import { getProductionProfile } from '../production-profiles/registry.js';
import { assembleIllustrationDna } from '../publishing-standard/index.js';
import { generateImage } from '../../services/openai/openai.js';
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
  const config = ProjectConfigSchema.parse(project.config);

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
  const config = ProjectConfigSchema.parse(project.config);

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
  const config = ProjectConfigSchema.parse(project.config);
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
  coverArtPromptPath: string;
  coverArtPromptPreview: string;
  pageCount: number;
  dimensions: ReturnType<typeof computeCoverDimensions>;
  validation: CoverValidation;
  scopeChapters: number[] | null;
  artifact?: ProofArtifact;
}

export interface CoverArtworkResult {
  projectId: string;
  imagePath: string;
  promptPath: string;
  promptPreview: string;
  widthPx: number;
  heightPx: number;
  model: string;
  pageCount: number;
  dimensions: ReturnType<typeof computeCoverDimensions>;
  scopeChapters: number[] | null;
}

export interface CoverValidation {
  checks: Array<{ key: string; ok: boolean; message: string }>;
  ready: boolean;
}

function validateCoverInputs(config: ProjectConfig, pageCount: number, dimensions: ReturnType<typeof computeCoverDimensions>): CoverValidation {
  const backCover = buildBackCoverCopy(config.publishing.bookDescription);
  const backParts = backCover
    ? [backCover.mainDescription ? 'description' : null, backCover.insideThisVolume?.length ? 'features' : null, backCover.authorBio ? 'author bio' : null].filter(Boolean)
    : [];
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
      ok: backParts.length > 0,
      message: backParts.length > 0 ? `Back-cover copy supplied (${backParts.join(', ')}).` : 'No back-cover copy supplied (Book Setup → Back Cover); the back cover will use a title/subtitle placeholder.',
    },
    {
      key: 'cover_art',
      ok: Boolean(config.publishing.coverAssetPath),
      message: config.publishing.coverAssetPath ? 'Cover art asset configured.' : 'No cover art asset configured; rendering typographic cover.',
    },
    {
      // Reported as what actually happens. It used to say "2x1.2in barcode zone
      // reserved on back cover", which stopped being true when the reserve was
      // removed — that placeholder had been printing on proofs. A check that
      // asserts a protection nobody applies is worse than no check.
      key: 'barcode_zone',
      ok: true,
      message: 'No barcode drawn or reserved — KDP prints its own on the back cover. Artwork runs through; keep readable copy out of the lower right.',
    },
  ];
  return { checks, ready: checks.every((c) => c.ok) };
}

/** Render the print-ready full-wrap cover PDF (spine width from interior page count). */
export interface RenderCoverOptions {
  /** When present, size the cover for a standalone proof book containing only these body chapters. */
  chapters?: number[];
}

/**
 * Interior page count for the cover, for EITHER track.
 *
 * The spine is sized from this number, so getting it from the wrong place is a
 * printing defect rather than a bug. It used to read the legacy planned-page
 * table unconditionally, which returns zero rows for a typeset book: every
 * typeset book therefore failed the cover with "no planned pages" even though
 * its interior existed and its page count was known.
 */
async function resolveCoverPageCount(
  projectId: string,
  config: ProjectConfig,
  scopeChapters: number[] | null,
): Promise<number> {
  const { getProductionProfile } = await import('../production-profiles/registry.js');
  const { resolveTrack } = await import('../book-assembly/interior-artifact.js');
  const profile = getProductionProfile(config.productionProfileId);
  const track = resolveTrack(profile?.bodyRenderTrack);

  if (track === 'rendered-pages') {
    return (await listPaginatedPagesForProject(projectId)).filter(
      (p) => p.section !== 'BODY' || !scopeChapters || scopeChapters.includes(p.chapterNumber),
    ).length;
  }

  // Typeset track: the typesetter is the only authority on the page count, the
  // same way it is for the interior itself. Rendering here costs seconds and no
  // money, and it is the number the printed book will actually have.
  //
  // Through the SAME builder the preview and the export use, under the book's
  // own chapter-start policy. A second copy of this call lived here and passed
  // a hardcoded policy, so the spine could be sized from a page count the
  // interior never had.
  const { buildTypesetInterior, TypesetInputMissingError } = await import(
    '../typeset/build-typeset-interior.js'
  );
  try {
    const { pageCount } = await buildTypesetInterior(projectId, config, {
      chaptersStartRecto: config.typesetChaptersStartRecto,
    });
    return pageCount;
  } catch (err) {
    // No manuscript yet is "no interior", not a cover failure: zero pages is
    // reported by the caller's own guard, which names the step to run.
    if (err instanceof TypesetInputMissingError) return 0;
    throw err;
  }
}

/**
 * The cover's page count and wrap geometry, for callers that only need to
 * DESCRIBE the cover — the KDP guide overlay, audits, reports.
 *
 * Exists so those callers stop deriving geometry of their own. The guide
 * overlay used to draw 7x10 at a 24-page fallback over a 5.5x8.5 154-page book.
 */
export async function renderCoverGeometry(
  projectId: string,
  config: ProjectConfig,
): Promise<{ pageCount: number; dims: ReturnType<typeof computeCoverDimensions> }> {
  const pageCount = await resolveCoverPageCount(projectId, config, null);
  return { pageCount, dims: computeCoverDimensions(config, pageCount) };
}

export async function renderCoverPdf(projectId: string, options: RenderCoverOptions = {}): Promise<CoverRenderResult> {
  const project = await getProject(projectId);
  if (!project) throw new RenderBlockedError('Project not found.', 'not_found');
  const config = ProjectConfigSchema.parse(project.config);

  // Page count drives spine width. Do NOT render the entire interior just to
  // size the cover; the active production path already has a spine/page table.
  // This keeps cover validation cheap and avoids pulling the legacy full-book
  // renderer into a cover-only request.
  const scopeChapters = options.chapters?.length
    ? Array.from(new Set(options.chapters)).sort((a, b) => a - b)
    : null;
  const pageCount = await resolveCoverPageCount(projectId, config, scopeChapters);
  if (pageCount === 0) {
    throw new RenderBlockedError(
      'No interior pages found. Run the production step for this track before building the cover: ' +
        'pagination for a rendered-page book, or the typeset preview for a typeset book.',
      'no_pages',
    );
  }
  const dims = computeCoverDimensions(config, pageCount);
  const validation = validateCoverInputs(config, pageCount, dims);
  const coverArtPrompt = buildCoverWrapPrompt(config, pageCount, dims);

  // Load the AI wrap art (the production cover). Present → take the print-grade
  // path; absent/unreadable → fall back to the typographic HTML cover.
  let coverArtBuf: Buffer | null = null;
  if (config.publishing.coverAssetPath) {
    try {
      coverArtBuf = await getProjectStorage().readProjectFile(config.publishing.coverAssetPath);
    } catch {
      validation.checks.push({
        key: 'cover_art_file',
        ok: false,
        message: `Configured cover art asset could not be read: ${config.publishing.coverAssetPath}`,
      });
      validation.ready = false;
    }
  }

  let buffer: Buffer;
  if (coverArtBuf) {
    // PRINT-GRADE PATH: compose the wrap art onto the 300-DPI full-wrap canvas
    // and embed it losslessly (sharp + pdf-lib). This replaces the Chromium
    // page.pdf() path, which downsampled the cover to ~100 DPI. No Chromium
    // needed when art is present; composition (art + barcode reserve) unchanged.
    const composed = await composeCoverPrint(coverArtBuf, config, dims);
    buffer = composed.pdfBuffer;
  } else {
    // FALLBACK: typographic cover (no AI art) still renders via Paged.js/Chromium.
    if (!isChromiumAvailable()) throw new RenderBlockedError('Chromium is not available on this host.', 'no_chromium');
    const polyfillJs = await loadPagedPolyfill();
    const html = buildCoverHtml(config, pageCount, { polyfillJs });
    const rendered = await renderHtmlToPdf(html, {
      pageWidthIn: dims.fullWidthIn,
      pageHeightIn: dims.fullHeightIn,
    } as unknown as ReturnType<typeof computePageGeometry>);
    buffer = rendered.buffer;
  }

  const storage = getProjectStorage();
  const coverPrompt = await storage.writeProjectFile(projectId, ['cover', 'cover-art-direction.txt'], coverArtPrompt);
  const stored = await storage.writeProjectFile(projectId, ['editions', 'COVER.pdf'], buffer);
  const artifact = await recordProofArtifact(projectId, config, {
    kind: 'COVER_PROOF',
    title: 'Full Wrap Cover Proof',
    storagePath: stored.relativePath,
    sha256: stored.sha256,
    fileSizeBytes: stored.sizeBytes,
    totalPages: 1,
  });
  return {
    pdf: buffer,
    storedPath: stored.relativePath,
    coverArtPromptPath: coverPrompt.relativePath,
    coverArtPromptPreview: coverArtPrompt.slice(0, 1600),
    pageCount,
    dimensions: dims,
    validation,
    scopeChapters,
    artifact,
  };
}

/**
 * Generate and persist the full-wrap cover artwork.
 *
 * THE IMAGE MODEL BAKES ALL COVER TYPOGRAPHY — title, subtitle, author, spine
 * and back-cover copy — into the artwork itself; see `coverCopy` below, which
 * the prompt passes through as "bake exactly, letter-for-letter", and
 * `print-prep/cover-print.ts`, which stamps nothing and only upscales this art
 * onto the 300-DPI canvas. This comment used to claim the opposite (that
 * typography was added deterministically at print-prep), which is worth
 * knowing: it means every word that will appear on the printed cover has to be
 * correct in the config BEFORE this paid call, and there is no later stage that
 * will fix it. No barcode is ever drawn or reserved — KDP prints its own.
 */
export async function generateCoverWrapArtwork(
  projectId: string,
  options: RenderCoverOptions = {},
): Promise<CoverArtworkResult> {
  const project = await getProject(projectId);
  if (!project) throw new RenderBlockedError('Project not found.', 'not_found');
  const config = ProjectConfigSchema.parse(project.config);
  const scopeChapters = options.chapters?.length
    ? Array.from(new Set(options.chapters)).sort((a, b) => a - b)
    : null;
  // Track-aware, like renderCoverPdf. This read the legacy page table directly
  // and a typeset book has no rows in it, so the PAID cover button threw
  // `no_pages` for a finished 154-page book. Getting the count wrong here is
  // worse than elsewhere: the spine width is baked into the artwork.
  const pageCount = await resolveCoverPageCount(projectId, config, scopeChapters);
  if (pageCount === 0) throw new RenderBlockedError('No interior pages found; build the interior before generating the cover.', 'no_pages');

  const dims = computeCoverDimensions(config, pageCount);
  const edition = await getDefaultEdition(projectId).catch(() => null);
  const prompt = buildCoverWrapPrompt(config, pageCount, dims, edition?.styleDnaId);
  const image = await generateImage({
    // Kept in step with COVER_ART_CANVAS_PX, which the prompt's edge-crop
    // warning is computed from. Changing one without the other tells the model
    // to protect the wrong band.
    size: `${COVER_ART_CANVAS_PX.w}x${COVER_ART_CANVAS_PX.h}`,
    prompt,
    quality: 'high',
  });

  const storage = getProjectStorage();
  const promptStored = await storage.writeProjectFile(projectId, ['cover', 'cover-wrap.prompt.txt'], prompt);
  const imageStored = await storage.writeProjectFile(projectId, ['cover', 'cover-wrap-art.png'], image.pngBuffer);
  await updateProjectConfig(projectId, {
    ...config,
    publishing: {
      ...config.publishing,
      coverAssetPath: imageStored.relativePath,
      // Phase 0 sync record: the spine width is baked into THIS art at THIS page
      // count. Final export compares it against the live interior page count.
      coverSync: {
        builtForPageCount: pageCount,
        spineIn: dims.spineIn,
        generatedAt: new Date().toISOString(),
      },
    },
  });

  return {
    projectId,
    imagePath: imageStored.relativePath,
    promptPath: promptStored.relativePath,
    promptPreview: prompt.slice(0, 1600),
    widthPx: image.widthPx,
    heightPx: image.heightPx,
    model: image.model,
    pageCount,
    dimensions: dims,
    scopeChapters,
  };
}

/**
 * The image model's canvas. Must stay in step with the `size` passed to
 * `generateImage` for the cover, because the safe band below is derived from it.
 */
export const COVER_ART_CANVAS_PX = { w: 1536, h: 1024 } as const;

/**
 * WHAT SURVIVES THE FIT ONTO THE WRAP — stated to the model in its own prompt.
 *
 * The model can only produce a few fixed canvas shapes, and none of them is the
 * shape of a book wrap. `composeCoverPrint` resizes the art with `fit: 'cover'`,
 * which fills the wrap and centre-crops the overflow. For this book that is
 * 1536x1024 (1.500) fitted into 11.385x8.500 (1.340): the art is scaled until
 * its HEIGHT fills, and 0.68in is then cut off EACH end of the wrap — 12% of the
 * front panel's outer edge, on the side where a title block naturally sits.
 *
 * Nothing warned anyone about this. The previous book got away with it because
 * its art was a wilderness panorama, where losing the outer inches is invisible.
 * A designed cover with baked typography would lose words.
 *
 * The honest fix while the canvas shapes are fixed is to compose for the band
 * that survives, so the crop removes only intentional bleed. The numbers are
 * computed from the same geometry the compositor uses, never guessed.
 */
export function coverArtSafeBand(dims: ReturnType<typeof computeCoverDimensions>): string {
  const dpi = 300;
  const canvasW = Math.round(dims.fullWidthIn * dpi);
  const canvasH = Math.round(dims.fullHeightIn * dpi);
  const scale = Math.max(canvasW / COVER_ART_CANVAS_PX.w, canvasH / COVER_ART_CANVAS_PX.h);
  const overflowX = (COVER_ART_CANVAS_PX.w * scale - canvasW) / 2;
  const overflowY = (COVER_ART_CANVAS_PX.h * scale - canvasH) / 2;
  const pctX = Math.ceil((overflowX / (COVER_ART_CANVAS_PX.w * scale)) * 100);
  const pctY = Math.ceil((overflowY / (COVER_ART_CANVAS_PX.h * scale)) * 100);
  const parts = [
    'CRITICAL — EDGE CROP',
    `the outer ${pctX}% of the LEFT edge and the outer ${pctX}% of the RIGHT edge of this image will be cut off and thrown away`,
  ];
  if (pctY > 0) parts.push(`the outer ${pctY}% of the TOP and BOTTOM will also be cut off`);
  parts.push(
    'every letter of typography, and every element that must be seen, belongs inside the remaining central area',
    'let only background colour, texture and deliberate bleed run into the cropped margins',
  );
  return parts.join('; ');
}

/**
 * WHERE TYPE IS ALLOWED TO SIT — the trim-safe area, stated as a percentage.
 *
 * The wrap carries 0.125in of bleed that is CUT OFF, and KDP wants readable copy
 * a further 0.25in inside the cut. The first generated cover put the author name
 * hard against the bottom edge of the image, which is inside the part that gets
 * trimmed away — it would have been sliced on press.
 *
 * The model cannot be told "0.375 inches"; it composes in fractions of its
 * canvas. So the inset is converted to a percentage of the generated image and
 * stated as a floor, together with the technique that actually holds type off an
 * edge: put a graphic element below it. Type given nothing to sit on drifts to
 * the edge, which is what happened.
 */
export function coverTypeSafeArea(dims: ReturnType<typeof computeCoverDimensions>): string {
  const SAFE_INSIDE_TRIM_IN = 0.25;
  const insetIn = COVER_BLEED_IN + SAFE_INSIDE_TRIM_IN;
  const pctV = Math.ceil((insetIn / dims.fullHeightIn) * 100);
  const pctH = Math.ceil((insetIn / dims.fullWidthIn) * 100);
  return [
    'CRITICAL — TRIM SAFETY FOR TYPE',
    `the outer ${insetIn.toFixed(3)} inches of this wrap is cut off or too close to the cut to trust`,
    `NO letter of any text may sit within the outer ${pctV}% of the image height (top or bottom) or the outer ${pctH}% of the image width`,
    'the author name in particular must NOT sit at the very bottom of the front panel — lift it well clear of the bottom edge',
    'give the type something to sit on: place a graphic band, object or colour block BELOW the author name so the name is pushed up into the safe area rather than drifting down to the edge',
    'the same on the back panel — a graphic element above the copy and another below it, holding the text block in the middle where it is safe',
  ].join('; ');
}

export function buildCoverWrapPrompt(
  config: ProjectConfig,
  pageCount: number,
  dims: ReturnType<typeof computeCoverDimensions>,
  /** Style DNA for this edition's cover. Omitted → the production profile's
   *  default, which for the field guide is the Color profile (unchanged). */
  styleDnaId?: string,
): string {
  const backCover = buildBackCoverCopy(config.publishing.bookDescription);
  const title = config.publishing.title ?? config.title;
  const subtitle = config.publishing.subtitle ?? config.subtitle ?? '';
  const authors = config.publishing.authors?.length ? config.publishing.authors.join(', ') : config.authorName;
  // Data-driven, per book — no hardcoded series/region. The scene follows the
  // book's subtitle/region + cover description; the series line is the single
  // source of truth from buildSeriesLine().
  const coverDescription = config.publishing.coverDescription ?? '';
  const coverArtDirection = (config.publishing.coverArtDirection ?? '').trim();
  // series.volumeNumber is "book N in this series"; config.volume is an
  // unrelated per-project field and must never drive the printed series line.
  const seriesLine =
    buildSeriesLine(config.publishing.series?.name, config.publishing.series?.volumeNumber ?? config.volume) ?? undefined;
  const sceneSubject = subtitle || title;
  const frontPanelXIn = config.trimSize.bleedIn + config.trimSize.widthIn + dims.spineIn;
  // How THIS class of book wants its cover art described. The fallback is the
  // field guide's original wording verbatim, so the book that already shipped
  // produces the same prompt it always did.
  const artLanguage = getProductionProfile(config.productionProfileId).coverArtLanguage ?? {
    atmosphere: `a single continuous ${sceneSubject} wilderness panorama wrapping back-to-front; archival painterly naturalist atmosphere; the Cinematic Naturalist DNA of the interior plates, scaled up to a premium collector cover — never a flat poster or graphic design`,
    mood: 'premium, cinematic, atmospheric, cohesive',
  };
  const spec: WholePageSpec = {
    pageType: 'COVER_WRAP',
    layoutFamily: 'LAYOUT_A_ILLUSTRATION',
    layoutGeometry: {
      trim: { widthIn: dims.fullWidthIn, heightIn: dims.fullHeightIn },
      marginsIn: { top: 0, bottom: 0, outside: 0, inside: 0 },
      bleedIn: 0,
    },
    composition: {
      imagePlacement: [
        'full-wrap artwork canvas covering back cover, spine, and front cover as one continuous full-bleed composition',
        `full wrap ${dims.fullWidthIn.toFixed(3)} x ${dims.fullHeightIn.toFixed(3)} inches`,
        `spine width ${dims.spineIn.toFixed(3)} inches`,
        coverArtSafeBand(dims),
        coverTypeSafeArea(dims),
      ].join('; '),
      textPlacement: [
        'front cover: calm upper/central title-safe zone and smaller lower author/imprint zone',
        'spine: visually calm vertical strip for system-set spine typography',
        // No "barcode zone". KDP prints its own barcode after press and we
        // reserve nothing — a reserved box once landed on a printed proof. The
        // only real requirement is that no readable copy sits where it lands,
        // which the prompt states elsewhere as a rule rather than as a region.
        'back cover: readable negative space for the back-cover copy, with the lower-right corner kept quiet and free of type',
      ].join('; '),
    },
    readingFieldGeometry: {
      originIn: { x: frontPanelXIn + 0.65, y: 0.8 },
      sizeIn: { w: Math.max(1, config.trimSize.widthIn - 1.3), h: Math.max(1, dims.fullHeightIn - 1.6) },
      anchor: 'CENTER',
      widerThanProductionPct: 0,
    },
    typographyDNA: {
      ...PAGE_TYPOGRAPHY_DNA,
      titleHierarchy: [title, subtitle, coverDescription, authors, seriesLine].filter(Boolean) as string[],
      decorativeInitial: null,
    },
    illustrationDNA: {
      // The COVER's DNA, which is not the interior's. See coverStyleDnaId.
      masterStyleBlock: assembleIllustrationDna(
        styleDnaId ??
          getProductionProfile(config.productionProfileId).coverStyleDnaId ??
          getProductionProfile(config.productionProfileId).defaultStyleDnaId,
      ),
      // Operator cover art-direction (when supplied) drives a specific, curated
      // wrap scene; otherwise fall back to a generic establishing scene evoked by
      // the title. Either way it stays ONE continuous full-bleed wrap with calm
      // zones for the typography the model itself bakes in.
      subject: coverArtDirection
        ? {
            primary: `Full-wrap cover artwork as ONE continuous full-bleed composition across back cover, spine, and front cover. ${coverArtDirection}`,
            supporting: [
              'front cover (right panel): the hero/focal subject of the art-direction, with depth and atmosphere; calm sky/space above for the title',
              'spine: the scene continues unbroken as a quiet vertical strip with low visual contrast',
              'back cover (left panel): the same design continuing, calmer, with restrained negative space for the back-cover copy and a quiet lower-right corner carrying no type',
              'back cover: preserve calm negative space for publisher-set descriptive copy',
            ],
            environment: artLanguage.atmosphere,
            mood: `${artLanguage.mood}, calm enough for system typography`,
          }
        : {
            primary: `Full-wrap cover artwork: a cinematic establishing scene evoking ${sceneSubject}${coverDescription ? ` (${coverDescription})` : ''}, as one continuous full-bleed composition across back cover, spine, and front cover.`,
            supporting: [
              `front cover: cinematic establishing view of the setting evoked by "${sceneSubject}", with depth and atmosphere`,
              'spine: quiet continuous texture with low visual contrast',
              'back cover: restrained atmosphere of the same setting that supports readable copy',
              'back cover: preserve calm negative space for publisher-set descriptive copy',
            ],
            environment: `setting evoked by "${sceneSubject}"${coverDescription ? `: ${coverDescription}` : ''}; ${artLanguage.atmosphere}; continuous wrap composition`,
            mood: `${artLanguage.mood}, calm enough for system typography`,
          },
    },
    pageText: {
      title: { kicker: subtitle, number: '', name: title.toUpperCase() },
      body: '',
      bodyBlocks: [],
      dropCap: null,
    },
    // Every word that will be PRINTED on the cover. assemblePagePrompt sends
    // this to the image model under "bake exactly, letter-for-letter" — it does
    // NOT withhold it, whatever this comment used to say. Anything wrong or
    // missing here is wrong on the printed cover, and fixing it costs another
    // paid generation.
    coverCopy: {
      title: title.toUpperCase(),
      subtitle: subtitle || undefined,
      coverDescription: coverDescription || undefined,
      author: authors || undefined,
      seriesLine,
      backCover: backCover ?? undefined,
    },
    decorativeElements: {
      topRule: null,
      bottomRule: null,
      badges: [],
    },
    badgeContext: { hazard: ['NONE'], region: 'GENERAL', source: 'GENERAL_REFERENCE' },
    badgeSafeZones: [],
  };
  return assemblePagePrompt(spec);
}
