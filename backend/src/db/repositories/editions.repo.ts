/**
 * Editions repository. The edition layer for One Book → Many Editions: each row
 * selects a Style DNA + surface overrides for one rendering of the shared
 * manuscript. Read/write only the `editions` table — never page/render/print state.
 */
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../client.js';
import { editions } from '../schema/index.js';
import { DEFAULT_COLOR_EDITION } from '../../pipeline/editions/resolve-edition-style.js';

export type EditionRow = typeof editions.$inferSelect;

/** All editions for a project (default first, then by key). */
export async function listEditionsForProject(projectId: string): Promise<EditionRow[]> {
  const db = getDb();
  return db.select().from(editions).where(eq(editions.projectId, projectId)).orderBy(asc(editions.editionKey));
}

/** The project's default edition (the Color baseline), or null if not backfilled. */
export async function getDefaultEdition(projectId: string): Promise<EditionRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(editions)
    .where(and(eq(editions.projectId, projectId), eq(editions.isDefault, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getEditionByKey(projectId: string, editionKey: string): Promise<EditionRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(editions)
    .where(and(eq(editions.projectId, projectId), eq(editions.editionKey, editionKey)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * BACKFILL — idempotent. If the project has no default edition yet, create the
 * Color edition (the current production look). Existing renders/cover implicitly
 * belong to this default edition. Safe to run repeatedly; never duplicates.
 */
export async function ensureDefaultColorEdition(projectId: string): Promise<EditionRow> {
  const existing = await getDefaultEdition(projectId);
  if (existing) return existing;
  const db = getDb();
  const inserted = await db
    .insert(editions)
    .values({
      projectId,
      editionKey: DEFAULT_COLOR_EDITION.editionKey,
      label: DEFAULT_COLOR_EDITION.label,
      styleDnaId: DEFAULT_COLOR_EDITION.styleDnaId,
      paperType: DEFAULT_COLOR_EDITION.paperType,
      isDefault: true,
      status: 'active',
    })
    .onConflictDoNothing({ target: [editions.projectId, editions.editionKey] })
    .returning();
  // If a concurrent run inserted it, re-read.
  return inserted[0] ?? (await getDefaultEdition(projectId))!;
}
