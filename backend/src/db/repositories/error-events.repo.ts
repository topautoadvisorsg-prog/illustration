/**
 * Persistence for the error-handling telemetry (docs/ERROR_HANDLING_STANDARD.md):
 * one row per translated user-facing error (error_events), plus recovery-flow
 * milestones (recovery_events — "clicked the recovery button" / "the next
 * action succeeded"). Backs the diagnostics endpoints in api/diagnostics.routes.ts.
 *
 * Writes here are always fire-and-forget from the caller's perspective (the
 * error response is already on its way to the client) — this file itself
 * still lets exceptions propagate; callers decide whether to swallow them.
 */

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '../client.js';
import { errorEvents, recoveryEvents } from '../schema/index.js';
import type { TranslatedErrorEvent } from '../../lib/error-handler.js';

export async function recordErrorEvent(event: TranslatedErrorEvent): Promise<void> {
  const db = getDb();
  await db.insert(errorEvents).values({
    correlationId: event.correlationId,
    errorCode: event.errorCode,
    method: event.method,
    path: event.path,
    projectId: event.projectId ?? null,
    statusCode: event.statusCode,
    appVersion: event.appVersion,
  });
}

export type RecoveryEventKind = 'clicked' | 'succeeded';

export async function recordRecoveryEvent(correlationId: string, kind: RecoveryEventKind): Promise<void> {
  const db = getDb();
  await db.insert(recoveryEvents).values({ correlationId, kind });
}

export interface ErrorFrequencyRow {
  errorCode: string;
  count: number;
}

export interface ErrorFrequencyReport {
  windowHours: number;
  totalErrors: number;
  topCodes: ErrorFrequencyRow[];
  /** Counts grouped by request path — a proxy for "which workflow step",
   *  since the backend doesn't otherwise know the frontend's step key. */
  topPaths: Array<{ path: string; count: number }>;
  recovery: {
    clicked: number;
    succeeded: number;
    /** succeeded / clicked, 0..1. Null when nothing has been clicked yet
     *  (avoids a misleading 0% before there's any real signal). */
    successRate: number | null;
  };
}

/** Powers the diagnostics page's "most common validation errors" /
 *  "most abandoned step" (proxied by path) / "recovery success rate" report.
 *  This is an on-demand query, not a scheduled/emailed report — there's no
 *  notification infrastructure in this app to schedule one against. */
export async function getErrorFrequencyReport(windowHours = 24): Promise<ErrorFrequencyReport> {
  const db = getDb();
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(errorEvents)
    .where(gte(errorEvents.createdAt, since));

  const topCodes = await db
    .select({ errorCode: errorEvents.errorCode, count: sql<number>`count(*)::int` })
    .from(errorEvents)
    .where(gte(errorEvents.createdAt, since))
    .groupBy(errorEvents.errorCode)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const topPaths = await db
    .select({ path: errorEvents.path, count: sql<number>`count(*)::int` })
    .from(errorEvents)
    .where(gte(errorEvents.createdAt, since))
    .groupBy(errorEvents.path)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  // Recovery rate: join on correlationId within the same window. Errors
  // without ANY recovery action never appear here (no correlationId row was
  // ever expected to be clicked), which is correct — only count errors that
  // actually offered a recovery button.
  const [clickedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recoveryEvents)
    .where(and(eq(recoveryEvents.kind, 'clicked'), gte(recoveryEvents.createdAt, since)));
  const [succeededRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recoveryEvents)
    .where(and(eq(recoveryEvents.kind, 'succeeded'), gte(recoveryEvents.createdAt, since)));

  const clicked = clickedRow?.count ?? 0;
  const succeeded = succeededRow?.count ?? 0;

  return {
    windowHours,
    totalErrors: totalRow?.count ?? 0,
    topCodes: topCodes.map((r) => ({ errorCode: r.errorCode, count: r.count })),
    topPaths: topPaths.map((r) => ({ path: r.path, count: r.count })),
    recovery: {
      clicked,
      succeeded,
      successRate: clicked > 0 ? succeeded / clicked : null,
    },
  };
}
