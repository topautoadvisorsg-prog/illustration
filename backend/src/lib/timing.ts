/**
 * Generic performance-timing instrumentation — reuses the error-telemetry
 * pipeline's shape (docs/ERROR_HANDLING_ARCHITECTURE.md §4) but for
 * operation duration/success instead of translated errors. See
 * backend/src/db/repositories/operation-events.repo.ts for persistence and
 * the aggregate report.
 *
 * Only Breakdown is wired up today (the POST /api/projects/:id/manifests
 * route) as a concrete demonstration — pagination/render/review timing is
 * real follow-up work, not attempted wholesale in this pass. Wiring a new
 * stage is one `timeOperation()` call around the existing work, no new
 * plumbing needed.
 */
import { logger } from './logger.js';

export type OperationEventSink = (event: { operation: string; projectId?: string; durationMs: number; success: boolean }) => void;

let sink: OperationEventSink = () => {};

/** Called once at server startup (server.ts) to wire persistence — mirrors
 *  registerErrorHandler's sink parameter, but timing instrumentation can be
 *  called from deep inside the pipeline (not just route handlers), so it's
 *  a module-level setter instead of a per-call parameter. */
export function setOperationEventSink(newSink: OperationEventSink): void {
  sink = newSink;
}

/**
 * Wraps `fn`, measuring wall-clock duration and recording success/failure
 * through the configured sink — regardless of whether `fn` throws. Never
 * changes `fn`'s behavior: a thrown error still propagates normally, timing
 * is purely observational.
 */
export async function timeOperation<T>(operation: string, projectId: string | undefined, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  let success = true;
  try {
    return await fn();
  } catch (err) {
    success = false;
    throw err;
  } finally {
    const durationMs = Math.round(performance.now() - start);
    logger.info({ event: 'operation_timing', operation, projectId, durationMs, success }, 'operation timed');
    try {
      sink({ operation, projectId, durationMs, success });
    } catch (err) {
      logger.warn({ err }, 'operation-timing telemetry sink failed');
    }
  }
}
