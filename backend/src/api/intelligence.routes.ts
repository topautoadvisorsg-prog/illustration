import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ApiErrorSchema,
  CreateCostEventRequestSchema,
  CreateDecisionRequestSchema,
  CreateExperimentRequestSchema,
  CreateKnowledgeEvidenceRequestSchema,
  CreateKnowledgeLinkRequestSchema,
  CreateLessonRequestSchema,
  CreatePrintFindingRequestSchema,
  CreatePrintReviewRequestSchema,
  CreateSopRequestSchema,
  CreateStandardRequestSchema,
  KnowledgeEvidenceSchema,
  KnowledgeItemSchema,
  KnowledgeItemTypeSchema,
  KnowledgeLinkSchema,
  KnowledgeOverviewSchema,
  KnowledgeStatusSchema,
} from '@wildlands/shared';
import {
  getPublishingIntelligenceOverview,
  listPublishingKnowledge,
  promoteDecisionToStandard,
  promoteExperimentToDecision,
  recordCostEvent,
  recordDecision,
  recordEvidence,
  recordExperiment,
  recordKnowledgeLink,
  recordLesson,
  recordPrintFinding,
  recordPrintReview,
  recordSop,
  recordStandard,
} from '../services/publishing-intelligence/publishing-intelligence.js';

const KnowledgeItemParamsSchema = z.object({ id: z.string().uuid() });

const ListKnowledgeQuerySchema = z.object({
  type: KnowledgeItemTypeSchema.optional(),
  status: KnowledgeStatusSchema.optional(),
  projectId: z.string().uuid().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const KnowledgeListResponseSchema = z.object({
  items: z.array(KnowledgeItemSchema),
});

const KnowledgeItemResponseSchema = z.object({
  item: KnowledgeItemSchema,
});

const KnowledgeEvidenceResponseSchema = z.object({
  evidence: KnowledgeEvidenceSchema,
});

const KnowledgeLinkResponseSchema = z.object({
  link: KnowledgeLinkSchema,
});

const PrintFindingResponseSchema = z.object({
  finding: z.object({ id: z.string().uuid() }),
});

function notFound(message: string) {
  return { error: 'Not Found', message, statusCode: 404 };
}

function conflict(message: string) {
  return { error: 'Conflict', message, statusCode: 409 };
}

export async function registerIntelligenceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/intelligence/overview',
    { schema: { response: { 200: KnowledgeOverviewSchema } } },
    async () => getPublishingIntelligenceOverview(),
  );

  app.get(
    '/api/intelligence/items',
    {
      schema: {
        querystring: ListKnowledgeQuerySchema,
        response: { 200: KnowledgeListResponseSchema },
      },
    },
    async (request) => {
      const query = ListKnowledgeQuerySchema.parse(request.query);
      const items = await listPublishingKnowledge(query);
      return { items };
    },
  );

  app.post(
    '/api/intelligence/experiments',
    {
      schema: {
        body: CreateExperimentRequestSchema,
        response: { 201: KnowledgeItemResponseSchema },
      },
    },
    async (request, reply) => {
      const item = await recordExperiment(CreateExperimentRequestSchema.parse(request.body));
      return reply.code(201).send({ item });
    },
  );

  app.post(
    '/api/intelligence/decisions',
    {
      schema: {
        body: CreateDecisionRequestSchema,
        response: { 201: KnowledgeItemResponseSchema },
      },
    },
    async (request, reply) => {
      const item = await recordDecision(CreateDecisionRequestSchema.parse(request.body));
      return reply.code(201).send({ item });
    },
  );

  app.post(
    '/api/intelligence/standards',
    {
      schema: {
        body: CreateStandardRequestSchema,
        response: { 201: KnowledgeItemResponseSchema },
      },
    },
    async (request, reply) => {
      const item = await recordStandard(CreateStandardRequestSchema.parse(request.body));
      return reply.code(201).send({ item });
    },
  );

  app.post(
    '/api/intelligence/sops',
    {
      schema: {
        body: CreateSopRequestSchema,
        response: { 201: KnowledgeItemResponseSchema },
      },
    },
    async (request, reply) => {
      const item = await recordSop(CreateSopRequestSchema.parse(request.body));
      return reply.code(201).send({ item });
    },
  );

  app.post(
    '/api/intelligence/lessons',
    {
      schema: {
        body: CreateLessonRequestSchema,
        response: { 201: KnowledgeItemResponseSchema },
      },
    },
    async (request, reply) => {
      const item = await recordLesson(CreateLessonRequestSchema.parse(request.body));
      return reply.code(201).send({ item });
    },
  );

  app.post(
    '/api/intelligence/print-reviews',
    {
      schema: {
        body: CreatePrintReviewRequestSchema,
        response: { 201: KnowledgeItemResponseSchema },
      },
    },
    async (request, reply) => {
      const item = await recordPrintReview(CreatePrintReviewRequestSchema.parse(request.body));
      return reply.code(201).send({ item });
    },
  );

  app.post(
    '/api/intelligence/print-findings',
    {
      schema: {
        body: CreatePrintFindingRequestSchema,
        response: { 201: PrintFindingResponseSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      try {
        const finding = await recordPrintFinding(CreatePrintFindingRequestSchema.parse(request.body));
        return reply.code(201).send({ finding });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('not found')) return reply.code(404).send(notFound(message));
        throw error;
      }
    },
  );

  app.post(
    '/api/intelligence/cost-events',
    {
      schema: {
        body: CreateCostEventRequestSchema,
        response: { 201: KnowledgeItemResponseSchema },
      },
    },
    async (request, reply) => {
      const item = await recordCostEvent(CreateCostEventRequestSchema.parse(request.body));
      return reply.code(201).send({ item });
    },
  );

  app.post(
    '/api/intelligence/evidence',
    {
      schema: {
        body: CreateKnowledgeEvidenceRequestSchema,
        response: { 201: KnowledgeEvidenceResponseSchema },
      },
    },
    async (request, reply) => {
      const evidence = await recordEvidence(CreateKnowledgeEvidenceRequestSchema.parse(request.body));
      return reply.code(201).send({ evidence });
    },
  );

  app.post(
    '/api/intelligence/links',
    {
      schema: {
        body: CreateKnowledgeLinkRequestSchema,
        response: { 201: KnowledgeLinkResponseSchema },
      },
    },
    async (request, reply) => {
      const link = await recordKnowledgeLink(CreateKnowledgeLinkRequestSchema.parse(request.body));
      return reply.code(201).send({ link });
    },
  );

  app.post(
    '/api/intelligence/experiments/:id/promote-decision',
    {
      schema: {
        params: KnowledgeItemParamsSchema,
        response: { 201: KnowledgeItemResponseSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = KnowledgeItemParamsSchema.parse(request.params);
      try {
        const item = await promoteExperimentToDecision(id);
        return reply.code(201).send({ item });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('not found')) return reply.code(404).send(notFound(message));
        throw error;
      }
    },
  );

  app.post(
    '/api/intelligence/decisions/:id/promote-standard',
    {
      schema: {
        params: KnowledgeItemParamsSchema,
        body: CreateStandardRequestSchema,
        response: { 201: KnowledgeItemResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = KnowledgeItemParamsSchema.parse(request.params);
      try {
        const item = await promoteDecisionToStandard(id, CreateStandardRequestSchema.parse(request.body));
        return reply.code(201).send({ item });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('not found')) return reply.code(404).send(notFound(message));
        if (message.includes('duplicate key')) return reply.code(409).send(conflict(message));
        throw error;
      }
    },
  );
}
