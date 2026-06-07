/**
 * Stage 3 â€” image generation (gpt-image-2).
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
import { LayoutTemplateIdSchema, ProjectConfigSchema } from '@wildlands/shared';
import { getEnv } from '../../env.js';
import {
  generateImage as defaultGenerateImage,
  generateImageFromBlueprint,
  type GenerateImageInput,
  type GeneratedImage,
} from '../../services/openai/openai.js';
import { computePageGeometry } from '../stage-6-layout/page-geometry.js';
import { directLayout } from '../stage-6-layout/layout-director.js';
import { renderBlueprintPng } from './blueprint.js';
import { getPageById, setPageStatus } from '../../db/repositories/manifests.repo.js';
import { getProject } from '../../db/repositories/projects.repo.js';
import { insertImage, listImagesForPage } from '../../db/repositories/images.repo.js';
import { recordUsage } from '../../db/repositories/usage.repo.js';
import { recordImageEvent } from '../../db/repositories/image-events.repo.js';
import { getProjectStorage, type ProjectStorage } from '../../services/storage/project-storage.js';
import { logger } from '../../lib/logger.js';
import { appendImageShapeInstruction, imageShapeForLayout } from './image-shape.js';

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

export interface LayoutApprovalGatePage {
  chapterNumber: number;
  pageKey: string;
  imagePromptSha256: string | null;
}

/**
 * Pagination v1 — per-page Reading-Field preview gate.
 *
 * When PAGINATION_V1_ENABLED is false, this is a no-op and the existing
 * Stage 2 + chapter-layout gates remain the only spend guards. When true,
 * image generation is blocked unless the operator has approved the
 * Text-In-Reading-Field preview for THIS page (and continuation pages
 * never get their own image regardless).
 */
export interface PreviewApprovalGatePage {
  pageKey: string;
  previewApproved?: boolean | null;
  carriesSubject?: boolean | null;
}
export function assertPreviewApprovedForImageSpend(
  page: PreviewApprovalGatePage,
  enabled: boolean,
): void {
  if (!enabled) return;
  if (page.carriesSubject === false) {
    throw new GenerationBlockedError(
      `Page ${page.pageKey} is a continuation page and does not carry its own image subject.`,
      'continuation_no_image',
    );
  }
  if (page.previewApproved !== true) {
    throw new GenerationBlockedError(
      `Page ${page.pageKey} does not have an approved Reading-Field preview. ` +
        `Approve the preview in Page Production before spending image credits.`,
      'preview_not_approved',
    );
  }
}

export function assertLayoutApprovedForImageSpend(
  page: LayoutApprovalGatePage,
  approvals: Record<string, { status: string; pageKeys: string[]; promptSha256ByPage: Record<string, string> }>,
): void {
  const approval = approvals[String(page.chapterNumber)];
  if (!approval || approval.status !== 'APPROVED') {
    throw new GenerationBlockedError(
      `Chapter ${page.chapterNumber} layout is not approved yet. Approve the chapter layout before image generation.`,
      'layout_not_approved',
    );
  }
  if (!approval.pageKeys.includes(page.pageKey)) {
    throw new GenerationBlockedError(`Page ${page.pageKey} is not covered by the approved chapter layout.`, 'layout_not_approved');
  }
  if (!page.imagePromptSha256 || approval.promptSha256ByPage[page.pageKey] !== page.imagePromptSha256) {
    throw new GenerationBlockedError(
      `Page ${page.pageKey} prompt changed after layout approval. Re-approve the chapter layout before image generation.`,
      'layout_prompt_changed',
    );
  }
}

/** Next version number given the existing image versions. */
export function nextImageVersion(existing: Array<{ version: number }>): number {
  return existing.reduce((max, img) => Math.max(max, img.version), 0) + 1;
}

/** Build the exact prompt + hash for a version (shape rules + regeneration addendum are appended). */
export function finalizePrompt(basePrompt: string, addendum?: string, layoutInstruction?: string): { prompt: string; sha256: string } {
  const shapedPrompt = layoutInstruction ? `${basePrompt.trim()}\n\n${layoutInstruction.trim()}` : basePrompt;
  const trimmed = addendum?.trim();
  const prompt = trimmed ? `${shapedPrompt}\n\n${trimmed}` : shapedPrompt;
  return { prompt, sha256: createHash('sha256').update(prompt, 'utf8').digest('hex') };
}

export interface GeneratePageImageOptions {
  pageId: string;
  /** Injectable for tests; defaults to the real OpenAI call. */
  generator?: ImageGenerator;
  storage?: ProjectStorage;
  /** Optional operator tweak appended to the locked prompt on regeneration. */
  promptAddendum?: string;
  /**
   * Reference-image mode: build a layout blueprint from the page's zones and hand it
   * to the image agent as a composition map, so the illustration is composed into the
   * correct regions (text-safe zone left calm) at generation time.
   */
  useBlueprint?: boolean;
}

export interface GeneratePageImageResult {
  pageId: string;
  imageId: string;
  version: number;
  generatedPath: string;
  /** Path to the layout blueprint used (only when useBlueprint was set). */
  blueprintPath?: string;
  widthPx: number;
  heightPx: number;
  model: string;
  status: 'REVIEW';
}

export async function generatePageImage(opts: GeneratePageImageOptions): Promise<GeneratePageImageResult> {
  const page = await getPageById(opts.pageId);
  if (!page) throw new GenerationBlockedError('Page not found.', 'not_found');

  assertGeneratable(page);
  assertPreviewApprovedForImageSpend(
    {
      pageKey: page.pageKey,
      previewApproved: (page as { previewApproved?: boolean | null }).previewApproved,
      carriesSubject: (page as { carriesSubject?: boolean | null }).carriesSubject,
    },
    getEnv().PAGINATION_V1_ENABLED,
  );
  const project = await getProject(page.projectId);
  if (!project) throw new GenerationBlockedError('Project not found.', 'not_found');
  const config = ProjectConfigSchema.parse(project.config);
  assertLayoutApprovedForImageSpend(page, config.layoutApprovals ?? {});

  const existing = await listImagesForPage(page.id);
  const version = nextImageVersion(existing);
  const generator = opts.generator ?? defaultGenerateImage;
  const storage = opts.storage ?? getProjectStorage();

  // Each version stores its own exact prompt + hash (a regeneration tweak makes
  // this differ from the page's planned prompt) so generations stay auditable.
  const layoutTemplate = LayoutTemplateIdSchema.catch('LAYOUT_1_STANDARD').parse(page.layoutTemplate);
  const imageShape = imageShapeForLayout(layoutTemplate);
  const layoutAwarePrompt = appendImageShapeInstruction(page.imagePrompt!, imageShape);
  const { prompt: finalPrompt, sha256: promptSha256 } = finalizePrompt(layoutAwarePrompt, opts.promptAddendum);

  // Blueprint is the source of truth — default ON in production. The lean prompt
  // references "the attached blueprint image", so generation attaches it. When a
  // custom image generator is injected (tests), default OFF so the injected generator
  // is used directly; an explicit useBlueprint always wins.
  const useBlueprint = opts.useBlueprint ?? !opts.generator;
  logger.info({ pageId: page.id, pageKey: page.pageKey, version, imageSize: imageShape.size, imageShape: imageShape.shape, useBlueprint }, 'Stage 3: generating image');

  let image: GeneratedImage;
  let blueprintPath: string | undefined;
  if (useBlueprint) {
    // Build the layout blueprint from the page's deterministic zones and pass it to
    // the image agent as a composition map. Zone geometry depends only on the layout
    // (slot + coverage), so an empty body is fine here.
    const geometry = computePageGeometry(config.trimSize);
    const allocation = directLayout({
      bodyMarkdown: '',
      layoutTemplate,
      geometry,
      bodyPt: config.typography.bodyPt,
      lineHeight: config.typography.lineHeight,
    });
    const [bw, bh] = imageShape.size === 'auto' ? [1024, 1536] : imageShape.size.split('x').map(Number);
    const { png: blueprintPng } = await renderBlueprintPng(allocation, bw ?? 1024, bh ?? 1536);
    const bpStored = await storage.writeProjectFile(
      page.projectId,
      ['blueprints', `${page.pageKey}.png`],
      blueprintPng,
    );
    blueprintPath = bpStored.relativePath;
    // The lean prompt already carries the COMPOSITION + LAYOUT RULES sections, so we
    // send it as-is (no duplicate legend append).
    image = await generateImageFromBlueprint({ prompt: finalPrompt, blueprintPng, size: imageShape.size });
  } else {
    image = await generator({ prompt: finalPrompt, size: imageShape.size });
  }

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
    status: 'REVIEW',
    // The newest generation becomes the active version, so the preview and render
    // always show the latest image (insertImage clears the previous active one).
    active: true,
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
    blueprintPath,
    widthPx: image.widthPx,
    heightPx: image.heightPx,
    model: image.model,
    status: 'REVIEW',
  };
}
