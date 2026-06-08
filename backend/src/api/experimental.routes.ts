/**
 * Whole-page render (AI-first pipeline) — HTTP routes.
 *
 * Every route is dormant unless `WHOLE_PAGE_EXPERIMENT_ENABLED` is true (503
 * envelope mirrors the Pagination v1 pattern). Persists to `whole_page_renders`
 * and never mutates legacy `images` / `pages.status` state.
 *
 * Selection model:
 *   approve         → status APPROVED (many versions allowed)
 *   select-for-book → approved_for_book + active (one per page)
 *   reject          → status REJECTED, clears book selection
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getEnv } from '../env.js';
import { createAndRunRender } from '../pipeline/experimental/whole-page-render/render-whole-page.js';
import { printPrepRender } from '../pipeline/print-prep/print-prep.js';
import {
  approveRender,
  getProjectRenderSummary,
  getRenderById,
  listRendersForPage,
  rejectRender,
  selectForBook,
  ATTEMPT_SOFT_CAP,
  type WholePageRenderRow,
} from '../db/repositories/whole-page-render.repo.js';
import { getProjectStorage } from '../services/storage/project-storage.js';

const PageParamsSchema = z.object({ pageId: z.string().uuid() });
const RenderParamsSchema = z.object({ renderId: z.string().uuid() });
const ProjectParamsSchema = z.object({ projectId: z.string().uuid() });

const RenderBodySchema = z.object({
  decidedBy: z.string().min(1).default('operator'),
  notes: z.string().optional(),
});
const DecisionBodySchema = z.object({
  decidedBy: z.string().min(1).default('operator'),
  reason: z.string().optional(),
});

function flagDisabledResponse() {
  return {
    error: 'Service Unavailable',
    message: 'WHOLE_PAGE_EXPERIMENT_ENABLED is false; the whole-page render pipeline is dormant.',
    statusCode: 503,
  };
}

function flagOff(): boolean {
  return !getEnv().WHOLE_PAGE_EXPERIMENT_ENABLED;
}

/** Serialize a render row to a stable JSON shape (Dates → ISO strings). */
function serializeRender(row: WholePageRenderRow) {
  return {
    id: row.id,
    pageId: row.pageId,
    projectId: row.projectId,
    version: row.version,
    status: row.status,
    standardVersion: row.standardVersion,
    imagePath: row.imagePath,
    specPath: row.specPath,
    promptPath: row.promptPath,
    widthPx: row.widthPx,
    heightPx: row.heightPx,
    model: row.model,
    active: row.active,
    approvedForBook: row.approvedForBook,
    attempts: row.attempts,
    errorMessage: row.errorMessage,
    rejectionReason: row.rejectionReason,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

export async function registerExperimentalRoutes(app: FastifyInstance): Promise<void> {
  // ── Serve an artifact (image / spec / prompt) by stored relative path ──
  const FileQuerySchema = z.object({ path: z.string().min(1) });
  app.get('/api/experimental/whole-page-render/file', async (request, reply) => {
    if (flagOff()) return reply.code(503).send(flagDisabledResponse());
    const parsed = FileQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Missing or invalid `path`.', statusCode: 400 });
    }
    const relPath = parsed.data.path;
    if (relPath.includes('..') || !relPath.includes('/experimental/whole-page/')) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Path must be under experimental/whole-page/.', statusCode: 400 });
    }
    try {
      const buf = await getProjectStorage().readProjectFile(relPath);
      const ext = relPath.split('.').pop() ?? '';
      const ct = ext === 'png' ? 'image/png' : ext === 'json' ? 'application/json' : 'text/plain; charset=utf-8';
      reply.header('content-type', ct);
      reply.header('cache-control', 'no-store');
      return reply.send(buf);
    } catch {
      return reply.code(404).send({ error: 'Not Found', message: 'Artifact not found.', statusCode: 404 });
    }
  });

  // ── Generate (or regenerate) a whole-page render for a page ──
  // Shared by POST :pageId and POST :pageId/regenerate. Base Fastify types are
  // intentional: params/body are validated explicitly with zod below, so the
  // handler treats them as untrusted input rather than relying on route generics.
  const runHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (flagOff()) return reply.code(503).send(flagDisabledResponse());
    const { pageId } = PageParamsSchema.parse(request.params);
    const body = RenderBodySchema.parse(request.body ?? {});
    try {
      const result = await createAndRunRender(pageId, {});
      const warnings: string[] = [];
      if (result.softCapExceeded) {
        warnings.push(`attempt_soft_cap_exceeded:${result.attempts}>${ATTEMPT_SOFT_CAP}`);
      }
      return {
        render: serializeRender(result.row),
        version: result.version,
        attempts: result.attempts,
        status: result.status,
        warnings,
        decidedBy: body.decidedBy,
        assembledPromptPreview: result.row.assembledPrompt.slice(0, 2000),
        specPreview: result.row.specJson,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('page_not_found') || message.startsWith('project_not_found')) {
        return reply.code(404).send({ error: 'Not Found', message, statusCode: 404 });
      }
      request.log.error({ err }, 'whole-page render failed (infrastructure)');
      return reply.code(500).send({ error: 'Internal Server Error', message, statusCode: 500 });
    }
  };

  app.post('/api/experimental/whole-page-render/:pageId', runHandler);
  app.post('/api/experimental/whole-page-render/:pageId/regenerate', runHandler);

  // ── List all versions for a page ──
  app.get('/api/experimental/whole-page-render/page/:pageId/versions', async (request, reply) => {
    if (flagOff()) return reply.code(503).send(flagDisabledResponse());
    const { pageId } = PageParamsSchema.parse(request.params);
    const rows = await listRendersForPage(pageId);
    return { pageId, versions: rows.map(serializeRender) };
  });

  // ── Approve a version (many allowed) ──
  app.post('/api/experimental/whole-page-render/:renderId/approve', async (request, reply) => {
    if (flagOff()) return reply.code(503).send(flagDisabledResponse());
    const { renderId } = RenderParamsSchema.parse(request.params);
    const body = DecisionBodySchema.parse(request.body ?? {});
    const existing = await getRenderById(renderId);
    if (!existing) return reply.code(404).send({ error: 'Not Found', message: `render_not_found:${renderId}`, statusCode: 404 });
    if (existing.status !== 'RENDERED' && existing.status !== 'APPROVED') {
      return reply.code(409).send({ error: 'Conflict', message: `cannot_approve_status:${existing.status}`, statusCode: 409 });
    }
    const row = await approveRender(renderId, body.decidedBy);
    return { render: serializeRender(row) };
  });

  // ── Print-prep a render (STD-3): KDP-ready PNG + PDF + preflight ──
  // Allowed on any RENDERED render (deterministic, no spend). Assembly later
  // consumes only approved_for_book + preflight_passed.
  app.post('/api/experimental/whole-page-render/:renderId/print-prep', async (request, reply) => {
    if (flagOff()) return reply.code(503).send(flagDisabledResponse());
    const { renderId } = RenderParamsSchema.parse(request.params);
    const existing = await getRenderById(renderId);
    if (!existing) return reply.code(404).send({ error: 'Not Found', message: `render_not_found:${renderId}`, statusCode: 404 });
    if (!existing.imagePath || (existing.status !== 'RENDERED' && existing.status !== 'APPROVED')) {
      return reply.code(409).send({ error: 'Conflict', message: `cannot_print_prep_status:${existing.status}`, statusCode: 409 });
    }
    try {
      const result = await printPrepRender(renderId);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      request.log.error({ err }, 'print-prep failed');
      return reply.code(500).send({ error: 'Internal Server Error', message, statusCode: 500 });
    }
  });

  // ── Select THE version for the book (one per page) ──
  app.post('/api/experimental/whole-page-render/:renderId/select-for-book', async (request, reply) => {
    if (flagOff()) return reply.code(503).send(flagDisabledResponse());
    const { renderId } = RenderParamsSchema.parse(request.params);
    const body = DecisionBodySchema.parse(request.body ?? {});
    try {
      const row = await selectForBook(renderId, body.decidedBy);
      return { render: serializeRender(row) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('render_not_found')) {
        return reply.code(404).send({ error: 'Not Found', message, statusCode: 404 });
      }
      if (message.startsWith('render_not_approved')) {
        return reply.code(409).send({ error: 'Conflict', message: 'A render must be APPROVED before it can be selected for the book.', statusCode: 409 });
      }
      throw err;
    }
  });

  // ── Reject a version ──
  app.post('/api/experimental/whole-page-render/:renderId/reject', async (request, reply) => {
    if (flagOff()) return reply.code(503).send(flagDisabledResponse());
    const { renderId } = RenderParamsSchema.parse(request.params);
    const body = DecisionBodySchema.parse(request.body ?? {});
    const existing = await getRenderById(renderId);
    if (!existing) return reply.code(404).send({ error: 'Not Found', message: `render_not_found:${renderId}`, statusCode: 404 });
    const row = await rejectRender(renderId, body.decidedBy, body.reason);
    return { render: serializeRender(row) };
  });

  // ── Project-wide render dashboard ──
  app.get('/api/experimental/whole-page-render/project/:projectId', async (request, reply) => {
    if (flagOff()) return reply.code(503).send(flagDisabledResponse());
    const { projectId } = ProjectParamsSchema.parse(request.params);
    const summary = await getProjectRenderSummary(projectId);
    return {
      projectId: summary.projectId,
      total: summary.total,
      byStatus: summary.byStatus,
      bookReady: summary.bookReady,
      renders: summary.rows.map(serializeRender),
    };
  });
}
