/**
 * Subject + Badge cleanup route (Standard v1.1).
 *
 * Runs the deterministic extractor over a project's PAGE manifests and writes
 * cleanSubject / hazard / region / sourceConfidence / badgeSet back into each
 * manifest's content. No AI cost, no image spend, no pagination. Idempotent.
 *
 * Returns a verification report: counts + before/after for the known offenders.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PageManifestSchema } from '@wildlands/shared';
import { listManifests, updateManifestContent } from '../db/repositories/manifests.repo.js';
import { extractBadgeMetadata } from '../pipeline/subject-badges/extract-badges.js';

const ProjectParamsSchema = z.object({ id: z.string().uuid() });

/** Pages we promised to verify resolve correctly (SPEC §5). */
const WATCH = ['CH01_P008', 'CH02_P023', 'CH05_P008', 'CH05_P009', 'CH05_P016', 'CH05_P012'];

export async function registerSubjectBadgeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/projects/:id/recompute-subject-badges', async (request, reply) => {
    const { id } = ProjectParamsSchema.parse(request.params);
    const rows = await listManifests(id, 'PAGE');
    if (rows.length === 0) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'No PAGE manifests. Run Breakdown first.',
        statusCode: 400,
      });
    }

    let processed = 0;
    let cleaned = 0;
    const hazardCounts: Record<string, number> = {};
    const regionCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    const examples: Array<Record<string, unknown>> = [];
    // Region audit: old (current manifest) vs new (recomputed) distribution + changes.
    const oldRegionCounts: Record<string, number> = {};
    const regionChanges: Array<{ pageId: string; from: string; to: string; title: string }> = [];

    for (const row of rows) {
      const content = row.content as Record<string, unknown>;
      const pageId = String(content.pageId ?? row.externalId);
      const beforeSubject = String(content.imageSubject ?? '');
      const meta = extractBadgeMetadata({
        entryTitle: String(content.entryTitle ?? ''),
        bodyMarkdown: String(content.bodyMarkdown ?? ''),
        imageSubject: beforeSubject,
      });
      processed += 1;

      // Count distributions.
      for (const h of meta.hazard) hazardCounts[h] = (hazardCounts[h] ?? 0) + 1;
      regionCounts[meta.region] = (regionCounts[meta.region] ?? 0) + 1;
      sourceCounts[meta.sourceConfidence] = (sourceCounts[meta.sourceConfidence] ?? 0) + 1;

      // Region audit — compare the current persisted region to the recomputed one.
      const oldRegion = typeof content.region === 'string' ? content.region : '(none)';
      oldRegionCounts[oldRegion] = (oldRegionCounts[oldRegion] ?? 0) + 1;
      if (oldRegion !== meta.region) {
        regionChanges.push({
          pageId,
          from: oldRegion,
          to: meta.region,
          title: String(content.entryTitle ?? ''),
        });
      }

      // Did the subject actually change (cleaned)?
      if (meta.cleanSubject !== beforeSubject) cleaned += 1;

      // Merge into content + validate the round-trip so we never write garbage.
      const merged = {
        ...content,
        cleanSubject: meta.cleanSubject,
        hazard: meta.hazard,
        region: meta.region,
        sourceConfidence: meta.sourceConfidence,
        badgeSet: meta.badgeSet,
      };
      const parsed = PageManifestSchema.safeParse(merged);
      if (!parsed.success) {
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: `manifest ${pageId} failed schema after merge: ${parsed.error.issues[0]?.message}`,
          statusCode: 500,
        });
      }
      await updateManifestContent(row.id, parsed.data);

      if (WATCH.includes(pageId)) {
        examples.push({
          pageId,
          before: beforeSubject,
          cleanSubject: meta.cleanSubject,
          hazard: meta.hazard,
          region: meta.region,
          source: meta.sourceConfidence,
        });
      }
    }

    return {
      projectId: id,
      processed,
      cleaned,
      hazardCounts,
      regionCounts,
      sourceCounts,
      examples,
      regionAudit: {
        oldRegionCounts,
        newRegionCounts: regionCounts,
        changed: regionChanges.length,
        changes: regionChanges,
      },
    };
  });
}
