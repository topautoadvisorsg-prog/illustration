/**
 * Entries repository (Phase A). The first-class entry layer — derived/backfilled
 * READ-ONLY from pages + manifests; never mutates page/render/print state.
 */

import { asc, eq } from 'drizzle-orm';
import { getDb } from '../client.js';
import { entries } from '../schema/index.js';
import type { DerivedEntry } from '../../pipeline/entries/derive-entries.js';

export type EntryRow = typeof entries.$inferSelect;

/** Replace ALL entries for a project (idempotent backfill): delete then insert. */
export async function replaceProjectEntries(projectId: string, derived: DerivedEntry[]): Promise<number> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.delete(entries).where(eq(entries.projectId, projectId));
    if (derived.length === 0) return 0;
    await tx.insert(entries).values(
      derived.map((e) => ({
        projectId,
        entryKey: e.entryKey,
        chapterNumber: e.chapterNumber,
        chapterTitle: e.chapterTitle,
        entryTitle: e.entryTitle,
        scientificName: e.scientificName,
        section: e.section,
        entryType: e.entryType,
        firstPageKey: e.firstPageKey,
        pageKeys: e.pageKeys,
        pageCount: e.pageCount,
        readingOrder: e.readingOrder,
        wordCount: e.wordCount,
      })),
    );
    return derived.length;
  });
}

/** All entries for a project, in reading order. Empty array if none backfilled yet. */
export async function listEntriesForProject(projectId: string): Promise<EntryRow[]> {
  const db = getDb();
  return db.select().from(entries).where(eq(entries.projectId, projectId)).orderBy(asc(entries.readingOrder));
}
