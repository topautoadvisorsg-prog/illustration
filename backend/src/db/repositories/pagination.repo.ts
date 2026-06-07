/**
 * Pagination v1 persistence — Stage 1.75 + Stage 1.8.
 *
 * Writes `PaginatedPage[]` to the `pages` table (overwriting whatever the
 * earlier stages may have produced) and provides reads for the API layer.
 * Approvals are written to the `page_approvals` audit table.
 *
 * Behind `PAGINATION_V1_ENABLED` — this repo is loaded but not invoked when
 * the flag is off. No existing call site reaches these functions today.
 */

import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../client.js';
import { pageApprovals, pages } from '../schema/index.js';
import type {
  PaginatedPage,
  PaginationFitStatus,
} from '../../pipeline/stage-1.75-pagination/types.js';

export type PageRow = typeof pages.$inferSelect;
export type PageApprovalRow = typeof pageApprovals.$inferSelect;

export interface PersistPaginatedPagesInput {
  projectId: string;
  /** The ordered output of `paginateProject({ ... }).pages`. */
  paginatedPages: PaginatedPage[];
}

export interface PersistPaginatedPagesResult {
  pagesWritten: number;
}

/**
 * Replace the project's `pages` rows with the freshly paginated set. Runs in
 * a single transaction. Image rows cascade away with the old pages; callers
 * are expected to refuse the replace when approved images exist (the route
 * layer is the right place for that policy — this function just writes).
 */
export async function persistPaginatedPages(
  input: PersistPaginatedPagesInput,
): Promise<PersistPaginatedPagesResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.delete(pages).where(eq(pages.projectId, input.projectId));
    if (input.paginatedPages.length === 0) {
      return { pagesWritten: 0 };
    }
    await tx.insert(pages).values(
      input.paginatedPages.map((p) => ({
        projectId: input.projectId,
        manifestId: null,
        pageKey: p.pageKey,
        chapterNumber: p.chapterNumber,
        plannedPageNumber: p.plannedPageNumber,
        layoutTemplate: p.layoutTemplate,
        imagePrompt: null,
        imagePromptSha256: null,
        status: 'PLANNED' as const,
        entryKey: p.entryKey,
        partN: p.partN,
        totalParts: p.totalParts,
        pageRole: p.pageRole,
        carriesSubject: p.carriesSubject,
        compactedEntryKeys: p.compactedEntryKeys,
        readingFieldText: p.readingFieldText,
        readingFieldChars: p.readingFieldChars,
        readingFieldWords: p.readingFieldWords,
        fitStatus: p.fitStatus,
        previewApproved: false,
        previewApprovedAt: null,
        previewApprovedBy: null,
      })),
    );
    return { pagesWritten: input.paginatedPages.length };
  });
}

/** Read every page row for a project, ordered by planned page number. */
export async function listPaginatedPagesForProject(projectId: string): Promise<PageRow[]> {
  const db = getDb();
  return db
    .select()
    .from(pages)
    .where(eq(pages.projectId, projectId))
    .orderBy(pages.plannedPageNumber);
}

/** Read one page by primary id. */
export async function getPaginatedPageById(pageId: string): Promise<PageRow | undefined> {
  const db = getDb();
  const [row] = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  return row;
}

export interface RecordPageApprovalInput {
  pageId: string;
  decision: 'APPROVED' | 'REJECTED' | 'RESET';
  reason?: string;
  decidedBy: string;
}

/**
 * Write the page's preview-approval state and append an audit-log row. Both
 * happen in one transaction so the `pages.preview_approved` flag and the
 * `page_approvals` log never disagree.
 */
export async function recordPageApproval(
  input: RecordPageApprovalInput,
): Promise<{ page: PageRow; approval: PageApprovalRow }> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const now = new Date();
    const approved = input.decision === 'APPROVED';
    const [page] = await tx
      .update(pages)
      .set({
        previewApproved: approved,
        previewApprovedAt: approved ? now : null,
        previewApprovedBy: approved ? input.decidedBy : null,
        updatedAt: now,
      })
      .where(eq(pages.id, input.pageId))
      .returning();
    if (!page) {
      throw new Error(`page_not_found:${input.pageId}`);
    }
    const [approval] = await tx
      .insert(pageApprovals)
      .values({
        pageId: input.pageId,
        decision: input.decision,
        reason: input.reason ?? null,
        decidedBy: input.decidedBy,
        decidedAt: now,
      })
      .returning();
    if (!approval) {
      throw new Error('failed_to_record_approval');
    }
    return { page, approval };
  });
}

export interface PaginationReport {
  projectId: string;
  totalPages: number;
  openers: number;
  continuations: number;
  compacted: number;
  fitDistribution: Record<PaginationFitStatus, number>;
  approvedPages: number;
  pendingApproval: number;
  perChapter: Array<{
    chapterNumber: number;
    pages: number;
    approvedPages: number;
    fitDistribution: Record<PaginationFitStatus, number>;
  }>;
}

const EMPTY_FIT: Record<PaginationFitStatus, number> = {
  PENDING: 0,
  FITS: 0,
  TIGHT: 0,
  OVERFLOW: 0,
  UNDERFILL: 0,
};

/** Aggregate read for the Pagination Report endpoint. Single query + JS aggregation. */
export async function getPaginationReport(projectId: string): Promise<PaginationReport> {
  const rows = await listPaginatedPagesForProject(projectId);

  let openers = 0;
  let continuations = 0;
  let compacted = 0;
  let approvedPages = 0;
  const fitDistribution: Record<PaginationFitStatus, number> = { ...EMPTY_FIT };
  const perChapter = new Map<number, {
    chapterNumber: number;
    pages: number;
    approvedPages: number;
    fitDistribution: Record<PaginationFitStatus, number>;
  }>();

  for (const row of rows) {
    const key = row.fitStatus as PaginationFitStatus;
    fitDistribution[key] = (fitDistribution[key] ?? 0) + 1;
    if (row.pageRole === 'opener') openers += 1;
    else if (row.pageRole === 'continuation') continuations += 1;
    else if (row.pageRole === 'compacted') compacted += 1;
    if (row.previewApproved) approvedPages += 1;

    let chapter = perChapter.get(row.chapterNumber);
    if (!chapter) {
      chapter = {
        chapterNumber: row.chapterNumber,
        pages: 0,
        approvedPages: 0,
        fitDistribution: { ...EMPTY_FIT },
      };
      perChapter.set(row.chapterNumber, chapter);
    }
    chapter.pages += 1;
    chapter.fitDistribution[key] = (chapter.fitDistribution[key] ?? 0) + 1;
    if (row.previewApproved) chapter.approvedPages += 1;
  }

  return {
    projectId,
    totalPages: rows.length,
    openers,
    continuations,
    compacted,
    fitDistribution,
    approvedPages,
    pendingApproval: rows.length - approvedPages,
    perChapter: Array.from(perChapter.values()).sort((a, b) => a.chapterNumber - b.chapterNumber),
  };
}

/**
 * Count pages in this project whose role is opener/compacted AND status is
 * APPROVED or PRINT_READY — i.e. pages whose work would be destroyed by a
 * destructive `mode: 'replace'` repaginate. Used by the route layer for the
 * approval-protection check.
 */
export async function countApprovedPages(projectId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(pages)
    .where(
      and(
        eq(pages.projectId, projectId),
        sql`status IN ('APPROVED','PRINT_READY')`,
      ),
    );
  return Number(row?.count ?? 0);
}
