/**
 * Stage 8 — Kindle EPUB export routes.
 *
 * POST /api/projects/:projectId/export/kindle-epub
 *   Builds a reflowable Kindle EPUB from the project's existing structured data
 *   (real page text + chapter/entry titles + metadata + cover) and returns the
 *   EPUB bytes. READ-ONLY: no re-render, no image spend, no writes to pages,
 *   renders, or print files. The print pipeline is untouched.
 *
 * GET /api/projects/:projectId/export/kindle-epub/preview
 *   Returns the build report (chapter/entry/word counts + skipped page kinds)
 *   as JSON without downloading the file — for the operator UI.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildKindleEpub } from '../pipeline/stage-8-epub/build-epub.js';

const ProjectParamsSchema = z.object({ projectId: z.string().uuid() });

export async function registerEpubRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/projects/:projectId/export/kindle-epub', async (request, reply) => {
    const parsed = ProjectParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid projectId.', statusCode: 400 });
    }
    try {
      const result = await buildKindleEpub(parsed.data.projectId);
      reply.header('content-type', 'application/epub+zip');
      reply.header('content-disposition', `attachment; filename="${result.fileName}"`);
      reply.header('cache-control', 'no-store');
      // Build report surfaced in headers so a client can show what was included.
      reply.header('x-epub-chapters', String(result.model.stats.chapters));
      reply.header('x-epub-entries', String(result.model.stats.entries));
      reply.header('x-epub-words', String(result.model.stats.words));
      reply.header('x-epub-cover', String(result.coverEmbedded));
      return reply.send(result.buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('project_not_found')) {
        return reply.code(404).send({ error: 'Not Found', message, statusCode: 404 });
      }
      return reply.code(500).send({ error: 'Internal Server Error', message: `EPUB export failed: ${message}`, statusCode: 500 });
    }
  });

  app.get('/api/projects/:projectId/export/kindle-epub/preview', async (request, reply) => {
    const parsed = ProjectParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid projectId.', statusCode: 400 });
    }
    try {
      const result = await buildKindleEpub(parsed.data.projectId);
      return reply.send({
        fileName: result.fileName,
        coverEmbedded: result.coverEmbedded,
        meta: {
          title: result.meta.title,
          subtitle: result.meta.subtitle,
          authors: result.meta.authors,
          language: result.meta.language,
          series: result.meta.series,
        },
        stats: result.model.stats,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('project_not_found')) {
        return reply.code(404).send({ error: 'Not Found', message, statusCode: 404 });
      }
      return reply.code(500).send({ error: 'Internal Server Error', message: `EPUB preview failed: ${message}`, statusCode: 500 });
    }
  });
}
