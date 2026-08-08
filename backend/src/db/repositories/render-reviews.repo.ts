/**
 * Forensic review verdicts, stored against ONE render.
 *
 * Append-only. Recording a new verdict never edits or deletes an old one, so
 * the full review history of a render survives, including verdicts that were
 * later contradicted. A verdict is evidence about a specific image; erasing it
 * would destroy the audit trail that tells an operator why a page was ever
 * considered safe.
 *
 * The stale-review protection is structural rather than a rule anyone has to
 * remember: rows key on `render_id`. A re-render produces a new render id, that
 * render has no rows, and it therefore reads as UNREVIEWED. There is no code
 * path that can carry an approval from one render to another.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';

import { getDb } from '../client.js';
import { renderReviews, wholePageRenders } from '../schema/index.js';

export type RenderReviewStatus = 'APPROVED' | 'ISSUE_FOUND' | 'UNCERTAIN';
export type RenderReviewMethod = 'OPERATOR_MANUAL' | 'AI_CHAT' | 'AI_API';

export interface RecordReviewInput {
  renderId: string;
  projectId: string;
  status: RenderReviewStatus;
  method: RenderReviewMethod;
  findings?: unknown;
  notes?: string | null;
  reviewedBy: string;
  reviewerLabel?: string | null;
}

/** Insert a verdict. Returns the new row id. */
export async function recordRenderReview(input: RecordReviewInput): Promise<string> {
  const db = getDb();
  // The render must belong to the project it claims — otherwise a verdict could
  // be filed against another book's page.
  const [render] = await db
    .select({ id: wholePageRenders.id })
    .from(wholePageRenders)
    .where(and(eq(wholePageRenders.id, input.renderId), eq(wholePageRenders.projectId, input.projectId)))
    .limit(1);
  if (!render) throw new Error(`render ${input.renderId} not found in project ${input.projectId}`);

  const [row] = await db
    .insert(renderReviews)
    .values({
      renderId: input.renderId,
      projectId: input.projectId,
      status: input.status,
      method: input.method,
      findings: (input.findings ?? null) as never,
      notes: input.notes ?? null,
      reviewedBy: input.reviewedBy,
      reviewerLabel: input.reviewerLabel ?? null,
    })
    .returning({ id: renderReviews.id });
  return row!.id;
}

export interface RenderReviewRow {
  id: string;
  renderId: string;
  status: RenderReviewStatus;
  method: RenderReviewMethod;
  findings: unknown;
  notes: string | null;
  reviewedBy: string;
  reviewerLabel: string | null;
  reviewedAt: Date;
}

/** Full history for one render, newest first. */
export async function listRenderReviews(renderId: string): Promise<RenderReviewRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(renderReviews)
    .where(eq(renderReviews.renderId, renderId))
    .orderBy(desc(renderReviews.reviewedAt));
  return rows as RenderReviewRow[];
}

/**
 * Current verdict per render for a set of renders.
 * "Current" is the most recent row. Renders with no rows are absent from the
 * map, which the caller reads as UNREVIEWED — the safe default.
 */
export async function latestReviewByRender(renderIds: string[]): Promise<Map<string, RenderReviewRow>> {
  const out = new Map<string, RenderReviewRow>();
  if (renderIds.length === 0) return out;
  const db = getDb();
  const rows = (await db
    .select()
    .from(renderReviews)
    .where(inArray(renderReviews.renderId, renderIds))
    .orderBy(desc(renderReviews.reviewedAt))) as RenderReviewRow[];
  for (const r of rows) if (!out.has(r.renderId)) out.set(r.renderId, r);
  return out;
}
