/**
 * Forensic review workflow — export, verdict entry, routing override, prompt.
 *
 * These endpoints exist so the operator never needs a coding agent to run a
 * review. Everything the workflow requires (which pages, which renders, the
 * images themselves, the prompt, and somewhere to put the answers) is reachable
 * from the console.
 *
 * Nothing here re-renders, promotes a canonical render, edits manuscript text,
 * or calls a paid model.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';

import { ApiErrorSchema } from '@wildlands/shared';
import { getDb } from '../db/client.js';
import { pages, wholePageRenders } from '../db/schema/index.js';
import { getProject } from '../db/repositories/projects.repo.js';
import {
  listRenderReviews,
  recordRenderReview,
  type RenderReviewMethod,
  type RenderReviewStatus,
} from '../db/repositories/render-reviews.repo.js';
import {
  buildExportPlan,
  exportToFolder,
  exportToZip,
  loadExportablePages,
  policyForProject,
} from '../services/review-routing/review-export.service.js';
import { classifyReviewRoute } from '../services/review-routing/policy.js';
import { DEFAULT_BATCH_SIZE, type ExportSelection } from '../services/review-routing/export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The official operator template, read from disk VERBATIM.
 *
 * Deliberately a .md file rather than a TypeScript string: the prompt's power
 * comes from its exact wording, and every round-trip through source escaping is
 * a chance to silently alter it. Read once and cached.
 */
let cachedPrompt: string | null = null;
export function forensicPrompt(): string {
  if (cachedPrompt === null) {
    cachedPrompt = readFileSync(
      path.join(__dirname, '..', 'services', 'review-routing', 'forensic-prompt.md'),
      'utf8',
    );
  }
  return cachedPrompt;
}

const ProjectParams = z.object({ id: z.string().uuid() });
const ExportBody = z.object({
  selection: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('ROUTE'), route: z.enum(['AI_REVIEW', 'MANUAL_REVIEW']) }),
    z.object({ kind: z.literal('ALL_UNREVIEWED') }),
    z.object({ kind: z.literal('PAGE_KEYS'), pageKeys: z.array(z.string().min(1)).min(1) }),
  ]),
  batchSize: z.number().int().min(1).max(100).optional(),
  /** 'zip' streams a download; 'folder' writes locally and returns the path. */
  format: z.enum(['zip', 'folder']).default('zip'),
});
const ReviewBody = z.object({
  renderId: z.string().uuid(),
  status: z.enum(['APPROVED', 'ISSUE_FOUND', 'UNCERTAIN']),
  method: z.enum(['OPERATOR_MANUAL', 'AI_CHAT', 'AI_API']).default('AI_CHAT'),
  findings: z.unknown().optional(),
  notes: z.string().optional(),
  reviewedBy: z.string().min(1).default('operator'),
  reviewerLabel: z.string().optional(),
});
const EscalateBody = z.object({
  pageKey: z.string().min(1),
  /** null clears the escalation. */
  reason: z.string().min(1).nullable(),
});

export async function registerReviewWorkflowRoutes(app: FastifyInstance): Promise<void> {
  // ── The official prompt, for the console's Copy Prompt action ──
  app.get('/api/review/forensic-prompt', async () => ({
    version: 'forensic-pixel-qa-v1',
    prompt: forensicPrompt(),
  }));

  // ── Review board: one call giving the console everything it needs ──
  // routing + current render + current verdict, per page. Routing and verdict
  // are separate fields and are never merged into a single "state".
  app.get(
    '/api/projects/:id/review-board',
    { schema: { params: ProjectParams, response: { 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParams.parse(request.params);
      if (!(await getProject(id))) {
        return reply.code(404).send({ error: 'Not Found', message: 'Project not found.', statusCode: 404 });
      }
      const [pageList, policy] = await Promise.all([loadExportablePages(id), policyForProject(id)]);
      const rows = pageList
        .map((p) => {
          const r = classifyReviewRoute(p, policy);
          return {
            pageKey: p.pageKey,
            renderId: p.renderId,
            renderVersion: p.renderVersion,
            readableWords: p.readableWords,
            plannedPageNumber: p.plannedPageNumber,
            spineOrder: p.spineOrder,
            inScope: r.inScope,
            reviewRoute: r.route,
            reviewRouteLabel: r.label,
            reviewRouteReason: r.reason,
            manualCheckRequired: r.manualCheckRequired,
            overridden: r.overridden,
            escalated: r.escalated,
            reviewStatus: p.reviewStatus,
          };
        })
        .sort((a, b) => (a.spineOrder ?? a.plannedPageNumber ?? 0) - (b.spineOrder ?? b.plannedPageNumber ?? 0));

      const tally = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
      return {
        threshold: policy.highTextWordThreshold,
        pages: rows,
        counts: {
          total: rows.length,
          aiReview: tally((r) => r.inScope && r.reviewRoute === 'AI_REVIEW'),
          manualReview: tally((r) => r.inScope && r.reviewRoute === 'MANUAL_REVIEW'),
          unreviewed: tally((r) => r.reviewStatus === 'UNREVIEWED'),
          approved: tally((r) => r.reviewStatus === 'APPROVED'),
          issueFound: tally((r) => r.reviewStatus === 'ISSUE_FOUND'),
          uncertain: tally((r) => r.reviewStatus === 'UNCERTAIN'),
          aiReviewUnreviewed: tally((r) => r.reviewRoute === 'AI_REVIEW' && r.reviewStatus === 'UNREVIEWED'),
          manualUnreviewed: tally((r) => r.reviewRoute === 'MANUAL_REVIEW' && r.reviewStatus === 'UNREVIEWED'),
          escalated: tally((r) => r.escalated),
          overridden: tally((r) => r.overridden),
        },
      };
    },
  );

  // ── Preview an export without producing files ──
  app.post(
    '/api/projects/:id/review-export/plan',
    { schema: { params: ProjectParams, body: ExportBody, response: { 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParams.parse(request.params);
      if (!(await getProject(id))) {
        return reply.code(404).send({ error: 'Not Found', message: 'Project not found.', statusCode: 404 });
      }
      const body = ExportBody.parse(request.body);
      const plan = await buildExportPlan(id, body.selection as ExportSelection, body.batchSize ?? DEFAULT_BATCH_SIZE);
      return { ...plan, batches: plan.batches.map((b) => ({ route: b.route, dir: b.dir, pages: b.entries.length })) };
    },
  );

  // ── Produce the export ──
  app.post(
    '/api/projects/:id/review-export',
    { schema: { params: ProjectParams, body: ExportBody, response: { 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParams.parse(request.params);
      if (!(await getProject(id))) {
        return reply.code(404).send({ error: 'Not Found', message: 'Project not found.', statusCode: 404 });
      }
      const body = ExportBody.parse(request.body);
      const plan = await buildExportPlan(id, body.selection as ExportSelection, body.batchSize ?? DEFAULT_BATCH_SIZE);
      if (plan.counts.total === 0) {
        // Not an error: an empty selection is a legitimate answer (e.g. every
        // page in that route already reviewed). Say so rather than shipping a
        // zip containing nothing.
        return { ok: false, message: 'Nothing matched that selection.', counts: plan.counts, skipped: plan.skipped };
      }

      if (body.format === 'folder') {
        const stamp = plan.exportedAt.replace(/[:.]/g, '-');
        const root = path.resolve(process.cwd(), 'outputs', 'review-exports', `${stamp}`);
        await exportToFolder(plan, root);
        return {
          ok: true,
          format: 'folder',
          path: root,
          counts: plan.counts,
          skipped: plan.skipped,
          batches: plan.batches.map((b) => ({ dir: b.dir, pages: b.entries.length })),
        };
      }

      const zip = await exportToZip(plan);
      const stamp = plan.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="review-export-${stamp}.zip"`)
        .send(zip);
    },
  );

  // ── Same export, as a GET so the console can download with a plain link ──
  // A browser cannot POST to a download target without blob plumbing, and the
  // operator needs this to be one click.
  app.get(
    '/api/projects/:id/review-export.zip',
    {
      schema: {
        params: ProjectParams,
        querystring: z.object({
          route: z.enum(['AI_REVIEW', 'MANUAL_REVIEW']).optional(),
          unreviewed: z.enum(['true', 'false']).optional(),
          pageKeys: z.string().optional(),
          batchSize: z.coerce.number().int().min(1).max(100).optional(),
        }),
        response: { 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParams.parse(request.params);
      if (!(await getProject(id))) {
        return reply.code(404).send({ error: 'Not Found', message: 'Project not found.', statusCode: 404 });
      }
      const q = request.query as { route?: 'AI_REVIEW' | 'MANUAL_REVIEW'; unreviewed?: string; pageKeys?: string; batchSize?: number };
      const selection: ExportSelection = q.pageKeys
        ? { kind: 'PAGE_KEYS', pageKeys: q.pageKeys.split(',').map((s) => s.trim()).filter(Boolean) }
        : q.unreviewed === 'true'
          ? { kind: 'ALL_UNREVIEWED' }
          : { kind: 'ROUTE', route: q.route ?? 'AI_REVIEW' };

      const plan = await buildExportPlan(id, selection, q.batchSize ?? DEFAULT_BATCH_SIZE);
      if (plan.counts.total === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Nothing matched that selection.', statusCode: 404 });
      }
      const zip = await exportToZip(plan);
      const stamp = plan.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="review-export-${stamp}.zip"`)
        .send(zip);
    },
  );

  // ── Record a verdict against the EXACT render reviewed ──
  app.post(
    '/api/projects/:id/render-reviews',
    { schema: { params: ProjectParams, body: ReviewBody, response: { 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParams.parse(request.params);
      const body = ReviewBody.parse(request.body);
      try {
        const reviewId = await recordRenderReview({
          renderId: body.renderId,
          projectId: id,
          status: body.status as RenderReviewStatus,
          method: body.method as RenderReviewMethod,
          findings: body.findings,
          notes: body.notes ?? null,
          reviewedBy: body.reviewedBy,
          reviewerLabel: body.reviewerLabel ?? null,
        });
        return { ok: true, reviewId, renderId: body.renderId, status: body.status };
      } catch (err) {
        return reply
          .code(404)
          .send({ error: 'Not Found', message: err instanceof Error ? err.message : 'render not found', statusCode: 404 });
      }
    },
  );

  // ── Full verdict history for one render (provenance, never overwritten) ──
  app.get(
    '/api/projects/:id/render-reviews/:renderId',
    { schema: { params: ProjectParams.extend({ renderId: z.string().uuid() }) } },
    async (request) => {
      const { renderId } = ProjectParams.extend({ renderId: z.string().uuid() }).parse(request.params);
      return { renderId, reviews: await listRenderReviews(renderId) };
    },
  );

  // ── High-risk escalation. Only ever strengthens review. ──
  app.patch(
    '/api/projects/:id/review-escalation',
    { schema: { params: ProjectParams, body: EscalateBody, response: { 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParams.parse(request.params);
      const { pageKey, reason } = EscalateBody.parse(request.body);
      const db = getDb();
      const updated = await db
        .update(pages)
        .set({ reviewEscalationReason: reason })
        .where(and(eq(pages.projectId, id), eq(pages.pageKey, pageKey)))
        .returning({ id: pages.id });
      if (updated.length === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Page not found.', statusCode: 404 });
      }
      return { ok: true, pageKey, reviewEscalationReason: reason };
    },
  );

  // ── Which render is currently under review for a page, plus its history ──
  app.get(
    '/api/projects/:id/pages/:pageKey/review',
    { schema: { params: ProjectParams.extend({ pageKey: z.string().min(1) }), response: { 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id, pageKey } = ProjectParams.extend({ pageKey: z.string().min(1) }).parse(request.params);
      const db = getDb();
      const [page] = await db
        .select()
        .from(pages)
        .where(and(eq(pages.projectId, id), eq(pages.pageKey, pageKey)))
        .limit(1);
      if (!page) {
        return reply.code(404).send({ error: 'Not Found', message: 'Page not found.', statusCode: 404 });
      }
      const renders = await db
        .select()
        .from(wholePageRenders)
        .where(eq(wholePageRenders.pageId, page.id))
        .orderBy(desc(wholePageRenders.version));
      const current = renders.find((r) => r.approvedForBook) ?? renders.find((r) => r.status === 'RENDERED');
      return {
        pageKey,
        readableWords: (page as { readableWords?: number | null }).readableWords ?? null,
        currentRenderId: current?.id ?? null,
        currentRenderVersion: current?.version ?? null,
        renders: renders.map((r) => ({ id: r.id, version: r.version, status: r.status, approvedForBook: r.approvedForBook })),
        reviews: current ? await listRenderReviews(current.id) : [],
      };
    },
  );
}
