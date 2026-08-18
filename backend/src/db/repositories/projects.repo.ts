/**
 * Project persistence — typed CRUD over the `projects` table.
 *
 * What it does: create / read projects, update manuscript pointer + status.
 * Input: plain objects validated upstream by the route layer.
 * Output: rows shaped to the @wildlands/shared Project contract.
 */

import { eq } from 'drizzle-orm';
import type { ProjectConfig, ProjectStatus } from '@wildlands/shared';
import { getDb } from '../client.js';
import { manifests, pages, projects } from '../schema/index.js';
import { getMasterStyleBlock, MIN_REAL_STYLE_BLOCK_CHARS } from '../../services/style/master-style-blocks.js';

export interface NewProjectInput {
  config: ProjectConfig;
}

export type ProjectRow = typeof projects.$inferSelect;

/**
 * Inject the brand's canonical master style block whenever the incoming config
 * still carries the short placeholder/stub. This guarantees image prompts are
 * anchored to the real visual DNA instead of a 5-word stub.
 */
function resolveConfig(config: ProjectConfig): ProjectConfig {
  const current = config.imageGeneration.masterStyleBlockText ?? '';
  if (current.trim().length >= MIN_REAL_STYLE_BLOCK_CHARS) return config;
  const block = getMasterStyleBlock(config.brand);
  return {
    ...config,
    imageGeneration: {
      ...config.imageGeneration,
      masterStyleBlockVersion: block.version,
      masterStyleBlockText: block.text,
    },
  };
}

export async function createProject(input: NewProjectInput): Promise<ProjectRow> {
  const db = getDb();
  const config = resolveConfig(input.config);
  const [row] = await db
    .insert(projects)
    .values({
      brand: config.brand,
      audience: config.audience,
      volume: config.volume,
      title: config.title,
      subtitle: config.subtitle ?? null,
      authorName: config.authorName,
      config,
      status: 'DRAFT',
    })
    .returning();
  if (!row) throw new Error('Failed to insert project');
  return row;
}

export async function listProjects(): Promise<ProjectRow[]> {
  const db = getDb();
  return db.select().from(projects).orderBy(projects.createdAt);
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  const db = getDb();
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

/**
 * Permanently delete a project and everything under it. Pages carry a RESTRICT
 * foreign key to manifests, so pages must be removed before manifests; the
 * remaining children (images, usage, cost events, etc.) cascade from those.
 * Runs in one transaction so a failure leaves nothing half-deleted.
 */
export async function deleteProject(id: string): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.delete(pages).where(eq(pages.projectId, id)); // cascades images + image events
    await tx.delete(manifests).where(eq(manifests.projectId, id));
    const deleted = await tx.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
    return deleted.length > 0;
  });
}

export interface ManuscriptProvenance {
  /** Derived working manuscript (sanitized) — what every downstream stage reads. */
  manuscriptPath: string;
  manuscriptSha256: string;
  /** Canonical source artifact — the operator's exact uploaded bytes. */
  canonicalManuscriptPath: string;
  canonicalManuscriptSha256: string;
  /** False when sanitization was a no-op (working == source byte-for-byte). */
  manuscriptSanitized: boolean;
}

/**
 * Record BOTH manuscript artifacts and the relationship between them.
 *
 * The canonical source hash is the one an author freezes and quotes; the
 * working hash is the one production actually reads. Storing only the latter
 * (the old behaviour) made a frozen manuscript unverifiable against the
 * platform — the row's hash was the sanitized derivative's.
 */
export async function setManuscript(
  id: string,
  provenance: ManuscriptProvenance,
): Promise<ProjectRow | null> {
  const db = getDb();
  const [row] = await db
    .update(projects)
    .set({
      ...provenance,
      status: 'MANUSCRIPT_UPLOADED',
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();
  return row ?? null;
}

/**
 * Replace ONLY the derived working manuscript. Canonical provenance is not a
 * parameter, so this operation cannot alter it even by mistake.
 *
 * --- WHY THIS IS SEPARATE FROM setManuscript ------------------------------
 * `setManuscript` records BOTH artifacts and is correct for ingestion, where the
 * canonical source is genuinely being (re)established. Downstream stages are a
 * different job: a figure pipeline rewrites the working manuscript many times
 * while the canonical source must never move. Reusing the ingestion call for
 * that means passing canonical values back in on every hop, and the day someone
 * passes the derivative instead, the book quietly loses the ability to prove
 * what it came from. That has already happened once on this platform.
 *
 * So the narrow operation takes only what it may change. The columns it must not
 * touch are absent from the SET clause entirely — the guarantee is structural,
 * not a matter of the caller being careful.
 */
export async function replaceWorkingManuscript(
  id: string,
  working: { manuscriptPath: string; manuscriptSha256: string },
): Promise<ProjectRow | null> {
  const db = getDb();
  const [row] = await db
    .update(projects)
    .set({
      manuscriptPath: working.manuscriptPath,
      manuscriptSha256: working.manuscriptSha256,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();
  return row ?? null;
}

export async function setProjectStatus(id: string, status: ProjectStatus): Promise<ProjectRow | null> {
  const db = getDb();
  const [row] = await db
    .update(projects)
    .set({ status, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();
  return row ?? null;
}

export async function updateProjectConfig(id: string, rawConfig: ProjectConfig): Promise<ProjectRow | null> {
  const db = getDb();
  const config = resolveConfig(rawConfig);
  const [row] = await db
    .update(projects)
    .set({
      brand: config.brand,
      audience: config.audience,
      volume: config.volume,
      title: config.title,
      subtitle: config.subtitle ?? null,
      authorName: config.authorName,
      config,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();
  return row ?? null;
}
