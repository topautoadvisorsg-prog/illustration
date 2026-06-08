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
import { getProjectStorage } from '../services/storage/project-storage.js';

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

/** Pull an experimental artifact (image, spec JSON, or prompt text) by its
 *  stored relative path. Locked down to paths under `experimental/whole-page/`
 *  to prevent any read outside the experiment sandbox. Flag-gated like the
 *  generator. */
const FileQuerySchema = z.object({ path: z.string().min(1) });

export async function registerExperimentalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/experimental/whole-page-render/file', async (request, reply) => {
    if (!getEnv().WHOLE_PAGE_EXPERIMENT_ENABLED) {
      return reply.code(503).send(flagDisabledResponse());
    }
    const parsed = FileQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Missing or invalid `path` query parameter.',
        statusCode: 400,
      });
    }
    const relPath = parsed.data.path;
    if (relPath.includes('..') || !relPath.includes('/experimental/whole-page/')) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Path must be under experimental/whole-page/.',
        statusCode: 400,
      });
    }
    try {
      const buf = await getProjectStorage().readProjectFile(relPath);
      const ext = relPath.split('.').pop() ?? '';
      const ct =
        ext === 'png' ? 'image/png'
        : ext === 'json' ? 'application/json'
        : 'text/plain; charset=utf-8';
      reply.header('content-type', ct);
      reply.header('cache-control', 'no-store');
      return reply.send(buf);
    } catch {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Artifact not found.',
        statusCode: 404,
      });
    }
  });

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
