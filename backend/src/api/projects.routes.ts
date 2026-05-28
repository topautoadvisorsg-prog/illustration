import type { FastifyInstance } from 'fastify';
import {
  ApiErrorSchema,
  CreateProjectRequestSchema,
  ProjectSchema,
  ProjectStatusSchema,
} from '@wildlands/shared';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const ProjectParamsSchema = z.object({
  id: z.string().uuid(),
});

const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectSchema),
});

const CreatedProjectResponseSchema = z.object({
  project: ProjectSchema,
  note: z.string(),
});

const PipelineActionResponseSchema = z.object({
  projectId: z.string().uuid(),
  accepted: z.boolean(),
  status: ProjectStatusSchema,
  note: z.string(),
});

function notImplemented(note: string) {
  return {
    accepted: false,
    status: 'DRAFT' as const,
    note,
  };
}

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/projects',
    {
      schema: {
        response: { 200: ProjectListResponseSchema },
      },
    },
    async () => ({ projects: [] }),
  );

  app.post(
    '/api/projects',
    {
      schema: {
        body: CreateProjectRequestSchema,
        response: { 202: CreatedProjectResponseSchema, 501: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const parsed = CreateProjectRequestSchema.parse(request.body);
      const now = new Date().toISOString();
      const project = {
        id: randomUUID(),
        brand: parsed.config.brand,
        audience: parsed.config.audience,
        title: parsed.config.title,
        status: 'DRAFT' as const,
        manuscriptPath: null,
        createdAt: now,
        updatedAt: now,
      };
      return reply.code(202).send({
        project,
        note: 'Project contract accepted. Persistence is wired next when DATABASE_URL is configured.',
      });
    },
  );

  app.post(
    '/api/projects/:id/manuscript',
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 202: PipelineActionResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      return reply.code(202).send({
        projectId: id,
        ...notImplemented('Stage 1 ingestion endpoint reserved; local ingestion primitive exists for the worker path.'),
      });
    },
  );

  app.post(
    '/api/projects/:id/manifests',
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 202: PipelineActionResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      return reply.code(202).send({
        projectId: id,
        ...notImplemented('Stage 1.5 will call Claude when ANTHROPIC_API_KEY is configured.'),
      });
    },
  );
}
