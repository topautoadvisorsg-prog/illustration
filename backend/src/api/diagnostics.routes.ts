/**
 * Internal diagnostics — error/recovery telemetry aggregates for the
 * operator diagnostics page (docs/ERROR_HANDLING_STANDARD.md). Gated by the
 * same CONSOLE_PASSWORD as every other route; not a customer-facing surface,
 * just an on-demand report (no scheduled/emailed reporting exists here).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getErrorFrequencyReport, recordRecoveryEvent } from '../db/repositories/error-events.repo.js';
import { getRenderDiagnostics } from '../db/repositories/render-diagnostics.repo.js';
import { getOperationTimingReport } from '../db/repositories/operation-events.repo.js';
import { allErrorRegistryEntries, ERROR_REGISTRY_VERSION } from '../lib/error-registry.js';

const ErrorFrequencyResponseSchema = z.object({
  windowHours: z.number(),
  registryVersion: z.string(),
  totalErrors: z.number(),
  topCodes: z.array(z.object({ errorCode: z.string(), count: z.number() })),
  topPaths: z.array(z.object({ path: z.string(), count: z.number() })),
  recovery: z.object({
    clicked: z.number(),
    succeeded: z.number(),
    successRate: z.number().nullable(),
  }),
});

const ErrorRegistryEntrySchema = z.object({
  code: z.string(),
  title: z.string(),
  friendlyMessage: z.string(),
  technicalCause: z.string(),
  recovery: z.string(),
  step: z.string(),
  severity: z.string(),
});

const ErrorRegistryResponseSchema = z.object({
  version: z.string(),
  entries: z.array(ErrorRegistryEntrySchema),
});

const RenderDiagnosticsResponseSchema = z.object({
  windowHours: z.number(),
  totalRenders: z.number(),
  failedRenders: z.number(),
  avgRenderSeconds: z.number().nullable(),
  avgApprovalSeconds: z.number().nullable(),
});

const RecoveryEventBodySchema = z.object({
  correlationId: z.string(),
  kind: z.enum(['clicked', 'succeeded']),
});

const OperationTimingResponseSchema = z.object({
  windowHours: z.number(),
  operations: z.array(z.object({
    operation: z.string(),
    count: z.number(),
    avgDurationMs: z.number(),
    successRate: z.number(),
  })),
});

export async function registerDiagnosticsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/diagnostics/errors',
    {
      schema: {
        querystring: z.object({ hours: z.coerce.number().int().positive().max(24 * 90).optional() }),
        response: { 200: ErrorFrequencyResponseSchema },
      },
    },
    async (request) => {
      const { hours } = request.query as { hours?: number };
      const report = await getErrorFrequencyReport(hours ?? 24);
      return { ...report, registryVersion: ERROR_REGISTRY_VERSION };
    },
  );

  // The registry as JSON — the same data as docs/ERROR_REGISTRY.md, for
  // future tooling/automation that wants to consume it programmatically
  // instead of parsing markdown.
  app.get(
    '/api/diagnostics/registry',
    { schema: { response: { 200: ErrorRegistryResponseSchema } } },
    async () => ({ version: ERROR_REGISTRY_VERSION, entries: allErrorRegistryEntries() }),
  );

  app.get(
    '/api/diagnostics/renders',
    {
      schema: {
        querystring: z.object({ hours: z.coerce.number().int().positive().max(24 * 90).optional() }),
        response: { 200: RenderDiagnosticsResponseSchema },
      },
    },
    async (request) => {
      const { hours } = request.query as { hours?: number };
      return getRenderDiagnostics(hours ?? 24);
    },
  );

  // Performance timing (backend/src/lib/timing.ts) — only Breakdown is
  // instrumented today; other operations will show up here once they're
  // wired up the same way (one timeOperation() call each).
  app.get(
    '/api/diagnostics/operations',
    {
      schema: {
        querystring: z.object({ hours: z.coerce.number().int().positive().max(24 * 90).optional() }),
        response: { 200: OperationTimingResponseSchema },
      },
    },
    async (request) => {
      const { hours } = request.query as { hours?: number };
      return getOperationTimingReport(hours ?? 24);
    },
  );

  // Fire-and-forget from the frontend's perspective: it doesn't wait on or
  // surface failures from this call, so a telemetry outage never blocks an
  // operator's actual work. See ProductionConsole.js's recovery-event calls.
  app.post(
    '/api/diagnostics/recovery-event',
    { schema: { body: RecoveryEventBodySchema } },
    async (request, reply) => {
      const body = RecoveryEventBodySchema.parse(request.body);
      await recordRecoveryEvent(body.correlationId, body.kind);
      return reply.code(204).send();
    },
  );
}
