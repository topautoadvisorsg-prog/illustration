import type { FastifyInstance } from 'fastify';
import { ApiErrorSchema } from '@wildlands/shared';
import { z } from 'zod';
import { GenerationBlockedError, generatePageImage } from '../pipeline/stage-3-generation/generate-image.js';
import {
  ReviewBlockedError,
  applySharedImageToLayout,
  approvePageImage,
  listPageImages,
  regeneratePageImage,
  rejectPageImage,
  reuseLibraryImageForPage,
  setActivePageImage,
} from '../pipeline/stage-4-review/review-image.js';
import { UpscaleBlockedError, upscalePageImage } from '../pipeline/stage-5-upscale/upscale-image.js';
import { isChromiumAvailable, renderSampleChapterPdf, renderSamplePagePdf } from '../pipeline/stage-6-layout/render-check.js';
import { getContentTypeGuide } from '../pipeline/stage-2-planner/layered-layout.js';
import { createHash } from 'node:crypto';
import { getActiveImage, getImageById, getImageVersion, deleteImageById, insertImage, listImagesForPage } from '../db/repositories/images.repo.js';
import { getPageById } from '../db/repositories/manifests.repo.js';
import { getProjectStorage } from '../services/storage/project-storage.js';

const PageParamsSchema = z.object({ pageId: z.string().uuid() });
const ImageParamsSchema = z.object({ imageId: z.string().uuid() });
const ImageVersionParamsSchema = z.object({ pageId: z.string().uuid(), version: z.coerce.number().int().positive() });

const GenerateImageBodySchema = z.object({ useBlueprint: z.boolean().optional() });

const GenerateImageResponseSchema = z.object({
  image: z.object({
    pageId: z.string(),
    imageId: z.string(),
    version: z.number(),
    generatedPath: z.string(),
    blueprintPath: z.string().optional(),
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
      const { useBlueprint } = GenerateImageBodySchema.parse(request.body ?? {});
      try {
        const image = await generatePageImage({ pageId, useBlueprint });
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

  // Serve the actual image bytes so the operator can SEE the art to review it.
  // ?v=active (default) serves the active version; ?v=<n> a specific version.
  app.get('/api/pages/:pageId/image', async (request, reply) => {
    const { pageId } = PageParamsSchema.parse(request.params);
    const vq = (request.query as { v?: string } | undefined)?.v;
    const row =
      vq && vq !== 'active' && Number.isFinite(Number(vq))
        ? await getImageVersion(pageId, Number(vq))
        : await getActiveImage(pageId);
    const path = row?.upscaledPath ?? row?.generatedPath;
    if (!path) return reply.code(404).send({ error: 'Not Found', message: 'No image for this page.', statusCode: 404 });
    try {
      const buf = await getProjectStorage().readProjectFile(path);
      reply.header('content-type', 'image/png');
      reply.header('cache-control', 'no-store');
      return reply.send(buf);
    } catch {
      return reply.code(404).send({ error: 'Not Found', message: 'Image file missing on disk.', statusCode: 404 });
    }
  });

  // Serve the layout blueprint (composition map) handed to the image agent, so the
  // operator can SEE the map the illustration was composed against.
  app.get('/api/pages/:pageId/blueprint', async (request, reply) => {
    const { pageId } = PageParamsSchema.parse(request.params);
    const page = await getPageById(pageId);
    if (!page) return reply.code(404).send({ error: 'Not Found', message: 'Page not found.', statusCode: 404 });
    const path = `${page.projectId}/blueprints/${page.pageKey}.png`;
    try {
      const buf = await getProjectStorage().readProjectFile(path);
      reply.header('content-type', 'image/png');
      reply.header('cache-control', 'no-store');
      return reply.send(buf);
    } catch {
      return reply.code(404).send({ error: 'Not Found', message: 'No blueprint for this page yet.', statusCode: 404 });
    }
  });

  // Serve an image as a library asset, independent of the page it was generated for.
  app.get('/api/images/:imageId/file', async (request, reply) => {
    const { imageId } = ImageParamsSchema.parse(request.params);
    const row = await getImageById(imageId);
    const path = row?.upscaledPath ?? row?.generatedPath;
    if (!path) return reply.code(404).send({ error: 'Not Found', message: 'No image asset found.', statusCode: 404 });
    try {
      const buf = await getProjectStorage().readProjectFile(path);
      reply.header('content-type', 'image/png');
      reply.header('cache-control', 'no-store');
      return reply.send(buf);
    } catch {
      return reply.code(404).send({ error: 'Not Found', message: 'Image file missing in storage.', statusCode: 404 });
    }
  });

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

  const ReuseImageBodySchema = z.object({ sourceImageId: z.string().uuid() });
  const ReuseImageResponseSchema = z.object({ pageStatus: z.string(), version: z.number(), imageId: z.string() });
  app.post(
    '/api/pages/:pageId/images/reuse',
    {
      schema: {
        params: PageParamsSchema,
        body: ReuseImageBodySchema,
        response: { 200: ReuseImageResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { pageId } = PageParamsSchema.parse(request.params);
      const { sourceImageId } = ReuseImageBodySchema.parse(request.body ?? {});
      try {
        return await reuseLibraryImageForPage(pageId, sourceImageId);
      } catch (error) {
        if (error instanceof ReviewBlockedError) {
          const status = reviewErrorStatus(error.code);
          return reply.code(status).send({ error: status === 404 ? 'Not Found' : 'Conflict', message: error.message, statusCode: status });
        }
        throw error;
      }
    },
  );

  // Repeating-asset reuse — apply ONE generated image to every page in the
  // project that uses the same layout (e.g. a recurring full-text border page),
  // so the operator generates the border once and reuses it everywhere.
  const ApplySharedParamsSchema = z.object({ id: z.string().uuid(), layout: z.string().min(1) });
  const ApplySharedImageResponseSchema = z.object({
    layoutTemplate: z.string(),
    sourceImageId: z.string(),
    applied: z.number(),
    appliedPageKeys: z.array(z.string()),
    totalLayoutPages: z.number(),
  });
  app.post(
    '/api/projects/:id/layouts/:layout/apply-shared-image',
    {
      schema: {
        params: ApplySharedParamsSchema,
        body: ReuseImageBodySchema,
        response: { 200: ApplySharedImageResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id, layout } = ApplySharedParamsSchema.parse(request.params);
      const { sourceImageId } = ReuseImageBodySchema.parse(request.body ?? {});
      try {
        return await applySharedImageToLayout(id, layout, sourceImageId);
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

  // Delete a single image from the library (operator cleanup).
  app.delete(
    '/api/images/:imageId',
    { schema: { params: ImageParamsSchema, response: { 200: z.object({ deleted: z.boolean() }), 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { imageId } = ImageParamsSchema.parse(request.params);
      const row = await deleteImageById(imageId);
      if (!row) return reply.code(404).send({ error: 'Not Found', message: 'Image not found.', statusCode: 404 });
      return { deleted: true };
    },
  );

  // Upload a manually-generated image and assign it to a page.
  const UploadImageBodySchema = z.object({
    base64: z.string().min(1),
    filename: z.string().optional(),
    source: z.enum(['uploaded', 'manual-chatgpt', 'manual-midjourney', 'manual-other']).optional(),
  });
  const UploadImageResponseSchema = z.object({
    imageId: z.string(),
    version: z.number(),
    generatedPath: z.string(),
    widthPx: z.number().nullable(),
    heightPx: z.number().nullable(),
  });
  app.post(
    '/api/pages/:pageId/images/upload',
    { schema: { params: PageParamsSchema, body: UploadImageBodySchema, response: { 200: UploadImageResponseSchema, 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { pageId } = PageParamsSchema.parse(request.params);
      const { base64, source } = UploadImageBodySchema.parse(request.body);
      const page = await getPageById(pageId);
      if (!page) return reply.code(404).send({ error: 'Not Found', message: 'Page not found.', statusCode: 404 });
      const buffer = Buffer.from(base64, 'base64');
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      const existing = await listImagesForPage(pageId);
      const version = existing.reduce((max, img) => Math.max(max, img.version), 0) + 1;
      const stored = await getProjectStorage().writeProjectFile(
        page.projectId,
        ['images', page.pageKey, `v${version}-${source || 'uploaded'}.png`],
        buffer,
      );
      const prompt = `[Manual upload: ${source || 'uploaded'}]`;
      const image = await insertImage({
        pageId,
        version,
        prompt,
        promptSha256: sha256,
        generatedPath: stored.relativePath,
        widthPx: 0,
        heightPx: 0,
        status: 'REVIEW',
        active: existing.length === 0,
      });
      return {
        imageId: image.id,
        version: image.version,
        generatedPath: stored.relativePath,
        widthPx: image.widthPx,
        heightPx: image.heightPx,
      };
    },
  );

  // Content-type catalog — the agent's/operator's go-to reference: every page type,
  // what it's used for, and its default coverage + architecture + render template.
  const ContentTypeGuideResponseSchema = z.object({
    contentTypes: z.array(
      z.object({
        contentType: z.string(),
        purpose: z.string(),
        usedFor: z.array(z.string()),
        multiSubject: z.boolean(),
        defaultCoverage: z.number(),
        defaultArchitecture: z.string(),
        template: z.string(),
      }),
    ),
  });
  app.get(
    '/api/content-types',
    { schema: { response: { 200: ContentTypeGuideResponseSchema } } },
    async () => ({ contentTypes: getContentTypeGuide() }),
  );

  // Stage 6 — render smoke test: produce a real sample PDF via Paged.js to confirm
  // Chromium works in production. No DB dependency. ?format=json returns metadata.
  app.get('/api/render-check', async (request, reply) => {
    if (!isChromiumAvailable()) {
      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Chromium is not available on this host. PDF rendering is disabled.',
        statusCode: 503,
      });
    }
    try {
      const { pdf, totalPages, bytes } = await renderSamplePagePdf();
      const wantsJson = (request.query as { format?: string } | undefined)?.format === 'json';
      if (wantsJson) {
        return reply.send({ ok: true, totalPages, bytes });
      }
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', 'inline; filename="wildlands-render-check.pdf"');
      reply.header('x-total-pages', String(totalPages));
      return reply.send(pdf);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: 'Render Failed', message, statusCode: 500 });
    }
  });

  // Stage 6 — multi-page sample CHAPTER render (no DB). Proves chapter pagination
  // + per-page layouts work in production before real manuscripts/images exist.
  app.get('/api/render-check-chapter', async (request, reply) => {
    if (!isChromiumAvailable()) {
      return reply.code(503).send({ error: 'Service Unavailable', message: 'Chromium is not available on this host.', statusCode: 503 });
    }
    try {
      const { pdf, totalPages, bytes } = await renderSampleChapterPdf();
      if ((request.query as { format?: string } | undefined)?.format === 'json') {
        return reply.send({ ok: true, totalPages, bytes });
      }
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', 'inline; filename="wildlands-sample-chapter.pdf"');
      reply.header('x-total-pages', String(totalPages));
      return reply.send(pdf);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: 'Render Failed', message, statusCode: 500 });
    }
  });
}
