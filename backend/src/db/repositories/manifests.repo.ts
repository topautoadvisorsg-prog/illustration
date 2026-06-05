/**
 * Manifest + page persistence — writes the output of Stage 1.5.
 *
 * What it does: persist locked book/chapter/page manifests and seed page rows
 * in a single transaction so a project is never left half-manifested.
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
  /**
   * Re-breakdown (Priority #3): when true, an existing manifest set is REPLACED.
   * Existing pages are deleted first (cascading their images + events), then
   * manifests, before the new set is written — all in one transaction.
   */
  replace?: boolean;
}

export interface PersistManifestsResult {
  manifestsWritten: number;
  pagesWritten: number;
}

/**
 * Write the first manifest set for a project.
 *
 * This is intentionally conservative until explicit manifest versioning lands:
 * reruns are blocked instead of deleting/replacing rows that downstream stages
 * may already reference.
 */
export async function persistManifests(input: PersistManifestsInput): Promise<PersistManifestsResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [existingManifest] = await tx
      .select({ id: manifests.id })
      .from(manifests)
      .where(eq(manifests.projectId, input.projectId))
      .limit(1);

    const [existingPage] = await tx
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.projectId, input.projectId))
      .limit(1);

    if (existingManifest || existingPage) {
      if (!input.replace) {
        throw new Error(
          'Project already has manifests/pages. Rerun is blocked until explicit manifest versioning is implemented.',
        );
      }
      // Replace: clear the old breakdown (pages cascade their images + events),
      // then manifests, before writing the fresh set.
      await tx.delete(pages).where(eq(pages.projectId, input.projectId));
      await tx.delete(manifests).where(eq(manifests.projectId, input.projectId));
    }

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

    const insertedManifests = await tx.insert(manifests).values(
      rows.map((r) => ({
        projectId: input.projectId,
        kind: r.kind,
        version: 1,
        externalId: r.externalId,
        content: r.content as object,
        locked: true,
      })),
    ).returning({
      id: manifests.id,
      kind: manifests.kind,
      externalId: manifests.externalId,
    });

    const pageManifestIds = new Map(
      insertedManifests
        .filter((manifest) => manifest.kind === 'PAGE')
        .map((manifest) => [manifest.externalId, manifest.id]),
    );

    if (input.pageSeeds.length > 0) {
      await tx.insert(pages).values(
        input.pageSeeds.map((p) => {
          const manifestId = pageManifestIds.get(p.pageKey);
          if (!manifestId) {
            throw new Error(`No PAGE manifest was inserted for page seed ${p.pageKey}.`);
          }

          return {
            projectId: input.projectId,
            manifestId,
            pageKey: p.pageKey,
            chapterNumber: p.chapterNumber,
            plannedPageNumber: p.plannedPageNumber,
            layoutTemplate: p.layoutTemplate,
            imagePrompt: p.imagePrompt,
            status: 'PLANNED' as const,
          };
        }),
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

export async function getPageById(id: string): Promise<PageRow | undefined> {
  const db = getDb();
  const [row] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  return row;
}

export async function setPageStatus(id: string, status: PageRow['status']): Promise<PageRow | undefined> {
  const db = getDb();
  const [row] = await db
    .update(pages)
    .set({ status, updatedAt: new Date() })
    .where(eq(pages.id, id))
    .returning();
  return row;
}

export async function updatePagePlanning(
  projectId: string,
  pageKey: string,
  planning: {
    layoutTemplate: string;
    imagePrompt: string;
    imagePromptSha256: string;
  },
): Promise<PageRow | undefined> {
  const db = getDb();
  const [row] = await db
    .update(pages)
    .set({
      layoutTemplate: planning.layoutTemplate,
      imagePrompt: planning.imagePrompt,
      imagePromptSha256: planning.imagePromptSha256,
      status: 'PLANNED',
      updatedAt: new Date(),
    })
    .where(and(eq(pages.projectId, projectId), eq(pages.pageKey, pageKey)))
    .returning();
  return row;
}
