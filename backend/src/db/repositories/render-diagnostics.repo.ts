/**
 * Read-only aggregates over whole_page_renders for the operator diagnostics
 * page (docs/ERROR_HANDLING_STANDARD.md §6 "health dashboard"). No new
 * instrumentation — these are approximations from timestamps the table
 * already has:
 *   - "render time" = updatedAt - createdAt for a finished render row. The
 *     table doesn't have a distinct "render started"/"render finished" pair,
 *     so this is a proxy, not a precisely instrumented duration.
 *   - "approval time" = decidedAt - createdAt, which IS a real, purpose-built
 *     timestamp (decidedAt is set exactly when an operator approves/rejects).
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../client.js';
import { wholePageRenders } from '../schema/index.js';

export interface RenderDiagnostics {
  windowHours: number;
  totalRenders: number;
  failedRenders: number;
  /** Seconds, or null if no finished renders in the window. Approximate — see file header. */
  avgRenderSeconds: number | null;
  /** Seconds, or null if nothing was decided in the window. */
  avgApprovalSeconds: number | null;
}

export async function getRenderDiagnostics(windowHours = 24): Promise<RenderDiagnostics> {
  const db = getDb();
  const since = sql`now() - (${windowHours} || ' hours')::interval`;

  const [totalsRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${wholePageRenders.status} = 'FAILED')::int`,
    })
    .from(wholePageRenders)
    .where(sql`${wholePageRenders.createdAt} >= ${since}`);

  const [renderTimeRow] = await db
    .select({
      avgSeconds: sql<number | null>`avg(extract(epoch from (${wholePageRenders.updatedAt} - ${wholePageRenders.createdAt})))`,
    })
    .from(wholePageRenders)
    .where(sql`${wholePageRenders.status} IN ('RENDERED','APPROVED') AND ${wholePageRenders.updatedAt} >= ${since}`);

  const [approvalTimeRow] = await db
    .select({
      avgSeconds: sql<number | null>`avg(extract(epoch from (${wholePageRenders.decidedAt} - ${wholePageRenders.createdAt})))`,
    })
    .from(wholePageRenders)
    .where(sql`${wholePageRenders.decidedAt} IS NOT NULL AND ${wholePageRenders.decidedAt} >= ${since}`);

  return {
    windowHours,
    totalRenders: totalsRow?.total ?? 0,
    failedRenders: totalsRow?.failed ?? 0,
    avgRenderSeconds: renderTimeRow?.avgSeconds != null ? Number(renderTimeRow.avgSeconds) : null,
    avgApprovalSeconds: approvalTimeRow?.avgSeconds != null ? Number(approvalTimeRow.avgSeconds) : null,
  };
}
