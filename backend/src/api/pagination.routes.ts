/**
 * Pagination v1 — HTTP routes.
 *
 * All endpoints are guarded by `PAGINATION_V1_ENABLED`. When the flag is
 * false (production today), every route returns 503 — Stage 1.5 / Stage 2
 * continue to drive page production. When the flag flips to true, this layer
 * takes over: the operator clicks "Re-paginate Project", the preview PDF
 * loads from cache (or renders fresh), and image generation is gated on
 * per-page preview approval.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ApiErrorSchema,
  LayoutTemplateIdSchema,
  PageManifestSchema,
  ProjectConfigSchema,
  type ProjectConfig,
} from '@wildlands/shared';
import { getEnv } from '../env.js';
import { getProject } from '../db/repositories/projects.repo.js';
import { listManifests } from '../db/repositories/manifests.repo.js';
import {
  countApprovedPages,
  getEntryMetaByKeys,
  getPaginatedPageById,
  getPaginationReport,
  listPaginatedPagesForProject,
  persistPaginatedPages,
  recordPageApproval,
  type EntryMetaLookup,
  type PageRow,
} from '../db/repositories/pagination.repo.js';
import { paginateProject } from '../pipeline/stage-1.75-pagination/paginate.js';
import { directLayout } from '../pipeline/stage-6-layout/layout-director.js';
import { computePageGeometry } from '../pipeline/stage-6-layout/page-geometry.js';
import {
  type PaginatedPage,
  type PaginationFitStatus,
  type PageRole,
} from '../pipeline/stage-1.75-pagination/types.js';
import { renderPreviewPdf } from '../pipeline/stage-1.8-preview/render-preview.js';
import {
  previewCacheKey,
  readPreviewFromCache,
  writePreviewToCache,
} from '../pipeline/stage-1.8-preview/preview-cache.js';
import { isChromiumAvailable } from '../pipeline/stage-6-layout/render-pdf.js';

const ProjectParamsSchema = z.object({ id: z.string().uuid() });
const PageParamsSchema = z.object({ pageId: z.string().uuid() });

/**
 * 503 body: every route returns this shape when the feature flag is off so
 * callers (frontend + tests) get a stable, recognizable response instead of
 * a 404. The route handler pairs it with `reply.code(503).send(...)`.
 */
function flagDisabledResponse() {
  return {
    error: 'Service Unavailable',
    message: 'PAGINATION_V1_ENABLED is false; this endpoint is dormant.',
    statusCode: 503,
  };
}

/**
 * Reconstruct a `PaginatedPage` from a `pages` row + the project's config +
 * a pre-fetched entry-meta lookup. Pure — no I/O — so the caller batches
 * meta fetches.
 *
 * The `zones` field isn't persisted (it's a derived view of the layout
 * director). We recompute from the persisted text + layout so the preview
 * always matches the live geometry.
 */
function reconstructPaginatedPage(
  row: PageRow,
  config: ProjectConfig,
  entryMeta: Map<string, EntryMetaLookup>,
): PaginatedPage {
  const geometry = computePageGeometry(config.trimSize);
  const layoutTemplate = LayoutTemplateIdSchema.catch('LAYOUT_1_STANDARD').parse(row.layoutTemplate);
  const zones = directLayout({
    bodyMarkdown: row.readingFieldText ?? '',
    layoutTemplate,
    geometry,
    bodyPt: config.typography.bodyPt,
    lineHeight: config.typography.lineHeight,
  });
  const primaryEntryKey = row.entryKey ?? row.pageKey;
  const primary = entryMeta.get(primaryEntryKey);
  // Compacted pages: surface the primary entry's image subject only — the
  // first entry on a compacted page drives the illustration, per SPEC §5.5.
  return {
    plannedPageNumber: row.plannedPageNumber,
    entryKey: primaryEntryKey,
    entryTitle: primary?.entryTitle || row.pageKey,
    pageKey: row.pageKey,
    chapterNumber: row.chapterNumber,
    partN: row.partN,
    totalParts: row.totalParts,
    pageRole: row.pageRole as PageRole,
    carriesSubject: row.carriesSubject,
    compactedEntryKeys: (row.compactedEntryKeys as string[] | null) ?? null,
    imageSubject: row.carriesSubject ? (primary?.imageSubject ?? null) : null,
    layoutTemplate,
    readingFieldText: row.readingFieldText ?? '',
    readingFieldChars: row.readingFieldChars ?? 0,
    readingFieldWords: row.readingFieldWords ?? 0,
    fitStatus: row.fitStatus as PaginationFitStatus,
    zones,
    warnings: [],
  };
}

/** Collect every entry-key we need meta for, including secondary entries on
 *  compacted pages so the preview renderer can label them properly. */
function collectEntryKeys(rows: PageRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    if (row.entryKey) set.add(row.entryKey);
    const compacted = row.compactedEntryKeys as string[] | null;
    if (compacted) for (const key of compacted) set.add(key);
  }
  return Array.from(set);
}

export async function registerPaginationRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/projects/:id/paginate — run Pagination v1 and persist the result.
  // Body: { mode?: 'replace' | 'safe' } — `safe` (default) refuses to run when
  // approved pages exist; `replace` is the explicit destructive override.
  const PaginateBodySchema = z.object({ mode: z.enum(['replace', 'safe']).optional() });
  const PaginateResponseSchema = z.object({
    summary: z.object({
      totalEntries: z.number(),
      totalPages: z.number(),
      openers: z.number(),
      continuations: z.number(),
      compactions: z.number(),
      fitDistribution: z.record(z.string(), z.number()),
    }),
    warnings: z.array(z.string()),
    pagesWritten: z.number(),
  });
  app.post(
    '/api/projects/:id/paginate',
    {
      schema: {
        params: ProjectParamsSchema,
        body: PaginateBodySchema,
        response: {
          200: PaginateResponseSchema,
          400: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      if (!getEnv().PAGINATION_V1_ENABLED) {
        return reply.code(503).send(flagDisabledResponse());
      }
      const { id } = ProjectParamsSchema.parse(request.params);
      const { mode } = PaginateBodySchema.parse(request.body ?? {});
      const project = await getProject(id);
      if (!project) {
        return reply.code(404).send({ error: 'Not Found', message: 'Project not found.', statusCode: 404 });
      }

      // Approval-protection guard — mirrors the Stage 2 re-plan guard so the
      // operator never loses approved art by accident.
      const approvedPageCount = await countApprovedPages(id);
      if (approvedPageCount > 0 && mode !== 'replace') {
        return reply.code(409).send({
          error: 'Conflict',
          message: `Re-paginating will destroy ${approvedPageCount} approved page(s). Re-run with mode:"replace" to confirm.`,
          statusCode: 409,
        });
      }

      // Load PAGE manifests as the source of truth for Breakdown's entries.
      const manifestRows = await listManifests(id, 'PAGE');
      if (manifestRows.length === 0) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No page manifests found. Run Breakdown before paginating.',
          statusCode: 400,
        });
      }
      const entries = manifestRows.map((row) => PageManifestSchema.parse(row.content));
      const config = ProjectConfigSchema.parse(project.config);
      const result = paginateProject({ entries, config });
      const { pagesWritten } = await persistPaginatedPages({
        projectId: id,
        paginatedPages: result.pages,
      });
      return {
        summary: result.summary,
        warnings: result.warnings,
        pagesWritten,
      };
    },
  );

  // GET /api/projects/:id/pagination-report — read-only aggregate.
  app.get(
    '/api/projects/:id/pagination-report',
    { schema: { params: ProjectParamsSchema, response: { 404: ApiErrorSchema, 503: ApiErrorSchema } } },
    async (request, reply) => {
      if (!getEnv().PAGINATION_V1_ENABLED) {
        return reply.code(503).send(flagDisabledResponse());
      }
      const { id } = ProjectParamsSchema.parse(request.params);
      const project = await getProject(id);
      if (!project) {
        return reply.code(404).send({ error: 'Not Found', message: 'Project not found.', statusCode: 404 });
      }
      return getPaginationReport(id);
    },
  );

  // GET /api/pages/:pageId/preview — return a single-page PDF for the Reading
  // Field preview. Reads from cache or renders fresh and writes to cache.
  // No response schema: the payload is a PDF buffer, which the frontend
  // fetches via callPdf (treating the response body as a blob). Error bodies
  // fall through to the global error handler.
  app.get(
    '/api/pages/:pageId/preview',
    { schema: { params: PageParamsSchema, response: { 404: ApiErrorSchema, 503: ApiErrorSchema } } },
    async (request, reply) => {
    if (!getEnv().PAGINATION_V1_ENABLED) {
      return reply.code(503).send(flagDisabledResponse());
    }
    const { pageId } = PageParamsSchema.parse(request.params);
    const row = await getPaginatedPageById(pageId);
    if (!row) {
      return reply.code(404).send({ error: 'Not Found', message: 'Page not found.', statusCode: 404 });
    }
    const project = await getProject(row.projectId);
    if (!project) {
      return reply.code(404).send({ error: 'Not Found', message: 'Project not found.', statusCode: 404 });
    }
    const config = ProjectConfigSchema.parse(project.config);
    const entryKeys = collectEntryKeys([row]);
    const entryMeta = await getEntryMetaByKeys(row.projectId, entryKeys);
    const paginated = reconstructPaginatedPage(row, config, entryMeta);
    const key = previewCacheKey({ page: paginated, config });
    const cached = await readPreviewFromCache(key);
    if (cached) {
      reply.header('content-type', 'application/pdf');
      reply.header('cache-control', 'private, max-age=300');
      return reply.send(cached);
    }
    if (!isChromiumAvailable()) {
      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Chromium not available — preview rendering disabled on this instance.',
        statusCode: 503,
      });
    }
    const { buffer } = await renderPreviewPdf({ page: paginated, config });
    await writePreviewToCache(key, buffer);
    reply.header('content-type', 'application/pdf');
    reply.header('cache-control', 'private, max-age=300');
    return reply.send(buffer);
  });

  // POST /api/pages/:pageId/preview/approve — gate for image generation.
  const ApproveBodySchema = z.object({
    decidedBy: z.string().min(1).default('operator'),
    reason: z.string().optional(),
  });
  app.post(
    '/api/pages/:pageId/preview/approve',
    { schema: { params: PageParamsSchema, body: ApproveBodySchema, response: { 404: ApiErrorSchema, 503: ApiErrorSchema } } },
    async (request, reply) => {
      if (!getEnv().PAGINATION_V1_ENABLED) {
        return reply.code(503).send(flagDisabledResponse());
      }
      const { pageId } = PageParamsSchema.parse(request.params);
      const body = ApproveBodySchema.parse(request.body ?? {});
      try {
        const { page, approval } = await recordPageApproval({
          pageId,
          decision: 'APPROVED',
          reason: body.reason,
          decidedBy: body.decidedBy,
        });
        return { pageId: page.id, previewApproved: page.previewApproved, approvalId: approval.id };
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('page_not_found')) {
          return reply.code(404).send({ error: 'Not Found', message: err.message, statusCode: 404 });
        }
        throw err;
      }
    },
  );

  // POST /api/pages/:pageId/preview/reject — clears approval, logs the reason.
  const RejectBodySchema = z.object({
    decidedBy: z.string().min(1).default('operator'),
    reason: z.string().min(1),
  });
  app.post(
    '/api/pages/:pageId/preview/reject',
    { schema: { params: PageParamsSchema, body: RejectBodySchema, response: { 404: ApiErrorSchema, 503: ApiErrorSchema } } },
    async (request, reply) => {
      if (!getEnv().PAGINATION_V1_ENABLED) {
        return reply.code(503).send(flagDisabledResponse());
      }
      const { pageId } = PageParamsSchema.parse(request.params);
      const body = RejectBodySchema.parse(request.body ?? {});
      try {
        const { page, approval } = await recordPageApproval({
          pageId,
          decision: 'REJECTED',
          reason: body.reason,
          decidedBy: body.decidedBy,
        });
        return { pageId: page.id, previewApproved: page.previewApproved, approvalId: approval.id };
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('page_not_found')) {
          return reply.code(404).send({ error: 'Not Found', message: err.message, statusCode: 404 });
        }
        throw err;
      }
    },
  );
}

// Re-exports for testing convenience.
export { listPaginatedPagesForProject };
