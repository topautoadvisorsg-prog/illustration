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

const ErrorFrequencyResponseSchema = z.object({
  windowHours: z.number(),
  totalErrors: z.number(),
  topCodes: z.array(z.object({ errorCode: z.string(), count: z.number() })),
  topPaths: z.array(z.object({ path: z.string(), count: z.number() })),
  recovery: z.object({
    clicked: z.number(),
    succeeded: z.number(),
    successRate: z.number().nullable(),
  }),
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
      return getErrorFrequencyReport(hours ?? 24);
    },
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
