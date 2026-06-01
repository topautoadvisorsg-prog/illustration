import type { FastifyInstance } from 'fastify';
import { ApiErrorSchema } from '@wildlands/shared';
import { z } from 'zod';
import { GenerationBlockedError, generatePageImage } from '../pipeline/stage-3-generation/generate-image.js';

const PageParamsSchema = z.object({ pageId: z.string().uuid() });

const GenerateImageResponseSchema = z.object({
  image: z.object({
    pageId: z.string(),
    version: z.number(),
    generatedPath: z.string(),
    widthPx: z.number(),
    heightPx: z.number(),
    model: z.string(),
    status: z.literal('REVIEW'),
  }),
});

export async function registerPageRoutes(app: FastifyInstance): Promise<void> {
  // Stage 3 — generate (or regenerate) the illustration for one page.
  // Spend guard: blocked unless the page has a clean, locked, fully-resolved prompt.
  app.post(
    '/api/pages/:pageId/generate-image',
    {
      schema: {
        params: PageParamsSchema,
        response: { 200: GenerateImageResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { pageId } = PageParamsSchema.parse(request.params);
      try {
        const image = await generatePageImage({ pageId });
        return { image };
      } catch (error) {
        if (error instanceof GenerationBlockedError) {
          const status = error.code === 'not_found' ? 404 : 409;
          return reply.code(status).send({
            error: status === 404 ? 'Not Found' : 'Conflict',
            message: error.message,
            statusCode: status,
          });
        }
        throw error;
      }
    },
  );
}
