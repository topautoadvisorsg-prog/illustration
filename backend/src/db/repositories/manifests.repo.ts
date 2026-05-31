/**
 * Manifest + page persistence — writes the output of Stage 1.5.
 *
 * What it does: persist book/chapter/page manifests and seed page rows in a
 * single transaction so a project is never left half-manifested.
 * Input: structured manifest objects from the Stage 1.5 generator.
 * Output: counts of what was written.
 */

import { and, eq } from 'drizzle-orm';
import type { BookManifest, ChapterManifest, ManifestKind } from '@wildlands/shared';
import { getDb } from '../client.js';
import { manifests, pages } from '../schema/index.js';

export type ManifestRow = typeof manifests.$inferSelect;
export type PageRow = typeof pages.$inferSelect;

export interface PageSeed {
  pageKey: string;
  chapterNumber: number;
  plannedPageNumber: number;
  layoutTemplate: string;
  imagePrompt: string | null;
}

export interface PersistManifestsInput {
  projectId: string;
  book: BookManifest;
  chapters: ChapterManifest[];
  pageManifests: Array<{ externalId: string; content: unknown }>;
  pageSeeds: PageSeed[];
}

export interface PersistManifestsResult {
  manifestsWritten: number;
  pagesWritten: number;
}

/** Delete any prior manifests/pages for the project, then write the new set. */
export async function persistManifests(input: PersistManifestsInput): Promise<PersistManifestsResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    // Idempotent re-run: clear previous planning artifacts for this project.
    await tx.delete(pages).where(eq(pages.projectId, input.projectId));
    await tx.delete(manifests).where(eq(manifests.projectId, input.projectId));

    const rows: Array<{ kind: ManifestKind; externalId: string; content: unknown }> = [
      { kind: 'BOOK', externalId: 'BOOK', content: input.book },
      ...input.chapters.map((c) => ({
        kind: 'CHAPTER' as const,
        externalId: `CH${String(c.chapterNumber).padStart(2, '0')}`,
        content: c,
      })),
      ...input.pageManifests.map((p) => ({
        kind: 'PAGE' as const,
        externalId: p.externalId,
        content: p.content,
      })),
    ];

    await tx.insert(manifests).values(
      rows.map((r) => ({
        projectId: input.projectId,
        kind: r.kind,
        version: 1,
        externalId: r.externalId,
        content: r.content as object,
        locked: false,
      })),
    );

    if (input.pageSeeds.length > 0) {
      await tx.insert(pages).values(
        input.pageSeeds.map((p) => ({
          projectId: input.projectId,
          pageKey: p.pageKey,
          chapterNumber: p.chapterNumber,
          plannedPageNumber: p.plannedPageNumber,
          layoutTemplate: p.layoutTemplate,
          imagePrompt: p.imagePrompt,
          status: 'PLANNED' as const,
        })),
      );
    }

    return { manifestsWritten: rows.length, pagesWritten: input.pageSeeds.length };
  });
}

export async function listManifests(projectId: string, kind?: ManifestKind): Promise<ManifestRow[]> {
  const db = getDb();
  const where = kind
    ? and(eq(manifests.projectId, projectId), eq(manifests.kind, kind))
    : eq(manifests.projectId, projectId);
  return db.select().from(manifests).where(where);
}

export async function listPages(projectId: string): Promise<PageRow[]> {
  const db = getDb();
  return db.select().from(pages).where(eq(pages.projectId, projectId)).orderBy(pages.plannedPageNumber);
}
