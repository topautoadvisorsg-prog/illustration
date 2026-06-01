/**
 * Stage 3 — image generation (gpt-image-1).
 *
 * What it does: for a single planned page, calls OpenAI with the locked image-only
 * prompt, stores the PNG as a new immutable version, records the row + cost, and
 * moves the page to REVIEW (the human gate).
 *
 * Spend guard: this is the first stage that costs money. `assertGeneratable` blocks
 * generation unless the page is in a generatable state with a clean, fully-resolved
 * prompt. The image function is injectable so tests never hit the paid API.
 */

import { createHash } from 'node:crypto';
import {
  generateImage as defaultGenerateImage,
  type GenerateImageInput,
  type GeneratedImage,
} from '../../services/openai/openai.js';
import { getPageById, setPageStatus } from '../../db/repositories/manifests.repo.js';
import { insertImage, listImagesForPage } from '../../db/repositories/images.repo.js';
import { recordUsage } from '../../db/repositories/usage.repo.js';
import { recordImageEvent } from '../../db/repositories/image-events.repo.js';
import { LocalStorageService } from '../../services/storage/local-storage.js';
import { logger } from '../../lib/logger.js';

export type ImageGenerator = (input: GenerateImageInput) => Promise<GeneratedImage>;

/** Page statuses from which a (re)generation is allowed. */
const GENERATABLE_STATUSES = new Set(['PLANNED', 'GENERATING', 'REVIEW', 'FAILED']);

export class GenerationBlockedError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'GenerationBlockedError';
  }
}

export interface GeneratablePage {
  status: string;
  imagePrompt: string | null;
  imagePromptSha256: string | null;
}

/** Pure spend-gate: throws GenerationBlockedError if the page must not be generated. */
export function assertGeneratable(page: GeneratablePage): void {
  if (!page.imagePrompt || !page.imagePromptSha256) {
    throw new GenerationBlockedError('Page has no locked image prompt; run Stage 2 planning first.', 'no_prompt');
  }
  if (/\{[A-Z0-9_]+\}/.test(page.imagePrompt)) {
    throw new GenerationBlockedError('Image prompt still contains unresolved placeholders.', 'unresolved_placeholder');
  }
  if (!GENERATABLE_STATUSES.has(page.status)) {
    throw new GenerationBlockedError(`Page status ${page.status} is not generatable.`, 'bad_status');
  }
}

/** Next version number given the existing image versions. */
export function nextImageVersion(existing: Array<{ version: number }>): number {
  return existing.reduce((max, img) => Math.max(max, img.version), 0) + 1;
}

/** Build the exact prompt + hash for a version (a regeneration addendum is appended). */
export function finalizePrompt(basePrompt: string, addendum?: string): { prompt: string; sha256: string } {
  const trimmed = addendum?.trim();
  const prompt = trimmed ? `${basePrompt}\n\n${trimmed}` : basePrompt;
  return { prompt, sha256: createHash('sha256').update(prompt, 'utf8').digest('hex') };
}

export interface GeneratePageImageOptions {
  pageId: string;
  /** Injectable for tests; defaults to the real OpenAI call. */
  generator?: ImageGenerator;
  storage?: LocalStorageService;
  /** Optional operator tweak appended to the locked prompt on regeneration. */
  promptAddendum?: string;
}

export interface GeneratePageImageResult {
  pageId: string;
  imageId: string;
  version: number;
  generatedPath: string;
  widthPx: number;
  heightPx: number;
  model: string;
  status: 'REVIEW';
}

export async function generatePageImage(opts: GeneratePageImageOptions): Promise<GeneratePageImageResult> {
  const page = await getPageById(opts.pageId);
  if (!page) throw new GenerationBlockedError('Page not found.', 'not_found');

  assertGeneratable(page);

  const existing = await listImagesForPage(page.id);
  const version = nextImageVersion(existing);
  const generator = opts.generator ?? defaultGenerateImage;
  const storage = opts.storage ?? new LocalStorageService();

  // Each version stores its own exact prompt + hash (a regeneration tweak makes
  // this differ from the page's planned prompt) so generations stay auditable.
  const { prompt: finalPrompt, sha256: promptSha256 } = finalizePrompt(page.imagePrompt!, opts.promptAddendum);

  logger.info({ pageId: page.id, pageKey: page.pageKey, version }, 'Stage 3: generating image');

  const image = await generator({ prompt: finalPrompt });

  const stored = await storage.writeProjectFile(
    page.projectId,
    ['generated', `${page.pageKey}_v${version}.png`],
    image.pngBuffer,
  );

  const imageRow = await insertImage({
    pageId: page.id,
    version,
    prompt: finalPrompt,
    promptSha256,
    generatedPath: stored.relativePath,
    widthPx: image.widthPx,
    heightPx: image.heightPx,
    status: 'GENERATED',
    active: existing.length === 0,
  });

  await setPageStatus(page.id, 'REVIEW');
  await recordUsage({
    projectId: page.projectId,
    pageId: page.id,
    provider: 'openai',
    model: image.model,
    operation: 'stage-3-image',
    imageCount: 1,
  });
  await recordImageEvent({
    imageId: imageRow.id,
    pageId: page.id,
    eventType: 'generated',
    note: opts.promptAddendum?.trim() ?? null,
    metadata: { version },
  });

  return {
    pageId: page.id,
    imageId: imageRow.id,
    version,
    generatedPath: stored.relativePath,
    widthPx: image.widthPx,
    heightPx: image.heightPx,
    model: image.model,
    status: 'REVIEW',
  };
}
