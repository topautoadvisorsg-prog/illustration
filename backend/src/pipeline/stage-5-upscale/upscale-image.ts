/**
 * Stage 5 — upscale + DPI gate.
 *
 * What it does: takes a page's APPROVED illustration, upscales it (Real-ESRGAN),
 * verifies it meets the print DPI minimum against the project trim, stores the
 * print-ready PNG, and moves the page to UPSCALED. A failed DPI gate marks the
 * page FAILED_DPI instead of silently shipping a low-res image.
 *
 * Pure logic (computeDpiGate / assertUpscalable) is unit-tested; the upscaler is
 * dependency-injected so tests never call the paid API.
 */

import sharp from 'sharp';
import type { ProjectConfig } from '@wildlands/shared';
import { upscaleImage as defaultUpscale, type UpscaleInput, type UpscaleOutput } from '../../services/replicate/replicate.js';
import { getPageById, setPageStatus } from '../../db/repositories/manifests.repo.js';
import { getActiveImage, setImageStatus, setUpscaleResult } from '../../db/repositories/images.repo.js';
import { recordUsage } from '../../db/repositories/usage.repo.js';
import { getProject } from '../../db/repositories/projects.repo.js';
import { LocalStorageService } from '../../services/storage/local-storage.js';
import { getEnv } from '../../env.js';
import { logger } from '../../lib/logger.js';

export const MIN_PRINT_DPI = 300;

export type Upscaler = (input: UpscaleInput) => Promise<UpscaleOutput>;

export class UpscaleBlockedError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'UpscaleBlockedError';
  }
}

export interface DpiGateResult {
  dpiW: number;
  dpiH: number;
  minDpi: number;
  passed: boolean;
}

/** Effective print DPI = pixels / print inches. Pass only if both axes clear the floor. */
export function computeDpiGate(
  widthPx: number,
  heightPx: number,
  printWidthIn: number,
  printHeightIn: number,
  minDpi: number = MIN_PRINT_DPI,
): DpiGateResult {
  const dpiW = printWidthIn > 0 ? Math.floor(widthPx / printWidthIn) : 0;
  const dpiH = printHeightIn > 0 ? Math.floor(heightPx / printHeightIn) : 0;
  return { dpiW, dpiH, minDpi, passed: dpiW >= minDpi && dpiH >= minDpi };
}

/** Spend/state gate: only an APPROVED page with an APPROVED active image may upscale. */
export function assertUpscalable(pageStatus: string, activeImage: { status: string } | undefined): void {
  if (pageStatus !== 'APPROVED') {
    throw new UpscaleBlockedError(`Page status ${pageStatus} is not approved for upscale.`, 'not_approved');
  }
  if (!activeImage) {
    throw new UpscaleBlockedError('No active image to upscale; approve a version first.', 'no_active_image');
  }
  if (activeImage.status !== 'APPROVED') {
    throw new UpscaleBlockedError('The active image is not approved.', 'image_not_approved');
  }
}

export interface UpscalePageOptions {
  pageId: string;
  upscaler?: Upscaler;
  storage?: LocalStorageService;
}

export interface UpscalePageResult {
  pageId: string;
  version: number;
  passed: boolean;
  dpiW: number;
  dpiH: number;
  minDpi: number;
  widthPx: number;
  heightPx: number;
  upscaledPath: string | null;
  pageStatus: 'PRINT_READY' | 'FAILED_DPI';
}

export async function upscalePageImage(opts: UpscalePageOptions): Promise<UpscalePageResult> {
  const page = await getPageById(opts.pageId);
  if (!page) throw new UpscaleBlockedError('Page not found.', 'not_found');

  const active = await getActiveImage(page.id);
  assertUpscalable(page.status, active);
  if (!active!.generatedPath) {
    throw new UpscaleBlockedError('Active image has no generated file on record.', 'no_file');
  }

  const project = await getProject(page.projectId);
  if (!project) throw new UpscaleBlockedError('Project not found.', 'project_not_found');
  const config = project.config as ProjectConfig;

  const storage = opts.storage ?? new LocalStorageService();
  const upscaler = opts.upscaler ?? defaultUpscale;

  logger.info({ pageId: page.id, pageKey: page.pageKey, version: active!.version }, 'Stage 5: upscaling image');

  const source = await storage.readProjectFile(active!.generatedPath);
  const upscaled = await upscaler({ pngBuffer: source, scale: 4 });
  const meta = await sharp(upscaled.pngBuffer).metadata();
  const widthPx = meta.width ?? 0;
  const heightPx = meta.height ?? 0;

  const gate = computeDpiGate(widthPx, heightPx, config.trimSize.widthIn, config.trimSize.heightIn);

  await recordUsage({
    projectId: page.projectId,
    pageId: page.id,
    provider: 'replicate',
    model: getEnv().REPLICATE_UPSCALE_MODEL,
    operation: 'stage-5-upscale',
    imageCount: 1,
  });

  if (!gate.passed) {
    await setImageStatus(page.id, active!.version, 'FAILED');
    await setPageStatus(page.id, 'FAILED_DPI');
    logger.warn({ pageId: page.id, ...gate, widthPx, heightPx }, 'Stage 5: DPI gate failed');
    return {
      pageId: page.id,
      version: active!.version,
      ...gate,
      widthPx,
      heightPx,
      upscaledPath: null,
      pageStatus: 'FAILED_DPI',
    };
  }

  const stored = await storage.writeProjectFile(
    page.projectId,
    ['upscaled', `${page.pageKey}_v${active!.version}_300dpi.png`],
    upscaled.pngBuffer,
  );
  await setUpscaleResult(page.id, active!.version, {
    upscaledPath: stored.relativePath,
    dpiW: gate.dpiW,
    dpiH: gate.dpiH,
    status: 'PRINT_READY',
  });
  await setPageStatus(page.id, 'PRINT_READY');

  return {
    pageId: page.id,
    version: active!.version,
    ...gate,
    widthPx,
    heightPx,
    upscaledPath: stored.relativePath,
    pageStatus: 'PRINT_READY',
  };
}
