/**
 * Book Production Supervisor — HTTP route.
 *
 * One endpoint: `POST /api/projects/:id/run-pipeline`. Runs the no-spend
 * half of the pipeline and returns the unified PipelineReport. Operators
 * (or future automation) call this to get a single PASS / WARNING / BLOCKED
 * verdict plus a next-action CTA.
 *
 * v1 always runs `mode: "no-spend"` if the body says anything else — the
 * with-spend path requires the budget guard + per-page render orchestrator
 * which lives in a follow-up.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiErrorSchema } from '@wildlands/shared';
import { runPipeline } from '../services/book-supervisor/supervisor.js';
import type { SupervisorMode } from '../services/book-supervisor/types.js';

const ProjectParamsSchema = z.object({ id: z.string().uuid() });

const RunPipelineBodySchema = z
  .object({
    mode: z.enum(['no-spend', 'with-spend']).optional(),
    /** Per-run override of policy thresholds. Partial — merged into defaults. */
    policyOverride: z
      .object({
        pagination: z
          .object({
            overflowMax: z.number().int().nonnegative().optional(),
            tightRatePerLayoutMax: z.number().min(0).max(1).optional(),
            underfillMax: z.number().int().nonnegative().optional(),
          })
          .partial()
          .optional(),
        imageGen: z
          .object({
            maxBudgetUsd: z.number().nonnegative().optional(),
          })
          .partial()
          .optional(),
        director: z
          .object({
            autoApply: z.boolean().optional(),
            allowedActions: z
              .array(z.enum(['switch_layout', 'apply_repeating_accent', 'mark_intentional']))
              .optional(),
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
  })
  .optional();

export async function registerSupervisorRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/projects/:id/run-pipeline',
    {
      schema: {
        params: ProjectParamsSchema,
        body: RunPipelineBodySchema,
        response: {
          // Free-form 200 — the report shape is rich and may evolve; the UI
          // already treats it as JSON. A strict Zod schema would force the
          // shape lock-in earlier than makes sense for an internal endpoint.
          404: ApiErrorSchema,
          500: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const body = RunPipelineBodySchema.parse(request.body ?? {});
      const mode: SupervisorMode = body?.mode === 'with-spend' ? 'with-spend' : 'no-spend';

      try {
        const report = await runPipeline({
          projectId: id,
          mode,
          // Zod's parsed shape is structurally compatible with the deep-partial
          // policy override, but TypeScript can't see it through the schema.
          policyOverride: body?.policyOverride as Parameters<typeof runPipeline>[0]['policyOverride'],
        });
        return report;
      } catch (e) {
        const message = (e as Error).message;
        if (message.startsWith('project_not_found:')) {
          return reply
            .code(404)
            .send({ error: 'Not Found', message: 'Project not found.', statusCode: 404 });
        }
        request.log.error({ err: e }, 'run-pipeline failed');
        return reply
          .code(500)
          .send({
            error: 'Internal Error',
            message: `Pipeline run failed: ${message}`,
            statusCode: 500,
          });
      }
    },
  );
}
