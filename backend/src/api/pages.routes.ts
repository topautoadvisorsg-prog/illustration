import type { FastifyInstance } from 'fastify';
import { ApiErrorSchema } from '@wildlands/shared';
import { z } from 'zod';
import { GenerationBlockedError, generatePageImage } from '../pipeline/stage-3-generation/generate-image.js';
import {
  ReviewBlockedError,
  approvePageImage,
  listPageImages,
  regeneratePageImage,
  rejectPageImage,
  setActivePageImage,
} from '../pipeline/stage-4-review/review-image.js';
import { UpscaleBlockedError, upscalePageImage } from '../pipeline/stage-5-upscale/upscale-image.js';

const PageParamsSchema = z.object({ pageId: z.string().uuid() });
const ImageVersionParamsSchema = z.object({ pageId: z.string().uuid(), version: z.coerce.number().int().positive() });

const GenerateImageResponseSchema = z.object({
  image: z.object({
    pageId: z.string(),
    imageId: z.string(),
    version: z.number(),
    generatedPath: z.string(),
    widthPx: z.number(),
    heightPx: z.number(),
    model: z.string(),
    status: z.literal('REVIEW'),
  }),
});

const ImagesListResponseSchema = z.object({
  pageStatus: z.string(),
  images: z.array(
    z.object({
      version: z.number(),
      status: z.string(),
      active: z.boolean(),
      generatedPath: z.string().nullable(),
      upscaledPath: z.string().nullable(),
      widthPx: z.number().nullable(),
      heightPx: z.number().nullable(),
    }),
  ),
});

function reviewErrorStatus(code: string): 404 | 409 {
  return code === 'page_not_found' || code === 'version_not_found' ? 404 : 409;
}

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

  // Stage 4 — review gate: list versions for a page.
  app.get(
    '/api/pages/:pageId/images',
    { schema: { params: PageParamsSchema, response: { 200: ImagesListResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema } } },
    async (request, reply) => {
      const { pageId } = PageParamsSchema.parse(request.params);
      try {
        return await listPageImages(pageId);
      } catch (error) {
        if (error instanceof ReviewBlockedError) {
          const status = reviewErrorStatus(error.code);
          return reply.code(status).send({ error: status === 404 ? 'Not Found' : 'Conflict', message: error.message, statusCode: status });
        }
        throw error;
      }
    },
  );

  // Stage 4 — approve a version: locks it active + APPROVED, page -> APPROVED.
  const ApproveResponseSchema = z.object({ pageStatus: z.string(), version: z.number() });
  app.post(
    '/api/pages/:pageId/images/:version/approve',
    { schema: { params: ImageVersionParamsSchema, response: { 200: ApproveResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema } } },
    async (request, reply) => {
      const { pageId, version } = ImageVersionParamsSchema.parse(request.params);
      try {
        return await approvePageImage(pageId, version);
      } catch (error) {
        if (error instanceof ReviewBlockedError) {
          const status = reviewErrorStatus(error.code);
          return reply.code(status).send({ error: status === 404 ? 'Not Found' : 'Conflict', message: error.message, statusCode: status });
        }
        throw error;
      }
    },
  );

  // Stage 4 — reject a version.
  const RejectBodySchema = z.object({ note: z.string().optional() });
  app.post(
    '/api/pages/:pageId/images/:version/reject',
    { schema: { params: ImageVersionParamsSchema, body: RejectBodySchema, response: { 200: ApproveResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema } } },
    async (request, reply) => {
      const { pageId, version } = ImageVersionParamsSchema.parse(request.params);
      const { note } = RejectBodySchema.parse(request.body ?? {});
      try {
        return await rejectPageImage(pageId, version, note);
      } catch (error) {
        if (error instanceof ReviewBlockedError) {
          const status = reviewErrorStatus(error.code);
          return reply.code(status).send({ error: status === 404 ? 'Not Found' : 'Conflict', message: error.message, statusCode: status });
        }
        throw error;
      }
    },
  );

  // Stage 4 — activate a historical version without re-approving.
  const SetActiveResponseSchema = z.object({ version: z.number() });
  app.post(
    '/api/pages/:pageId/images/:version/set-active',
    { schema: { params: ImageVersionParamsSchema, response: { 200: SetActiveResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema } } },
    async (request, reply) => {
      const { pageId, version } = ImageVersionParamsSchema.parse(request.params);
      try {
        return await setActivePageImage(pageId, version);
      } catch (error) {
        if (error instanceof ReviewBlockedError) {
          const status = reviewErrorStatus(error.code);
          return reply.code(status).send({ error: status === 404 ? 'Not Found' : 'Conflict', message: error.message, statusCode: status });
        }
        throw error;
      }
    },
  );

  // Stage 4 -> Stage 3 — regenerate a new version with an optional prompt tweak.
  const RegenerateBodySchema = z.object({ promptAddendum: z.string().optional() });
  app.post(
    '/api/pages/:pageId/regenerate',
    { schema: { params: PageParamsSchema, body: RegenerateBodySchema, response: { 200: GenerateImageResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema } } },
    async (request, reply) => {
      const { pageId } = PageParamsSchema.parse(request.params);
      const { promptAddendum } = RegenerateBodySchema.parse(request.body ?? {});
      try {
        const image = await regeneratePageImage(pageId, promptAddendum);
        return { image };
      } catch (error) {
        if (error instanceof GenerationBlockedError) {
          const status = error.code === 'not_found' ? 404 : 409;
          return reply.code(status).send({ error: status === 404 ? 'Not Found' : 'Conflict', message: error.message, statusCode: status });
        }
        throw error;
      }
    },
  );

  // Stage 5 — upscale the approved image and run the 300 DPI print gate.
  const UpscaleResponseSchema = z.object({
    pageId: z.string(),
    version: z.number(),
    passed: z.boolean(),
    dpiW: z.number(),
    dpiH: z.number(),
    minDpi: z.number(),
    widthPx: z.number(),
    heightPx: z.number(),
    upscaledPath: z.string().nullable(),
    pageStatus: z.enum(['PRINT_READY', 'FAILED_DPI']),
  });
  app.post(
    '/api/pages/:pageId/upscale',
    { schema: { params: PageParamsSchema, response: { 200: UpscaleResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema } } },
    async (request, reply) => {
      const { pageId } = PageParamsSchema.parse(request.params);
      try {
        return await upscalePageImage({ pageId });
      } catch (error) {
        if (error instanceof UpscaleBlockedError) {
          const status = error.code === 'not_found' || error.code === 'project_not_found' ? 404 : 409;
          return reply.code(status).send({ error: status === 404 ? 'Not Found' : 'Conflict', message: error.message, statusCode: status });
        }
        throw error;
      }
    },
  );
}
