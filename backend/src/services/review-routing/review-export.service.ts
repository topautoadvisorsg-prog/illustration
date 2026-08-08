/**
 * Review export IO — turns an ExportPlan into files the operator can open.
 *
 * Produces both shapes deliberately:
 *  - a ZIP, because that is the only way a browser can hand a folder tree to a
 *    user in one action;
 *  - a folder on disk, because the operator runs this locally and dragging
 *    files straight into a chat window is the actual workflow.
 *
 * Never touches approval state, never re-renders, never calls a paid model.
 */
import JSZip from 'jszip';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { pages, projects, wholePageRenders } from '../../db/schema/index.js';
import { latestReviewByRender } from '../../db/repositories/render-reviews.repo.js';
import { getProjectStorage } from '../storage/project-storage.js';
import { DEFAULT_HIGH_TEXT_WORD_THRESHOLD, type ReviewRoutingPolicy } from './policy.js';
import {
  DEFAULT_BATCH_SIZE,
  planReviewExport,
  type ExportPlan,
  type ExportSelection,
  type ExportablePage,
  type ReviewStatus,
} from './export.js';

/**
 * Gather every page with its newest usable render and current review status.
 *
 * TWO queries, not two per page. The first version of this ran a pair of
 * queries inside the page loop, which on a 269-page book meant 538 sequential
 * round trips to a hosted database; it took just under a minute and then died
 * on ECONNRESET. Bulk-fetch and group in memory.
 */
export async function loadExportablePages(projectId: string): Promise<ExportablePage[]> {
  const db = getDb();
  const [pageRows, renderRows] = await Promise.all([
    db.select().from(pages).where(eq(pages.projectId, projectId)),
    db
      .select()
      .from(wholePageRenders)
      .where(eq(wholePageRenders.projectId, projectId))
      .orderBy(desc(wholePageRenders.version)),
  ]);

  // Highest version wins within each group because the query is already sorted.
  const approvedByPage = new Map<string, (typeof renderRows)[number]>();
  const renderedByPage = new Map<string, (typeof renderRows)[number]>();
  for (const r of renderRows) {
    if (r.approvedForBook && !approvedByPage.has(r.pageId)) approvedByPage.set(r.pageId, r);
    if (r.status === 'RENDERED' && !renderedByPage.has(r.pageId)) renderedByPage.set(r.pageId, r);
  }

  const out: ExportablePage[] = [];
  const renderIds: string[] = [];
  for (const p of pageRows as any[]) {
    // An operator-approved render supersedes a newer unapproved one for review
    // purposes: it is the artefact that would go to print.
    const chosen = approvedByPage.get(p.id) ?? renderedByPage.get(p.id);
    if (chosen?.id) renderIds.push(chosen.id);
    out.push({
      pageId: p.id,
      pageKey: p.pageKey,
      renderId: chosen?.id ?? null,
      renderVersion: chosen?.version ?? null,
      imagePath: chosen?.imagePath ?? null,
      chapterNumber: p.chapterNumber ?? null,
      plannedPageNumber: p.plannedPageNumber ?? null,
      spineOrder: p.spineOrder ?? null,
      readableWords: p.readableWords ?? null,
      textBlocks: p.textBlocks ?? null,
      layoutTemplate: p.layoutTemplate ?? null,
      reviewRouteOverride: p.reviewRouteOverride ?? null,
      reviewEscalationReason: p.reviewEscalationReason ?? null,
      reviewStatus: 'UNREVIEWED',
    });
  }

  // Attach the current verdict for the exact render chosen above. A render with
  // no verdict stays UNREVIEWED — that is the stale-review protection working.
  const latest = await latestReviewByRender(renderIds);
  for (const p of out) {
    const v = p.renderId ? latest.get(p.renderId) : undefined;
    p.reviewStatus = (v?.status ?? 'UNREVIEWED') as ReviewStatus;
  }
  return out;
}

export async function policyForProject(projectId: string): Promise<ReviewRoutingPolicy> {
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return {
    highTextWordThreshold:
      (project as { highTextWordThreshold?: number | null } | undefined)?.highTextWordThreshold ??
      DEFAULT_HIGH_TEXT_WORD_THRESHOLD,
  };
}

export async function buildExportPlan(
  projectId: string,
  selection: ExportSelection,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<ExportPlan> {
  const [pagesList, policy] = await Promise.all([loadExportablePages(projectId), policyForProject(projectId)]);
  return planReviewExport(projectId, pagesList, selection, policy, { batchSize });
}

const README = (plan: ExportPlan): string =>
  [
    'FORENSIC REVIEW EXPORT',
    '',
    `project      : ${plan.projectId}`,
    `exported     : ${plan.exportedAt}`,
    `routing rule : >= ${plan.threshold} canonical source words -> AI REVIEW`,
    `batch size   : ${plan.batchSize}`,
    `pages        : ${plan.counts.total} (${plan.counts.aiReview} AI review, ${plan.counts.manualReview} manual)`,
    '',
    'Filenames are <pageKey>__v<renderVersion>__<renderId prefix>.png so a verdict',
    'can always be traced back to the exact image that was reviewed.',
    '',
    'manifest.json maps every file back to its platform records. Keep it with the',
    'images; without it a set of verdicts cannot be attributed.',
    '',
    'Upload one BATCH folder at a time, with the official forensic prompt.',
  ].join('\n');

/** Materialise the plan as a ZIP buffer. */
export async function exportToZip(plan: ExportPlan): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ ...plan, batches: undefined }, null, 2));
  zip.file('README.txt', README(plan));
  const storage = getProjectStorage();
  for (const batch of plan.batches) {
    for (const entry of batch.entries) {
      const page = await pageImage(storage, plan.projectId, entry.renderId);
      if (page) zip.file(entry.file, page);
    }
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 1 } });
}

/** Materialise the plan as a folder tree on disk. Returns the root path. */
export async function exportToFolder(plan: ExportPlan, rootDir: string): Promise<string> {
  mkdirSync(rootDir, { recursive: true });
  writeFileSync(path.join(rootDir, 'manifest.json'), JSON.stringify({ ...plan, batches: undefined }, null, 2), 'utf8');
  writeFileSync(path.join(rootDir, 'README.txt'), README(plan), 'utf8');
  const storage = getProjectStorage();
  for (const batch of plan.batches) {
    mkdirSync(path.join(rootDir, batch.dir), { recursive: true });
    for (const entry of batch.entries) {
      const buf = await pageImage(storage, plan.projectId, entry.renderId);
      if (buf) writeFileSync(path.join(rootDir, entry.file), buf);
    }
  }
  return rootDir;
}

async function pageImage(
  storage: ReturnType<typeof getProjectStorage>,
  projectId: string,
  renderId: string,
): Promise<Buffer | null> {
  const db = getDb();
  const [r] = await db.select().from(wholePageRenders).where(eq(wholePageRenders.id, renderId)).limit(1);
  if (!r?.imagePath) return null;
  try {
    return await storage.readProjectFile(r.imagePath);
  } catch {
    return null; // a missing object must not abort the whole export
  }
}
