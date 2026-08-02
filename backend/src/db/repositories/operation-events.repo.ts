/**
 * Persistence for operation-timing telemetry (backend/src/lib/timing.ts) —
 * see docs/ERROR_HANDLING_ARCHITECTURE.md §4. Same shape as
 * error-events.repo.ts, reusing the same telemetry pipeline for performance
 * instead of errors.
 */
import { desc, gte, sql } from 'drizzle-orm';
import { getDb } from '../client.js';
import { operationEvents } from '../schema/index.js';

export interface OperationEvent {
  operation: string;
  projectId?: string;
  durationMs: number;
  success: boolean;
}

export async function recordOperationEvent(event: OperationEvent): Promise<void> {
  const db = getDb();
  await db.insert(operationEvents).values({
    operation: event.operation,
    projectId: event.projectId ?? null,
    durationMs: event.durationMs,
    success: event.success,
  });
}

export interface OperationTimingRow {
  operation: string;
  count: number;
  avgDurationMs: number;
  successRate: number;
}

export interface OperationTimingReport {
  windowHours: number;
  operations: OperationTimingRow[];
}

export async function getOperationTimingReport(windowHours = 24): Promise<OperationTimingReport> {
  const db = getDb();
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const rows = await db
    .select({
      operation: operationEvents.operation,
      count: sql<number>`count(*)::int`,
      avgDurationMs: sql<number>`avg(${operationEvents.durationMs})`,
      successRate: sql<number>`avg(case when ${operationEvents.success} then 1.0 else 0.0 end)`,
    })
    .from(operationEvents)
    .where(gte(operationEvents.createdAt, since))
    .groupBy(operationEvents.operation)
    .orderBy(desc(sql`count(*)`));

  return {
    windowHours,
    operations: rows.map((r) => ({
      operation: r.operation,
      count: r.count,
      avgDurationMs: Math.round(Number(r.avgDurationMs)),
      successRate: Number(r.successRate),
    })),
  };
}
