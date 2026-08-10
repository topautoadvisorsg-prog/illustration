/**
 * Book Assembly orchestrator — merge the approved, print-prepped, preflight-
 * passed pages into ONE KDP interior PDF, in spine order, behind a hard
 * validation gate.
 *
 * Consumes whole_page_renders where active && approved_for_book && (validated)
 * preflight_passed. Produces an interior PDF (cover is a separate file) and an
 * audited `exports` row. Blocks (no PDF) if any required page is missing,
 * un-print-prepped, failed preflight, or wrong size.
 */

import { createHash, randomUUID } from 'node:crypto';
import { ProjectConfigSchema, type ProjectConfig } from '@wildlands/shared';
import { resolveGeometry } from '../publishing-standard/index.js';
import { getProject } from '../../db/repositories/projects.repo.js';
import { listPaginatedPagesForProject } from '../../db/repositories/pagination.repo.js';
import { listBookReadyRenders } from '../../db/repositories/whole-page-render.repo.js';
import { recordExport } from '../../db/repositories/exports.repo.js';
import { getProjectStorage } from '../../services/storage/project-storage.js';
import { frontMatterStatus, resolveSpine, type SpinePage } from './spine-order.js';
import { resolveTrack, type ProductionTrack } from './interior-artifact.js';
import {
  pageCountAdvisory,
  validateAssembly,
  type BookReadyRenderRef,
  type PageDimsPt,
  type AssemblyValidation,
} from './validate-assembly.js';
import { assembleReviewPdfFromPrintPngs, mergeSinglePagePdfs, readFirstPageDimsPt } from './pdf-merge.js';

export interface AssemblySpineEntry {
  position: number;
  pageKey: string;
  renderId: string | null;
  printPdfPath: string | null;
  printPngPath: string | null;
}

/** Operator-facing message when the cover spine no longer matches the interior. */
export const COVER_STALE_MESSAGE =
  'Cover is out of date. The interior page count changed and the spine width may be incorrect. Regenerate the cover before exporting.';

export interface AssemblyReport {
  projectId: string;
  runId: string;
  /**
   * Which track produced this interior. The console needs it: "render and
   * approve these pages" is the right instruction for one track and nonsense
   * for the other, and sending a typeset operator to the page-render stage was
   * how they got lost.
   */
  track: ProductionTrack;
  blocked: boolean;
  frontMatter: 'absent' | 'included';
  expectedPages: number;
  assembledPages: number;
  spine: AssemblySpineEntry[];
  validations: AssemblyValidation['checks'];
  missing: string[];
  preflightFailures: string[];
  noPrintOutput: string[];
  dimensionFailures: string[];
  interiorPdfPath: string | null;
  interiorPdfBytes: number;
  artifactQuality: 'PRINT_READY' | 'REVIEW_FALLBACK' | null;
  warnings: string[];
  finalPageCount: number;
  pageCountAdvisory: ReturnType<typeof pageCountAdvisory>;
  finalTrim: { trimIn: { w: number; h: number }; bleedIn: number };
  scopeChapters: number[] | null;
  /** Phase 0 cover/interior sync gate. coverStale blocks a full-book export. */
  coverStale: boolean;
  coverBuiltForPageCount: number | null;
}

/**
 * Phase 0 cover/interior synchronization. The cover spine is baked into the AI
 * art for a specific interior page count; if the interior count later changes,
 * the spine is wrong. Only applies to a full-book export that HAS a cover with a
 * recorded page count (covers made before this field, or chapter proofs, are
 * exempt — there is nothing to compare).
 */
export function coverSyncStatus(opts: {
  hasCover: boolean;
  coverBuiltForPageCount: number | null | undefined;
  interiorPageCount: number;
  fullBook: boolean;
}): { applicable: boolean; stale: boolean } {
  const { hasCover, coverBuiltForPageCount, interiorPageCount, fullBook } = opts;
  if (!fullBook || !hasCover || coverBuiltForPageCount == null) return { applicable: false, stale: false };
  return { applicable: true, stale: coverBuiltForPageCount !== interiorPageCount };
}

export interface AssembleBookOptions {
  /** When present, assemble a standalone proof book for only these body chapters. */
  chapters?: number[];
}

/**
 * Assemble a TYPESET book.
 *
 * The interior already exists as one finished PDF with live vector text,
 * embedded Type0 fonts and stamped artwork. There is nothing to merge and
 * nothing to validate page by page: the typesetter's own report is the gate,
 * and it is stricter than the per-page one (a book with vertical overflow or a
 * missing section never gets this far).
 *
 * The PDF is stored UNCHANGED. Rasterising it to satisfy the page-render
 * assembler would destroy the vector text, the fonts and the artwork, which are
 * the entire reason this track exists.
 */
async function assembleTypesetBook(
  projectId: string,
  config: ProjectConfig,
  geometry: ReturnType<typeof resolveGeometry>,
  options: AssembleBookOptions,
): Promise<AssemblyReport> {
  const runId = randomUUID();
  const scopeChapters = options.chapters?.length ? [...new Set(options.chapters)].sort((a, b) => a - b) : null;

  const { buildTypesetInterior } = await import('../typeset/build-typeset-interior.js');
  const interior = await buildTypesetInterior(projectId, config, {
    chaptersStartRecto: config.typesetChaptersStartRecto,
  });

  // The typesetter's own failure conditions, stated as assembly blockers so the
  // operator sees them in the same place as every other reason an export stops.
  const problems: string[] = [];
  for (const p of interior.report.verticalOverflowPages) problems.push(`page ${p} overflows its text area`);
  for (const o of interior.orphanedIllustrations) problems.push(`illustration ${o.blockId}: ${o.reason}`);

  const coverBuiltForPageCount = config.publishing.coverSync?.builtForPageCount ?? null;
  const cover = coverSyncStatus({
    hasCover: Boolean(config.publishing.coverAssetPath),
    coverBuiltForPageCount,
    interiorPageCount: interior.pageCount,
    fullBook: scopeChapters === null,
  });
  const blocked = problems.length > 0 || cover.stale;

  const report = (interiorPdfPath: string | null, bytes: number): AssemblyReport => ({
    projectId,
    runId,
    track: 'typeset',
    blocked,
    // Typeset books carry their own title/copyright/contents pages, produced by
    // the same standard as the body rather than as separate page rows.
    frontMatter: 'included',
    expectedPages: interior.pageCount,
    assembledPages: interiorPdfPath ? interior.pageCount : 0,
    spine: [],
    validations: [
      {
        name: 'typeset_no_overflow',
        ok: interior.report.verticalOverflowPages.length === 0,
        detail: interior.report.verticalOverflowPages.length
          ? `${interior.report.verticalOverflowPages.length} pages overflow their text area`
          : `${interior.pageCount} pages, none overflowing`,
      },
      {
        name: 'typeset_illustrations_placed',
        ok: interior.orphanedIllustrations.length === 0,
        detail: `${interior.stampedIllustrations.length} placed, ${interior.orphanedIllustrations.length} orphaned`,
      },
      {
        name: 'cover_in_sync',
        ok: !cover.stale,
        detail: cover.stale
          ? `cover was built for ${coverBuiltForPageCount} pages, interior is ${interior.pageCount}`
          : 'cover matches the interior page count',
      },
    ],
    missing: problems,
    preflightFailures: [],
    noPrintOutput: [],
    dimensionFailures: [],
    interiorPdfPath,
    interiorPdfBytes: bytes,
    artifactQuality: interiorPdfPath ? 'PRINT_READY' : null,
    warnings: cover.stale ? [COVER_STALE_MESSAGE] : [],
    finalPageCount: interior.pageCount,
    pageCountAdvisory: pageCountAdvisory(interior.pageCount),
    finalTrim: {
      trimIn: { w: geometry.trimSize.widthIn, h: geometry.trimSize.heightIn },
      bleedIn: geometry.trimSize.bleedIn,
    },
    scopeChapters,
    coverStale: cover.stale,
    coverBuiltForPageCount,
  });

  if (blocked) {
    await recordExport({ projectId, kind: 'PREMIUM_PDF', status: 'FAILED', filePath: null });
    return report(null, 0);
  }

  const stored = await getProjectStorage().writeProjectFile(
    projectId,
    ['exports', `interior-${runId}.pdf`],
    interior.pdf,
  );
  await recordExport({
    projectId,
    kind: 'PREMIUM_PDF',
    status: 'READY',
    filePath: stored.relativePath,
    sha256: createHash('sha256').update(interior.pdf).digest('hex'),
    fileSizeBytes: interior.pdf.length,
  });
  return report(stored.relativePath, interior.pdf.length);
}

export async function assembleBook(projectId: string, options: AssembleBookOptions = {}): Promise<AssemblyReport> {
  // 0. Resolve the project geometry — the single source for the expected page
  //    size and the reported final trim (SPEC_GEOMETRY_RECONCILIATION §1).
  const project = await getProject(projectId);
  const config = ProjectConfigSchema.parse(project?.config ?? {});
  const geometry = resolveGeometry(config);

  // 0b. Which track produced the interior. A typeset book has no page-render
  //     rows at all, so the code below this point would block it for "missing"
  //     every page of a book that is finished.
  const { getProductionProfile } = await import('../production-profiles/registry.js');
  const track = resolveTrack(getProductionProfile(config.productionProfileId)?.bodyRenderTrack);
  if (track === 'typeset') return assembleTypesetBook(projectId, config, geometry, options);

  // 1. Expected pages, in spine order.
  const scopeChapters = options.chapters?.length
    ? Array.from(new Set(options.chapters)).sort((a, b) => a - b)
    : null;
  const pageRows = (await listPaginatedPagesForProject(projectId)).filter(
    (p) => p.section !== 'BODY' || !scopeChapters || scopeChapters.includes(p.chapterNumber),
  );
  const spine: SpinePage[] = resolveSpine(
    pageRows.map((p) => ({
      id: p.id,
      pageKey: p.pageKey,
      chapterNumber: p.chapterNumber,
      plannedPageNumber: p.plannedPageNumber,
      section: p.section,
      spineOrder: p.spineOrder,
    })),
  );
  const frontMatter = frontMatterStatus(spine);

  // 2. Book-ready (active + approved_for_book) renders, keyed by page.
  const renders = await listBookReadyRenders(projectId);
  const renderByPageId = new Map<string, BookReadyRenderRef>();
  for (const r of renders) {
    renderByPageId.set(r.pageId, {
      renderId: r.id,
      pageId: r.pageId,
      printPdfPath: r.printPdfPath,
      preflightPassed: r.preflightPassed,
      printPngPath: r.printPngPath,
    });
  }

  // 3. Pre-pass: load each present print PDF, read its dims, keep its bytes for merge.
  const storage = getProjectStorage();
  const dimsByPageId = new Map<string, PageDimsPt>();
  const bytesByPageId = new Map<string, Buffer>();
  for (const page of spine) {
    const r = renderByPageId.get(page.id);
    if (!r?.printPdfPath) continue;
    try {
      const buf = await storage.readProjectFile(r.printPdfPath);
      dimsByPageId.set(page.id, await readFirstPageDimsPt(buf));
      bytesByPageId.set(page.id, buf);
    } catch {
      // Unreadable print PDF → dims absent → gate flags it via no print output.
    }
  }

  // 4. Validate. Block on any failure.
  const validation = validateAssembly({ spine, renderByPageId, dimsByPageId, canvasIn: geometry.canvasIn });
  // Phase 0 — cover/interior sync gate. A stale cover blocks a full-book export.
  const coverBuiltForPageCount = config.publishing.coverSync?.builtForPageCount ?? null;
  const cover = coverSyncStatus({
    hasCover: Boolean(config.publishing.coverAssetPath),
    coverBuiltForPageCount,
    interiorPageCount: spine.length,
    fullBook: scopeChapters === null,
  });
  const blocked = validation.blocked || cover.stale;
  const runId = randomUUID();
  const buildSpine = (): AssemblySpineEntry[] =>
    spine.map((page, i) => {
      const r = renderByPageId.get(page.id);
      return {
        position: i + 1,
        pageKey: page.pageKey,
        renderId: r?.renderId ?? null,
        printPdfPath: r?.printPdfPath ?? null,
        printPngPath: r?.printPngPath ?? null,
      };
    });

  const baseReport = (
    interiorPdfPath: string | null,
    finalCount: number,
    interiorPdfBytes = 0,
    artifactQuality: AssemblyReport['artifactQuality'] = null,
    warnings: string[] = [],
  ): AssemblyReport => ({
    projectId,
    runId,
    track: 'rendered-pages',
    blocked,
    frontMatter,
    expectedPages: spine.length,
    assembledPages: interiorPdfPath ? finalCount : 0,
    spine: buildSpine(),
    validations: validation.checks,
    missing: validation.missing,
    preflightFailures: validation.preflightFailures,
    noPrintOutput: validation.noPrintOutput,
    dimensionFailures: validation.dimensionFailures,
    interiorPdfPath,
    interiorPdfBytes,
    artifactQuality,
    warnings: cover.stale ? [...warnings, COVER_STALE_MESSAGE] : warnings,
    finalPageCount: finalCount,
    pageCountAdvisory: pageCountAdvisory(finalCount),
    finalTrim: { trimIn: { w: geometry.trimSize.widthIn, h: geometry.trimSize.heightIn }, bleedIn: geometry.trimSize.bleedIn },
    scopeChapters,
    coverStale: cover.stale,
    coverBuiltForPageCount,
  });

  if (blocked) {
    await recordExport({ projectId, kind: 'PREMIUM_PDF', status: 'FAILED', filePath: null });
    return baseReport(null, spine.length); // page count reported for visibility; no PDF
  }

  // 5. Merge (spine order) → interior PDF → store → audit.
  const orderedBytes = spine.map((p) => bytesByPageId.get(p.id)!);
  const interior = await mergeSinglePagePdfs(orderedBytes);
  let artifactQuality: AssemblyReport['artifactQuality'] = 'PRINT_READY';
  let artifact = interior;
  let warnings: string[] = [];
  let stored;
  try {
    stored = await storage.writeProjectFile(projectId, ['exports', `interior-${runId}.pdf`], artifact);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.toLowerCase().includes('maximum allowed size')) throw err;

    const orderedPngs: Buffer[] = [];
    for (const page of spine) {
      const pngPath = renderByPageId.get(page.id)?.printPngPath;
      if (!pngPath) throw new Error(`assembly_review_fallback_missing_png:${page.pageKey}`);
      orderedPngs.push(await storage.readProjectFile(pngPath));
    }
    artifact = await assembleReviewPdfFromPrintPngs(
      orderedPngs.map((png) => ({ png })),
      { canvasIn: geometry.canvasIn },
    );
    artifactQuality = 'REVIEW_FALLBACK';
    warnings = [
      `Full print-ready interior was ${interior.length} bytes and exceeded the storage object limit.`,
      'Uploaded a compressed review proof from the same approved print pages; keep per-page print PDFs as the print-grade sources.',
    ];
    stored = await storage.writeProjectFile(projectId, ['exports', `interior-review-${runId}.pdf`], artifact);
  }
  const sha256 = createHash('sha256').update(artifact).digest('hex');
  await recordExport({
    projectId,
    kind: 'PREMIUM_PDF',
    status: 'READY',
    filePath: stored.relativePath,
    sha256,
    fileSizeBytes: artifact.length,
  });

  return baseReport(stored.relativePath, spine.length, artifact.length, artifactQuality, warnings);
}
