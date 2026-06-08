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
import { SPACING } from '../publishing-standard/index.js';
import { listPaginatedPagesForProject } from '../../db/repositories/pagination.repo.js';
import { listBookReadyRenders } from '../../db/repositories/whole-page-render.repo.js';
import { recordExport } from '../../db/repositories/exports.repo.js';
import { getProjectStorage } from '../../services/storage/project-storage.js';
import { frontMatterStatus, resolveSpine, type SpinePage } from './spine-order.js';
import {
  pageCountAdvisory,
  validateAssembly,
  type BookReadyRenderRef,
  type PageDimsPt,
  type AssemblyValidation,
} from './validate-assembly.js';
import { mergeSinglePagePdfs, readFirstPageDimsPt } from './pdf-merge.js';

export interface AssemblySpineEntry {
  position: number;
  pageKey: string;
  renderId: string | null;
  printPdfPath: string | null;
}

export interface AssemblyReport {
  projectId: string;
  runId: string;
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
  finalPageCount: number;
  pageCountAdvisory: ReturnType<typeof pageCountAdvisory>;
  finalTrim: { trimIn: { w: number; h: number }; bleedIn: number };
}

export async function assembleBook(projectId: string): Promise<AssemblyReport> {
  // 1. Expected pages, in spine order.
  const pageRows = await listPaginatedPagesForProject(projectId);
  const spine: SpinePage[] = resolveSpine(
    pageRows.map((p) => ({
      id: p.id,
      pageKey: p.pageKey,
      chapterNumber: p.chapterNumber,
      plannedPageNumber: p.plannedPageNumber,
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
  const validation = validateAssembly({ spine, renderByPageId, dimsByPageId });
  const runId = randomUUID();
  const buildSpine = (): AssemblySpineEntry[] =>
    spine.map((page, i) => {
      const r = renderByPageId.get(page.id);
      return { position: i + 1, pageKey: page.pageKey, renderId: r?.renderId ?? null, printPdfPath: r?.printPdfPath ?? null };
    });

  const baseReport = (interiorPdfPath: string | null, finalCount: number): AssemblyReport => ({
    projectId,
    runId,
    blocked: validation.blocked,
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
    finalPageCount: finalCount,
    pageCountAdvisory: pageCountAdvisory(finalCount),
    finalTrim: { trimIn: { w: SPACING.trimIn.w, h: SPACING.trimIn.h }, bleedIn: SPACING.bleedIn },
  });

  if (validation.blocked) {
    await recordExport({ projectId, kind: 'PREMIUM_PDF', status: 'FAILED', filePath: null });
    return baseReport(null, spine.length); // page count reported for visibility; no PDF
  }

  // 5. Merge (spine order) → interior PDF → store → audit.
  const orderedBytes = spine.map((p) => bytesByPageId.get(p.id)!);
  const interior = await mergeSinglePagePdfs(orderedBytes);
  const sha256 = createHash('sha256').update(interior).digest('hex');
  const stored = await storage.writeProjectFile(projectId, ['exports', `interior-${runId}.pdf`], interior);
  await recordExport({
    projectId,
    kind: 'PREMIUM_PDF',
    status: 'READY',
    filePath: stored.relativePath,
    sha256,
    fileSizeBytes: interior.length,
  });

  return baseReport(stored.relativePath, spine.length);
}
