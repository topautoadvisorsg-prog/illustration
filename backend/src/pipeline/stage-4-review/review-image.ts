/**
 * Stage 4 — image preview & review (the human gate).
 *
 * What it does: lists a page's generated image versions and lets the operator
 * approve, reject, set-active, or regenerate. Approval locks the active version
 * and moves the page to APPROVED (ready for Stage 5 upscale). Every action is
 * written to the image_events audit log.
 *
 * Pure validators (assertApprovable / findVersion) are unit-tested; the rest is
 * thin DB orchestration.
 */

import {
  approveImageVersion,
  getImageById,
  getImageVersion,
  listImagesForPage,
  reuseImageForPage,
  setActiveImageVersion,
  setImageStatus,
  type ImageRow,
} from '../../db/repositories/images.repo.js';
import { getPageById, listPages, setPageStatus, type PageRow } from '../../db/repositories/manifests.repo.js';
import { recordImageEvent } from '../../db/repositories/image-events.repo.js';
import {
  generatePageImage,
  type GeneratePageImageResult,
  type ImageGenerator,
} from '../stage-3-generation/generate-image.js';

export class ReviewBlockedError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ReviewBlockedError';
  }
}

/** Find a specific version among a page's images, or throw 404-style. */
export function findVersion(imagesForPage: ImageRow[], version: number): ImageRow {
  const found = imagesForPage.find((img) => img.version === version);
  if (!found) throw new ReviewBlockedError(`Image version ${version} not found for this page.`, 'version_not_found');
  return found;
}

/** A version is approvable only if it has not been rejected and was actually generated. */
export function assertApprovable(image: Pick<ImageRow, 'status'>): void {
  if (image.status === 'REJECTED') {
    throw new ReviewBlockedError('Cannot approve a rejected image; regenerate instead.', 'rejected');
  }
}

async function loadPageOrThrow(pageId: string): Promise<PageRow> {
  const page = await getPageById(pageId);
  if (!page) throw new ReviewBlockedError('Page not found.', 'page_not_found');
  return page;
}

export interface ImageVersionView {
  version: number;
  status: string;
  active: boolean;
  generatedPath: string | null;
  upscaledPath: string | null;
  widthPx: number | null;
  heightPx: number | null;
}

export async function listPageImages(pageId: string): Promise<{ pageStatus: string; images: ImageVersionView[] }> {
  const page = await loadPageOrThrow(pageId);
  const rows = await listImagesForPage(page.id);
  return {
    pageStatus: page.status,
    images: rows.map((r) => ({
      version: r.version,
      status: r.status,
      active: r.active,
      generatedPath: r.generatedPath,
      upscaledPath: r.upscaledPath,
      widthPx: r.widthPx,
      heightPx: r.heightPx,
    })),
  };
}

export async function approvePageImage(pageId: string, version: number): Promise<{ pageStatus: string; version: number }> {
  const page = await loadPageOrThrow(pageId);
  const image = findVersion(await listImagesForPage(page.id), version);
  assertApprovable(image);

  await approveImageVersion(page.id, version);
  await setPageStatus(page.id, 'APPROVED');
  await recordImageEvent({ imageId: image.id, pageId: page.id, eventType: 'approved', metadata: { version } });

  return { pageStatus: 'APPROVED', version };
}

export async function rejectPageImage(
  pageId: string,
  version: number,
  note?: string,
): Promise<{ pageStatus: string; version: number }> {
  const page = await loadPageOrThrow(pageId);
  const image = findVersion(await listImagesForPage(page.id), version);

  await setImageStatus(page.id, version, 'REJECTED');
  await recordImageEvent({ imageId: image.id, pageId: page.id, eventType: 'rejected', note: note ?? null, metadata: { version } });

  return { pageStatus: page.status, version };
}

export async function setActivePageImage(pageId: string, version: number): Promise<{ version: number }> {
  const page = await loadPageOrThrow(pageId);
  const image = findVersion(await listImagesForPage(page.id), version);

  await setActiveImageVersion(page.id, version);
  await recordImageEvent({ imageId: image.id, pageId: page.id, eventType: 'set_active', metadata: { version } });

  return { version };
}

export async function regeneratePageImage(
  pageId: string,
  promptAddendum?: string,
  generator?: ImageGenerator,
): Promise<GeneratePageImageResult> {
  // Stage 3 records the 'generated' audit event (with the addendum note) using
  // the real image row id, so no extra event is written here.
  return generatePageImage({ pageId, promptAddendum, generator });
}

export async function reuseLibraryImageForPage(
  pageId: string,
  sourceImageId: string,
): Promise<{ pageStatus: string; version: number; imageId: string }> {
  const page = await loadPageOrThrow(pageId);
  const row = await reuseImageForPage(page.id, sourceImageId);
  if (!row) throw new ReviewBlockedError('Source image or target page not found.', 'version_not_found');

  await setPageStatus(page.id, 'REVIEW');
  await recordImageEvent({
    imageId: row.id,
    pageId: page.id,
    eventType: 'reused',
    note: `Reused source image ${sourceImageId}`,
    metadata: { sourceImageId, version: row.version },
  });

  return { pageStatus: 'REVIEW', version: row.version, imageId: row.id };
}

export interface ApplySharedImageResult {
  layoutTemplate: string;
  sourceImageId: string;
  /** Pages that received the shared image (the source page is left untouched). */
  applied: number;
  appliedPageKeys: string[];
  /** Total pages in the project using this layout (incl. the source page). */
  totalLayoutPages: number;
}

/**
 * Repeating-asset reuse: take one generated image and apply it to EVERY page in
 * the project that uses the same layout. For a recurring border/full-text page,
 * this means "generate once, reuse everywhere" instead of regenerating a
 * near-identical border per page. The source image's own page is skipped.
 */
export async function applySharedImageToLayout(
  projectId: string,
  layoutTemplate: string,
  sourceImageId: string,
): Promise<ApplySharedImageResult> {
  const source = await getImageById(sourceImageId);
  if (!source) throw new ReviewBlockedError('Source image not found.', 'version_not_found');

  const layoutPages = (await listPages(projectId)).filter((p) => p.layoutTemplate === layoutTemplate);
  if (layoutPages.length === 0) {
    throw new ReviewBlockedError(`No pages use layout ${layoutTemplate}.`, 'page_not_found');
  }

  const appliedPageKeys: string[] = [];
  for (const page of layoutPages) {
    if (page.id === source.pageId) continue; // leave the source page as-is
    const row = await reuseImageForPage(page.id, sourceImageId);
    if (!row) continue;
    await setPageStatus(page.id, 'REVIEW');
    await recordImageEvent({
      imageId: row.id,
      pageId: page.id,
      eventType: 'reused',
      note: `Shared repeating-layout image applied to all ${layoutTemplate} pages`,
      metadata: { sourceImageId, version: row.version, sharedLayout: layoutTemplate },
    });
    appliedPageKeys.push(page.pageKey);
  }

  return {
    layoutTemplate,
    sourceImageId,
    applied: appliedPageKeys.length,
    appliedPageKeys,
    totalLayoutPages: layoutPages.length,
  };
}
