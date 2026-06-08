/**
 * Experimental routes — flag-gated, isolated from production.
 *
 * Every route here is dormant unless `WHOLE_PAGE_EXPERIMENT_ENABLED` is true.
 * The 503 envelope mirrors the Pagination v1 pattern.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiErrorSchema } from '@wildlands/shared';
import { getEnv } from '../env.js';
import { renderWholePage } from '../pipeline/experimental/whole-page-render/render-whole-page.js';

const PageParamsSchema = z.object({ pageId: z.string().uuid() });

const RenderBodySchema = z.object({
  decidedBy: z.string().min(1).default('operator'),
  notes: z.string().optional(),
});

const RenderResponseSchema = z.object({
  runId: z.string(),
  pageId: z.string(),
  pageKey: z.string(),
  imageRelativePath: z.string(),
  specRelativePath: z.string(),
  promptRelativePath: z.string(),
  widthPx: z.number(),
  heightPx: z.number(),
  model: z.string(),
  assembledPromptPreview: z.string(),
  specPreview: z.unknown(),
});

function flagDisabledResponse() {
  return {
    error: 'Service Unavailable',
    message:
      'WHOLE_PAGE_EXPERIMENT_ENABLED is false; the whole-page render experiment is dormant.',
    statusCode: 503,
  };
}

export async function registerExperimentalRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/experimental/whole-page-render/:pageId',
    {
      schema: {
        params: PageParamsSchema,
        body: RenderBodySchema,
        response: {
          200: RenderResponseSchema,
          404: ApiErrorSchema,
          500: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      if (!getEnv().WHOLE_PAGE_EXPERIMENT_ENABLED) {
        return reply.code(503).send(flagDisabledResponse());
      }
      const { pageId } = PageParamsSchema.parse(request.params);
      const body = RenderBodySchema.parse(request.body ?? {});
      try {
        const result = await renderWholePage({ pageId, decidedBy: body.decidedBy });
        return {
          runId: result.runId,
          pageId: result.pageId,
          pageKey: result.pageKey,
          imageRelativePath: result.imageRelativePath,
          specRelativePath: result.specRelativePath,
          promptRelativePath: result.promptRelativePath,
          widthPx: result.widthPx,
          heightPx: result.heightPx,
          model: result.model,
          assembledPromptPreview: result.assembledPrompt.slice(0, 2000),
          specPreview: result.spec,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith('page_not_found') || message.startsWith('project_not_found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message,
            statusCode: 404,
          });
        }
        request.log.error({ err }, 'whole-page render failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message,
          statusCode: 500,
        });
      }
    },
  );
}
