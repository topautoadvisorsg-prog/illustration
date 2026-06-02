import type { FastifyInstance } from 'fastify';
import { isNativeError } from 'node:util/types';
import {
  ApiErrorSchema,
  CreateProjectRequestSchema,
  PageManifestSchema,
  ProjectConfigSchema,
  ProjectSchema,
} from '@wildlands/shared';
import { z } from 'zod';
import {
  createProject,
  getProject,
  listProjects,
  setManuscript,
  setProjectStatus,
  updateProjectConfig,
  type ProjectRow,
} from '../db/repositories/projects.repo.js';
import { listManifests, listPages } from '../db/repositories/manifests.repo.js';
import { updatePagePlanning } from '../db/repositories/manifests.repo.js';
import { ingestManuscript } from '../pipeline/stage-1-ingestion/ingest-manuscript.js';
import { generateManifests } from '../pipeline/stage-1.5-manifests/generate-manifests.js';
import { planPage, validateLayoutLibrary } from '../pipeline/stage-2-planner/plan-pages.js';
import { previewProjectTextFit } from '../pipeline/stage-6-layout/text-fit-preview.js';
import { RenderBlockedError, renderBookPdf, renderChapterPdf } from '../pipeline/stage-6-layout/render-chapter.js';
import { countImagesForProject } from '../db/repositories/images.repo.js';
import { estimateCost } from '../services/cost/estimate.js';

const ProjectParamsSchema = z.object({ id: z.string().uuid() });

function toContract(row: ProjectRow) {
  return {
    id: row.id,
    brand: row.brand,
    audience: row.audience,
    title: row.title,
    status: row.status,
    manuscriptPath: row.manuscriptPath,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const ProjectListResponseSchema = z.object({ projects: z.array(ProjectSchema) });
const CreatedProjectResponseSchema = z.object({ project: ProjectSchema });
const UpdateProjectConfigBodySchema = z.object({ config: ProjectConfigSchema });

const UploadManuscriptBodySchema = z.object({
  filename: z.string().min(1),
  markdown: z.string().min(1),
});
const UploadManuscriptResponseSchema = z.object({
  project: ProjectSchema,
  manuscript: z.object({
    relativePath: z.string(),
    sha256: z.string(),
    sizeBytes: z.number(),
    totalChapters: z.number(),
    totalEntries: z.number(),
    totalWords: z.number(),
    warnings: z.array(z.string()),
  }),
});

const ManifestSummaryResponseSchema = z.object({
  project: ProjectSchema,
  summary: z.object({
    totalChapters: z.number(),
    totalEntries: z.number(),
    totalPages: z.number(),
    totalImagesNeeded: z.number(),
    manifestsWritten: z.number(),
    pagesWritten: z.number(),
  }),
});

const ManifestsListResponseSchema = z.object({
  manifests: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      externalId: z.string(),
      version: z.number(),
      content: z.unknown(),
    }),
  ),
});

const PagesListResponseSchema = z.object({
  pages: z.array(
    z.object({
      id: z.string(),
      pageKey: z.string(),
      chapterNumber: z.number(),
      plannedPageNumber: z.number(),
      layoutTemplate: z.string().nullable(),
      imagePrompt: z.string().nullable(),
      imagePromptSha256: z.string().nullable(),
      status: z.string(),
    }),
  ),
});

const PlanPagesResponseSchema = z.object({
  project: ProjectSchema,
  layoutLibrary: z.object({
    totalTemplates: z.number(),
    approvedTemplates: z.number(),
    missingTemplates: z.array(z.string()),
    readyForProduction: z.boolean(),
    issues: z.array(
      z.object({
        templateId: z.string(),
        severity: z.enum(['BLOCKER', 'WARNING']),
        code: z.string(),
        message: z.string(),
      }),
    ),
  }),
  plannedPages: z.array(
    z.object({
      pageKey: z.string(),
      entryTitle: z.string(),
      wordCount: z.number(),
      contentType: z.string(),
      contentTypePurpose: z.string(),
      contentTypeUsedFor: z.array(z.string()),
      multiSubject: z.boolean(),
      coverage: z.number(),
      architecture: z.string(),
      layoutTemplate: z.string(),
      layoutReferenceLabel: z.string(),
      promptSha256: z.string(),
      promptReady: z.boolean(),
      reasonCodes: z.array(z.string()),
      blockers: z.array(z.string()),
      warnings: z.array(z.string()),
      layoutInstructions: z.object({
        description: z.string(),
        useCases: z.array(z.string()),
        avoidWhen: z.array(z.string()),
        textZone: z.string(),
        imageZone: z.string(),
        textFitRule: z.string(),
      }),
      capacity: z.object({
        minWords: z.number(),
        targetWords: z.number(),
        maxWords: z.number(),
        status: z.string(),
        overMaxWords: z.boolean(),
        underMinWords: z.boolean(),
      }),
      typography: z.object({
        bodyFont: z.string(),
        bodyPt: z.number(),
        lineHeight: z.number(),
      }),
      agent: z.object({
        id: z.string(),
        name: z.string(),
        mission: z.string(),
        expertFrame: z.string(),
      }),
      textFitStatus: z.enum(['PENDING_PREVIEW', 'BLOCKED_LAYOUT_LIBRARY']),
    }),
  ),
});

const TextFitPreviewResponseSchema = z.object({
  geometry: z.object({
    pageWidthIn: z.number(),
    pageHeightIn: z.number(),
    textWidthIn: z.number(),
    textHeightIn: z.number(),
  }),
  totals: z.object({
    pages: z.number(),
    fits: z.number(),
    tight: z.number(),
    overflow: z.number(),
    underfilled: z.number(),
  }),
  readyForImageSpend: z.boolean(),
  pages: z.array(
    z.object({
      pageKey: z.string(),
      entryTitle: z.string(),
      layoutTemplate: z.string(),
      layoutReasonCodes: z.array(z.string()),
      promptReady: z.boolean(),
      blockers: z.array(z.string()),
      fit: z.object({
        status: z.enum(['FITS', 'TIGHT', 'OVERFLOW', 'UNDERFILLED']),
        fits: z.boolean(),
        charCount: z.number(),
        capacityChars: z.number(),
        fillRatio: z.number(),
        estimatedLines: z.number(),
        usableLines: z.number(),
        notes: z.array(z.string()),
      }),
    }),
  ),
});

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/projects',
    { schema: { response: { 200: ProjectListResponseSchema } } },
    async () => {
      const rows = await listProjects();
      return { projects: rows.map(toContract) };
    },
  );

  app.post(
    '/api/projects',
    { schema: { body: CreateProjectRequestSchema, response: { 201: CreatedProjectResponseSchema } } },
    async (request, reply) => {
      const body = CreateProjectRequestSchema.parse(request.body);
      const row = await createProject({ config: body.config });
      return reply.code(201).send({ project: toContract(row) });
    },
  );

  app.get(
    '/api/projects/:id',
    { schema: { params: ProjectParamsSchema, response: { 200: CreatedProjectResponseSchema, 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const row = await getProject(id);
      if (!row) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      return { project: toContract(row) };
    },
  );

  app.patch(
    '/api/projects/:id/config',
    {
      schema: {
        params: ProjectParamsSchema,
        body: UpdateProjectConfigBodySchema,
        response: { 200: CreatedProjectResponseSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const body = UpdateProjectConfigBodySchema.parse(request.body);
      const row = await updateProjectConfig(id, body.config);
      if (!row) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      return { project: toContract(row) };
    },
  );

  app.post(
    '/api/projects/:id/manuscript',
    {
      schema: {
        params: ProjectParamsSchema,
        body: UploadManuscriptBodySchema,
        response: { 200: UploadManuscriptResponseSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const body = UploadManuscriptBodySchema.parse(request.body);

      const existing = await getProject(id);
      if (!existing) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      const { manuscript, outline } = await ingestManuscript({ projectId: id, filename: body.filename, markdown: body.markdown });
      const updated = await setManuscript(id, manuscript.relativePath, manuscript.sha256);

      return {
        project: toContract(updated ?? existing),
        manuscript: {
          relativePath: manuscript.relativePath,
          sha256: manuscript.sha256,
          sizeBytes: manuscript.sizeBytes,
          totalChapters: outline.chapters.length,
          totalEntries: outline.totalEntries,
          totalWords: outline.totalWords,
          warnings: outline.warnings,
        },
      };
    },
  );

  app.post(
    '/api/projects/:id/manifests',
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: ManifestSummaryResponseSchema, 400: ApiErrorSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      if (!project.manuscriptPath) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No manuscript on file. Upload one first.',
          statusCode: 400,
        });
      }

      const { LocalStorageService } = await import('../services/storage/local-storage.js');
      let buf: Buffer;
      try {
        buf = await new LocalStorageService().readProjectFile(project.manuscriptPath);
      } catch (error) {
        if (isNativeError(error) && 'code' in error && error.code === 'ENOENT') {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Stored manuscript file is missing. Re-upload the manuscript before generating manifests.',
            statusCode: 404,
          });
        }
        throw error;
      }
      const markdown = buf.toString('utf8');

      try {
        const config = project.config as import('@wildlands/shared').ProjectConfig;
        const summary = await generateManifests({ projectId: id, manuscriptMarkdown: markdown, config });
        const updated = await setProjectStatus(id, 'MANIFESTED');

        return { project: toContract(updated ?? project), summary };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('already has manifests/pages')) {
          return reply.code(409).send({ error: 'Conflict', message, statusCode: 409 });
        }
        throw error;
      }
    },
  );

  app.get(
    '/api/projects/:id/manifests',
    { schema: { params: ProjectParamsSchema, response: { 200: ManifestsListResponseSchema } } },
    async (request) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const rows = await listManifests(id);
      return {
        manifests: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          externalId: r.externalId,
          version: r.version,
          content: r.content,
        })),
      };
    },
  );

  app.post(
    '/api/projects/:id/plan',
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: PlanPagesResponseSchema, 400: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      const rows = await listManifests(id, 'PAGE');
      if (rows.length === 0) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No page manifests found. Generate manifests before planning pages.',
          statusCode: 400,
        });
      }

      const config = project.config as import('@wildlands/shared').ProjectConfig;
      const layoutLibrary = validateLayoutLibrary(config);
      const plannedPages = [];
      for (const row of rows) {
        const page = PageManifestSchema.parse(row.content);
        const decision = planPage(page, config);
        await updatePagePlanning(id, decision.pageKey, {
          layoutTemplate: decision.layoutTemplate,
          imagePrompt: decision.prompt,
          imagePromptSha256: decision.promptSha256,
        });
        plannedPages.push({
          pageKey: decision.pageKey,
          entryTitle: decision.entryTitle,
          wordCount: decision.wordCount,
          contentType: decision.contentType,
          contentTypePurpose: decision.contentTypePurpose,
          contentTypeUsedFor: decision.contentTypeUsedFor,
          multiSubject: decision.multiSubject,
          coverage: decision.coverage,
          architecture: decision.architecture,
          layoutTemplate: decision.layoutTemplate,
          layoutReferenceLabel: decision.layoutReferenceLabel,
          promptSha256: decision.promptSha256,
          promptReady: decision.promptReady,
          reasonCodes: decision.reasonCodes,
          blockers: decision.blockers,
          warnings: decision.warnings,
          layoutInstructions: decision.layoutInstructions,
          capacity: decision.capacity,
          typography: decision.typography,
          agent: decision.agent,
          textFitStatus: decision.textFitStatus,
        });
      }

      const updated = await setProjectStatus(id, 'PLANNED');
      return { project: toContract(updated ?? project), layoutLibrary, plannedPages };
    },
  );

  app.get(
    '/api/projects/:id/pages',
    { schema: { params: ProjectParamsSchema, response: { 200: PagesListResponseSchema } } },
    async (request) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const rows = await listPages(id);
      return {
        pages: rows.map((p) => ({
          id: p.id,
          pageKey: p.pageKey,
          chapterNumber: p.chapterNumber,
          plannedPageNumber: p.plannedPageNumber,
          layoutTemplate: p.layoutTemplate,
          imagePrompt: p.imagePrompt,
          imagePromptSha256: p.imagePromptSha256,
          status: p.status,
        })),
      };
    },
  );

  app.post(
    '/api/projects/:id/text-fit-preview',
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: TextFitPreviewResponseSchema, 400: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const rows = await listManifests(id, 'PAGE');
      if (rows.length === 0) {
        const project = await getProject(id);
        if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No page manifests found. Generate manifests before running a text-fit preview.',
          statusCode: 400,
        });
      }
      return previewProjectTextFit(id);
    },
  );

  // Simple cost estimate: images generated x flat average $/image.
  const CostEstimateResponseSchema = z.object({
    imageCount: z.number(),
    avgCostPerImageUsd: z.number(),
    estimatedCostUsd: z.number(),
  });
  app.get(
    '/api/projects/:id/cost-estimate',
    { schema: { params: ProjectParamsSchema, response: { 200: CostEstimateResponseSchema } } },
    async (request) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const imageCount = await countImagesForProject(id);
      return estimateCost(imageCount);
    },
  );

  function renderErrorStatus(code: string): 404 | 409 | 503 {
    if (code === 'not_found') return 404;
    if (code === 'no_chromium') return 503;
    return 409;
  }

  // Stage 6 — render one chapter to a PDF (uses approved/upscaled art, else clean
  // placeholders so it works before images exist). Returns the PDF binary.
  const RenderChapterParamsSchema = z.object({ id: z.string().uuid(), chapterNumber: z.coerce.number().int().positive() });
  app.post('/api/projects/:id/chapters/:chapterNumber/render', async (request, reply) => {
    const { id, chapterNumber } = RenderChapterParamsSchema.parse(request.params);
    try {
      const { pdf, totalPages } = await renderChapterPdf(id, chapterNumber);
      if ((request.query as { format?: string } | undefined)?.format === 'json') {
        return reply.send({ ok: true, chapterNumber, totalPages, bytes: pdf.byteLength });
      }
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', `inline; filename="chapter-${chapterNumber}.pdf"`);
      reply.header('x-total-pages', String(totalPages));
      return reply.send(pdf);
    } catch (error) {
      if (error instanceof RenderBlockedError) {
        const status = renderErrorStatus(error.code);
        return reply.code(status).send({ error: 'Render Blocked', message: error.message, statusCode: status });
      }
      throw error;
    }
  });

  // Stage 7 — render every chapter, stitch into the interior book PDF, run KDP
  // preflight, store it, record the export. ?format=json returns the preflight report.
  app.post('/api/projects/:id/render-book', async (request, reply) => {
    const { id } = ProjectParamsSchema.parse(request.params);
    try {
      const result = await renderBookPdf(id);
      if ((request.query as { format?: string } | undefined)?.format === 'json') {
        return reply.send({
          ok: result.preflight.passed,
          pageCount: result.pageCount,
          chaptersRendered: result.chaptersRendered,
          storedPath: result.storedPath,
          preflight: result.preflight,
        });
      }
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', 'inline; filename="wildlands-book.pdf"');
      reply.header('x-page-count', String(result.pageCount));
      reply.header('x-preflight-passed', String(result.preflight.passed));
      return reply.send(result.pdf);
    } catch (error) {
      if (error instanceof RenderBlockedError) {
        const status = renderErrorStatus(error.code);
        return reply.code(status).send({ error: 'Render Blocked', message: error.message, statusCode: status });
      }
      throw error;
    }
  });
}
