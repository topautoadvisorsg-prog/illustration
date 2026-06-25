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
import { assembleProjectModel, buildKindleEpub } from '../pipeline/stage-8-epub/build-epub.js';

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

  // Full in-console preview model: structure (chapters with kind), per-entry text
  // for click-through, the image plan, and the build report. Read-only, no packing,
  // no spend — so "preview first, export second" works inside the platform.
  app.get('/api/projects/:projectId/export/kindle-epub/preview', async (request, reply) => {
    const parsed = ProjectParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid projectId.', statusCode: 400 });
    }
    try {
      const { model, meta, fileName, entrySource } = await assembleProjectModel(parsed.data.projectId);
      return reply.send({
        fileName,
        entrySource,
        meta: {
          title: meta.title,
          subtitle: meta.subtitle,
          authors: meta.authors,
          language: meta.language,
          series: meta.series,
          coverAlt: meta.coverAlt,
        },
        imagePlan: model.imagePlan,
        stats: model.stats,
        // Full structure + text for the operator preview (click-through reading).
        chapters: model.chapters.map((c) => ({
          kind: c.kind,
          title: c.title,
          beforeToc: c.beforeToc ?? false,
          content: c.entries ? undefined : c.content,
          entries: c.entries?.map((e) => ({
            title: e.title,
            scientificName: e.scientificName,
            bodyHtml: e.bodyHtml,
            words: e.words,
            heroPlacement: e.heroPlacement,
            heroIncluded: e.heroIncluded,
          })),
        })),
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
