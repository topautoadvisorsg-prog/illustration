/**
 * Image-version persistence — every Stage 3 generation gets a new immutable row.
 *
 * What it does: list image versions for a page, insert a new version, and flip
 * which version is "active". Generations are never overwritten (audit + rollback).
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import type { ImageStatus } from '@wildlands/shared';
import { getDb } from '../client.js';
import { images, pages } from '../schema/index.js';
import { manifests } from '../schema/index.js';

/** Total images generated for a project (every version counts as a generation). */
export async function countImagesForProject(projectId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(images)
    .innerJoin(pages, eq(images.pageId, pages.id))
    .where(eq(pages.projectId, projectId));
  return Number(row?.count ?? 0);
}

export type ImageRow = typeof images.$inferSelect;

export interface ProjectImageLibraryRow {
  image: ImageRow;
  page: {
    id: string;
    pageKey: string;
    chapterNumber: number;
    plannedPageNumber: number;
    layoutTemplate: string | null;
    status: string;
    imagePromptSha256: string | null;
  };
  manifestContent: unknown;
}

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

export async function listImagesForProject(projectId: string): Promise<ProjectImageLibraryRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      image: images,
      page: {
        id: pages.id,
        pageKey: pages.pageKey,
        chapterNumber: pages.chapterNumber,
        plannedPageNumber: pages.plannedPageNumber,
        layoutTemplate: pages.layoutTemplate,
        status: pages.status,
        imagePromptSha256: pages.imagePromptSha256,
      },
      manifestContent: manifests.content,
    })
    .from(images)
    .innerJoin(pages, eq(images.pageId, pages.id))
    .leftJoin(manifests, eq(pages.manifestId, manifests.id))
    .where(eq(pages.projectId, projectId))
    .orderBy(desc(images.createdAt));
  return rows;
}

export async function getImageById(imageId: string): Promise<ImageRow | undefined> {
  const db = getDb();
  const [row] = await db.select().from(images).where(eq(images.id, imageId)).limit(1);
  return row;
}

export async function getActiveImage(pageId: string): Promise<ImageRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(images)
    .where(and(eq(images.pageId, pageId), eq(images.active, true)))
    .limit(1);
  return row;
}

export interface UpscaleResultInput {
  upscaledPath: string;
  dpiW: number;
  dpiH: number;
  status: ImageStatus;
}

export async function setUpscaleResult(
  pageId: string,
  version: number,
  result: UpscaleResultInput,
): Promise<ImageRow | undefined> {
  const db = getDb();
  const [row] = await db
    .update(images)
    .set({
      upscaledPath: result.upscaledPath,
      dpiW: result.dpiW,
      dpiH: result.dpiH,
      status: result.status,
      updatedAt: new Date(),
    })
    .where(and(eq(images.pageId, pageId), eq(images.version, version)))
    .returning();
  return row;
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

export async function reuseImageForPage(targetPageId: string, sourceImageId: string): Promise<ImageRow | undefined> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(images).where(eq(images.id, sourceImageId)).limit(1);
    const [targetPage] = await tx.select().from(pages).where(eq(pages.id, targetPageId)).limit(1);
    if (!source || !targetPage) return undefined;
    const [sourcePage] = await tx.select().from(pages).where(eq(pages.id, source.pageId)).limit(1);
    if (!sourcePage || sourcePage.projectId !== targetPage.projectId) return undefined;

    const existing = await tx
      .select({ version: images.version })
      .from(images)
      .where(eq(images.pageId, targetPageId))
      .orderBy(images.version);
    const version = existing.reduce((max, img) => Math.max(max, img.version), 0) + 1;
    const active = existing.length === 0;
    if (active) {
      await tx.update(images).set({ active: false }).where(eq(images.pageId, targetPageId));
    }

    const [row] = await tx
      .insert(images)
      .values({
        pageId: targetPageId,
        version,
        prompt: source.prompt,
        promptSha256: source.promptSha256,
        generatedPath: source.generatedPath,
        upscaledPath: source.upscaledPath,
        dpiW: source.dpiW,
        dpiH: source.dpiH,
        widthPx: source.widthPx,
        heightPx: source.heightPx,
        status: 'REVIEW',
        active,
      })
      .returning();
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
