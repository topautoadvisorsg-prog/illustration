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
import { projects } from '../schema/index.js';
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

export async function setManuscript(
  id: string,
  manuscriptPath: string,
  manuscriptSha256: string,
): Promise<ProjectRow | null> {
  const db = getDb();
  const [row] = await db
    .update(projects)
    .set({
      manuscriptPath,
      manuscriptSha256,
      status: 'MANUSCRIPT_UPLOADED',
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
