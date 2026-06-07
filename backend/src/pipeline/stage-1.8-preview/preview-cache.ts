/**
 * Stage 1.8 — preview PDF on-disk cache.
 *
 * Renders are expensive (Chromium boot + Paged.js + PDF capture). The Page
 * Production tab opens many times during operator review; we cache the PDF
 * keyed on the inputs that would actually change the output, so reopens are
 * instant.
 *
 * Cache key = sha256 of (pageId + readingFieldText + layoutTemplate + zone
 * geometry + typography + trimSize). Any change invalidates the cache for
 * that page.
 *
 * Storage: filesystem under `<STORAGE_ROOT>/previews/` to keep the cache out
 * of project file storage (Supabase) — previews are derived artifacts, not
 * durable work.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectConfig } from '@wildlands/shared';
import { getEnv } from '../../env.js';
import type { PaginatedPage } from '../stage-1.75-pagination/types.js';

export interface PreviewCacheKeyInput {
  page: PaginatedPage;
  config: ProjectConfig;
}

function previewCacheRoot(): string {
  return path.join(getEnv().STORAGE_ROOT, 'previews');
}

/** Compute the cache key for a (page, config) pair. Pure — no I/O. */
export function previewCacheKey(input: PreviewCacheKeyInput): string {
  const { page, config } = input;
  const sig = JSON.stringify({
    pageKey: page.pageKey,
    plannedPageNumber: page.plannedPageNumber,
    entryTitle: page.entryTitle,
    pageRole: page.pageRole,
    layoutTemplate: page.layoutTemplate,
    readingFieldText: page.readingFieldText,
    compactedEntryKeys: page.compactedEntryKeys,
    imageSubject: page.imageSubject,
    // Zone geometry can change without text changing (e.g. operator forces a
    // different layout). Include it in the key so the cache invalidates.
    textSafeZones: page.zones.textSafeZones,
    imagePriorityZones: page.zones.imagePriorityZones,
    typographyZones: page.zones.typographyZones,
    // Typography + trim drive every glyph position in the rendered PDF.
    typography: config.typography,
    trimSize: config.trimSize,
    // Full colorPalette — any color change (paper / ink / accent / warning /
    // anything else added later) repaints the preview, so all of them
    // invalidate the cache. Previously only `paper` was included, which left
    // stale entries when ink / accent moved.
    colorPalette: config.colorPalette,
  });
  return createHash('sha256').update(sig).digest('hex');
}

function pathForKey(key: string): string {
  return path.join(previewCacheRoot(), `${key}.pdf`);
}

/** Read a cached preview PDF if it exists. Returns null on cache miss. */
export async function readPreviewFromCache(key: string): Promise<Buffer | null> {
  const filePath = pathForKey(key);
  try {
    return await fs.readFile(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Write a freshly-rendered preview PDF into the cache. Idempotent. Atomic:
 * writes to a `${pid}.tmp` sibling file first, then renames into place. A
 * crash mid-write leaves the destination file unchanged (a tmp file may
 * remain — harmless; subsequent renders overwrite it).
 */
export async function writePreviewToCache(key: string, buffer: Buffer): Promise<void> {
  const root = previewCacheRoot();
  await fs.mkdir(root, { recursive: true });
  const finalPath = pathForKey(key);
  const tmpPath = `${finalPath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, finalPath);
}

/** Clear the entire preview cache. Used by tests + manual cache invalidation. */
export async function clearPreviewCache(): Promise<void> {
  const root = previewCacheRoot();
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
