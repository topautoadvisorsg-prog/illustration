import type { FastifyInstance } from 'fastify';
import {
  ApiErrorSchema,
  CreateProjectRequestSchema,
  ProjectSchema,
} from '@wildlands/shared';
import { z } from 'zod';
import {
  createProject,
  getProject,
  listProjects,
  setManuscript,
  setProjectStatus,
  type ProjectRow,
} from '../db/repositories/projects.repo.js';
import { listManifests, listPages } from '../db/repositories/manifests.repo.js';
import { ingestManuscript } from '../pipeline/stage-1-ingestion/ingest-manuscript.js';
import { generateManifests } from '../pipeline/stage-1.5-manifests/generate-manifests.js';

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

const UploadManuscriptBodySchema = z.object({
  filename: z.string().min(1),
  markdown: z.string().min(1),
});
const UploadManuscriptResponseSchema = z.object({
  project: ProjectSchema,
  manuscript: z.object({ relativePath: z.string(), sha256: z.string(), sizeBytes: z.number() }),
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
      status: z.string(),
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

      const { manuscript } = await ingestManuscript({ projectId: id, filename: body.filename, markdown: body.markdown });
      const updated = await setManuscript(id, manuscript.relativePath, manuscript.sha256);

      return {
        project: toContract(updated ?? existing),
        manuscript: {
          relativePath: manuscript.relativePath,
          sha256: manuscript.sha256,
          sizeBytes: manuscript.sizeBytes,
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
      const buf = await new LocalStorageService().readProjectFile(project.manuscriptPath);
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
          status: p.status,
        })),
      };
    },
  );
}
