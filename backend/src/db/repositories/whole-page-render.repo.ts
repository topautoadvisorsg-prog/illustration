/**
 * Whole-page render persistence (AI-first pipeline).
 *
 * Mirrors the `images` repo's versioning model but is a separate product:
 * the typography is baked into the generated image. NEVER touches legacy
 * `images` / `pages.status` state.
 *
 * Selection model (operator decision):
 *   - status APPROVED       : operator likes this version (many allowed).
 *   - approved_for_book+active : THE version for the book (one per page).
 * Book assembly (move #3) reads only (active=true AND approved_for_book=true).
 */

import { createHash } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../client.js';
import { wholePageRenders } from '../schema/index.js';
import type { WholePageSpec } from '../../pipeline/experimental/whole-page-render/types.js';

export type WholePageRenderRow = typeof wholePageRenders.$inferSelect;

/** Soft cap from SPEC §4 — warn after this many attempts, never block. */
export const ATTEMPT_SOFT_CAP = 5;

export interface CreateRenderRowInput {
  pageId: string;
  projectId: string;
  specJson: WholePageSpec;
  assembledPrompt: string;
  standardVersion: string;
}

export interface CreateRenderRowResult {
  renderId: string;
  version: number;
  attempts: number;
  softCapExceeded: boolean;
}

/**
 * Insert a new QUEUED render at version = max(version)+1 for the page.
 *
 * Concurrency: under Postgres READ COMMITTED two simultaneous submits for the
 * same page can both read the same max version and try to insert the same N+1.
 * The unique (page_id, version) index makes the loser FAIL CLEANLY with a
 * constraint error rather than corrupt the sequence — never two rows at the
 * same version. For v1 (synchronous, single operator) a true serialization
 * lock (SELECT ... FOR UPDATE) is unnecessary; the unique index is the safety
 * net. Revisit if/when the async queue lands and parallel auto-retries appear.
 */
export async function createRenderRow(
  input: CreateRenderRowInput,
): Promise<CreateRenderRowResult> {
  const db = getDb();
  const promptSha256 = createHash('sha256').update(input.assembledPrompt, 'utf8').digest('hex');
  return db.transaction(async (tx) => {
    const [agg] = await tx
      .select({
        maxVersion: sql<number>`COALESCE(MAX(${wholePageRenders.version}), 0)`,
      })
      .from(wholePageRenders)
      .where(eq(wholePageRenders.pageId, input.pageId));
    const version = Number(agg?.maxVersion ?? 0) + 1;
    // One row == one attempt for this page, so attempts == version.
    const attempts = version;
    const [row] = await tx
      .insert(wholePageRenders)
      .values({
        pageId: input.pageId,
        projectId: input.projectId,
        version,
        status: 'QUEUED',
        specJson: input.specJson,
        assembledPrompt: input.assembledPrompt,
        promptSha256,
        standardVersion: input.standardVersion,
        attempts,
      })
      .returning({ id: wholePageRenders.id });
    if (!row) throw new Error('failed_to_create_render_row');
    return {
      renderId: row.id,
      version,
      attempts,
      softCapExceeded: attempts > ATTEMPT_SOFT_CAP,
    };
  });
}

export async function markRendering(renderId: string): Promise<void> {
  const db = getDb();
  await db
    .update(wholePageRenders)
    .set({ status: 'RENDERING', updatedAt: new Date() })
    .where(eq(wholePageRenders.id, renderId));
}

export interface MarkRenderedInput {
  imagePath: string;
  specPath: string;
  promptPath: string;
  widthPx: number;
  heightPx: number;
  model: string;
}

export async function markRendered(renderId: string, out: MarkRenderedInput): Promise<void> {
  const db = getDb();
  await db
    .update(wholePageRenders)
    .set({
      status: 'RENDERED',
      imagePath: out.imagePath,
      specPath: out.specPath,
      promptPath: out.promptPath,
      widthPx: out.widthPx,
      heightPx: out.heightPx,
      model: out.model,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(wholePageRenders.id, renderId));
}

export async function markFailed(renderId: string, errorMessage: string): Promise<void> {
  const db = getDb();
  await db
    .update(wholePageRenders)
    .set({ status: 'FAILED', errorMessage: errorMessage.slice(0, 2000), updatedAt: new Date() })
    .where(eq(wholePageRenders.id, renderId));
}

/** Operator marks a version APPROVED. Many versions may be APPROVED. Does NOT
 *  touch active / approved_for_book — that's a separate select-for-book step. */
export async function approveRender(renderId: string, decidedBy: string): Promise<WholePageRenderRow> {
  const db = getDb();
  const [row] = await db
    .update(wholePageRenders)
    .set({ status: 'APPROVED', decidedBy, decidedAt: new Date(), updatedAt: new Date() })
    .where(eq(wholePageRenders.id, renderId))
    .returning();
  if (!row) throw new Error(`render_not_found:${renderId}`);
  return row;
}

/**
 * Select THE version for the book. Requires the render to be APPROVED. Sets
 * approved_for_book=true + active=true on this version and clears both on every
 * sibling version of the same page — exactly one book pick per page.
 */
export async function selectForBook(renderId: string, decidedBy: string): Promise<WholePageRenderRow> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(wholePageRenders)
      .where(eq(wholePageRenders.id, renderId))
      .limit(1);
    if (!target) throw new Error(`render_not_found:${renderId}`);
    if (target.status !== 'APPROVED') {
      throw new Error(`render_not_approved:${renderId}:${target.status}`);
    }
    // Clear book selection on all versions of this page.
    await tx
      .update(wholePageRenders)
      .set({ approvedForBook: false, active: false, updatedAt: new Date() })
      .where(eq(wholePageRenders.pageId, target.pageId));
    // Set it on the target.
    const [row] = await tx
      .update(wholePageRenders)
      .set({ approvedForBook: true, active: true, decidedBy, decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(wholePageRenders.id, renderId))
      .returning();
    if (!row) throw new Error(`render_not_found:${renderId}`);
    return row;
  });
}

export async function rejectRender(
  renderId: string,
  decidedBy: string,
  reason?: string,
): Promise<WholePageRenderRow> {
  const db = getDb();
  const [row] = await db
    .update(wholePageRenders)
    .set({
      status: 'REJECTED',
      // A rejected version cannot remain the book pick.
      approvedForBook: false,
      active: false,
      rejectionReason: reason ?? null,
      decidedBy,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(wholePageRenders.id, renderId))
    .returning();
  if (!row) throw new Error(`render_not_found:${renderId}`);
  return row;
}

export async function getRenderById(renderId: string): Promise<WholePageRenderRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(wholePageRenders)
    .where(eq(wholePageRenders.id, renderId))
    .limit(1);
  return row;
}

export async function listRendersForPage(pageId: string): Promise<WholePageRenderRow[]> {
  const db = getDb();
  return db
    .select()
    .from(wholePageRenders)
    .where(eq(wholePageRenders.pageId, pageId))
    .orderBy(desc(wholePageRenders.version));
}

export async function getActiveRenderForPage(pageId: string): Promise<WholePageRenderRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(wholePageRenders)
    .where(and(eq(wholePageRenders.pageId, pageId), eq(wholePageRenders.active, true)))
    .limit(1);
  return row;
}

/** Book-assembly read (move #3): the chosen version for every page. */
export async function listBookReadyRenders(projectId: string): Promise<WholePageRenderRow[]> {
  const db = getDb();
  return db
    .select()
    .from(wholePageRenders)
    .where(
      and(
        eq(wholePageRenders.projectId, projectId),
        eq(wholePageRenders.active, true),
        eq(wholePageRenders.approvedForBook, true),
      ),
    );
}

export interface ProjectRenderSummary {
  projectId: string;
  total: number;
  byStatus: Record<string, number>;
  bookReady: number;
  rows: WholePageRenderRow[];
}

export async function getProjectRenderSummary(projectId: string): Promise<ProjectRenderSummary> {
  const db = getDb();
  const rows = await db
    .select()
    .from(wholePageRenders)
    .where(eq(wholePageRenders.projectId, projectId))
    .orderBy(desc(wholePageRenders.createdAt));
  const byStatus: Record<string, number> = {};
  let bookReady = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.active && r.approvedForBook) bookReady += 1;
  }
  return { projectId, total: rows.length, byStatus, bookReady, rows };
}
