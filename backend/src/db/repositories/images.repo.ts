/**
 * Image-version persistence — every Stage 3 generation gets a new immutable row.
 *
 * What it does: list image versions for a page, insert a new version, and flip
 * which version is "active". Generations are never overwritten (audit + rollback).
 */

import { and, eq } from 'drizzle-orm';
import type { ImageStatus } from '@wildlands/shared';
import { getDb } from '../client.js';
import { images } from '../schema/index.js';

export type ImageRow = typeof images.$inferSelect;

export interface NewImageInput {
  pageId: string;
  version: number;
  prompt: string;
  promptSha256: string;
  generatedPath: string;
  widthPx: number;
  heightPx: number;
  status: ImageStatus;
  active: boolean;
}

export async function listImagesForPage(pageId: string): Promise<ImageRow[]> {
  const db = getDb();
  return db.select().from(images).where(eq(images.pageId, pageId)).orderBy(images.version);
}

export async function getImageVersion(pageId: string, version: number): Promise<ImageRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(images)
    .where(and(eq(images.pageId, pageId), eq(images.version, version)))
    .limit(1);
  return row;
}

export async function setImageStatus(pageId: string, version: number, status: ImageStatus): Promise<ImageRow | undefined> {
  const db = getDb();
  const [row] = await db
    .update(images)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(images.pageId, pageId), eq(images.version, version)))
    .returning();
  return row;
}

/** Approve a version: it becomes the sole active version with APPROVED status. */
export async function approveImageVersion(pageId: string, version: number): Promise<ImageRow | undefined> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.update(images).set({ active: false }).where(eq(images.pageId, pageId));
    const [row] = await tx
      .update(images)
      .set({ active: true, status: 'APPROVED', updatedAt: new Date() })
      .where(and(eq(images.pageId, pageId), eq(images.version, version)))
      .returning();
    return row;
  });
}

export async function insertImage(input: NewImageInput): Promise<ImageRow> {
  const db = getDb();
  return db.transaction(async (tx) => {
    if (input.active) {
      // Only one active version per page.
      await tx.update(images).set({ active: false }).where(eq(images.pageId, input.pageId));
    }
    const [row] = await tx
      .insert(images)
      .values({
        pageId: input.pageId,
        version: input.version,
        prompt: input.prompt,
        promptSha256: input.promptSha256,
        generatedPath: input.generatedPath,
        widthPx: input.widthPx,
        heightPx: input.heightPx,
        status: input.status,
        active: input.active,
      })
      .returning();
    if (!row) throw new Error('Failed to insert image row');
    return row;
  });
}

/** Make a specific version the active one for a page (Stage 4 use). */
export async function setActiveImageVersion(pageId: string, version: number): Promise<ImageRow | undefined> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.update(images).set({ active: false }).where(eq(images.pageId, pageId));
    const [row] = await tx
      .update(images)
      .set({ active: true })
      .where(and(eq(images.pageId, pageId), eq(images.version, version)))
      .returning();
    return row;
  });
}
