/**
 * Whole-page render (AI-first pipeline) — orchestrator.
 *
 * Loads a paginated page row + project config, builds the JSON spec, assembles
 * the prompt from the locked Wild Lands Publishing Standard, builds the same
 * layout blueprint production uses, calls OpenAI, and persists the result to
 * `whole_page_renders` + the `experimental/whole-page/` storage directory.
 *
 * Persisted flow (SPEC_PRODUCTIONIZE §3.1):
 *   createRenderRow (QUEUED) → executeRender (RENDERING → RENDERED | FAILED)
 *
 * Legacy Stage 2/3/6 are not touched.
 */

import { ProjectConfigSchema, type ProjectConfig } from '@wildlands/shared';
import { getProject } from '../../../db/repositories/projects.repo.js';
import {
  getEntryMetaByKeys,
  getPaginatedPageById,
} from '../../../db/repositories/pagination.repo.js';
import {
  createRenderRow,
  getRenderById,
  markFailed,
  markRendered,
  markRendering,
  type WholePageRenderRow,
} from '../../../db/repositories/whole-page-render.repo.js';
import { WILDLANDS_STANDARD, resolveGeometry } from '../../publishing-standard/index.js';
import { directLayout, type LayoutAllocation } from '../../stage-6-layout/layout-director.js';
import { computePageGeometry } from '../../stage-6-layout/page-geometry.js';
import { renderBlueprintPng } from '../../stage-3-generation/blueprint.js';
import {
  generateImageFromBlueprint,
  type GeneratedImage,
  type ImageSize,
} from '../../../services/openai/openai.js';
import { getProjectStorage } from '../../../services/storage/project-storage.js';
import { buildPageSpec } from './build-page-spec.js';
import { assembleExperimentPrompt } from './assemble-experiment-prompt.js';
import type { WholePageSpec } from './types.js';

/** Injectable generator — tests pass a stub so no OpenAI spend happens. */
export type BlueprintGenerator = (input: {
  prompt: string;
  blueprintPng: Buffer;
  size: ImageSize;
}) => Promise<GeneratedImage>;

export interface RenderWholePageOptions {
  /** Test seam — defaults to the real OpenAI blueprint-edit call. */
  generator?: BlueprintGenerator;
}

/** Pick image-edit size from the trim aspect; keep it simple. */
function pickSize(trimWidthIn: number, trimHeightIn: number): ImageSize {
  if (trimHeightIn > trimWidthIn) return '1024x1536';
  if (trimWidthIn > trimHeightIn) return '1536x1024';
  return '1024x1024';
}

interface PreparedRender {
  projectId: string;
  pageKey: string;
  spec: WholePageSpec;
  assembledPrompt: string;
  /** Blueprint inputs, computed here so executeRender never re-loads. */
  allocation: LayoutAllocation;
  size: ImageSize;
}

/**
 * Pure prep: load page + config, build spec + prompt + the blueprint inputs.
 * No image spend, no DB writes. The single load path for a page — both the
 * row-creation step and the execution step call this, so the page, project,
 * config, geometry, and allocation are each fetched/derived exactly once.
 */
export async function prepareRender(pageId: string): Promise<PreparedRender> {
  const pageRow = await getPaginatedPageById(pageId);
  if (!pageRow) throw new Error(`page_not_found:${pageId}`);
  const project = await getProject(pageRow.projectId);
  if (!project) throw new Error(`project_not_found:${pageRow.projectId}`);
  const config: ProjectConfig = ProjectConfigSchema.parse(project.config);

  const entryKey = pageRow.entryKey ?? pageRow.pageKey;
  const entryMeta = await getEntryMetaByKeys(pageRow.projectId, [entryKey]);
  const meta = entryMeta.get(entryKey);
  const entryTitle = meta?.entryTitle || pageRow.pageKey;
  // Standard v1.1: prefer the clean subject. Warnings live in badges, never here.
  const imageSubject = meta?.cleanSubject || meta?.imageSubject || entryTitle;
  const badgeContext = {
    hazard: meta?.hazard ?? [],
    region: meta?.region ?? 'GENERAL',
    source: meta?.sourceConfidence ?? 'GENERAL_REFERENCE',
  };

  // Resolved trim is the single source (SPEC_GEOMETRY_RECONCILIATION §1): the
  // page-spec geometry AND the blueprint pixel size both derive from it, so the
  // render can never disagree with print-prep on trim.
  const geometry = computePageGeometry(resolveGeometry(config).trimSize);
  const allocation = directLayout({
    bodyMarkdown: pageRow.readingFieldText ?? '',
    layoutTemplate: pageRow.layoutTemplate as Parameters<typeof directLayout>[0]['layoutTemplate'],
    geometry,
    bodyPt: config.typography.bodyPt,
    lineHeight: config.typography.lineHeight,
  });

  const spec = buildPageSpec({ pageRow, config, geometry, allocation, entryTitle, imageSubject, badgeContext });
  const assembledPrompt = assembleExperimentPrompt(spec);
  const size = pickSize(geometry.trimWidthIn, geometry.trimHeightIn);
  return {
    projectId: pageRow.projectId,
    pageKey: pageRow.pageKey,
    spec,
    assembledPrompt,
    allocation,
    size,
  };
}

export interface CreateAndRunResult {
  renderId: string;
  version: number;
  attempts: number;
  softCapExceeded: boolean;
  status: WholePageRenderRow['status'];
  row: WholePageRenderRow;
}

/**
 * Persisted one-shot: create a QUEUED row at the next version, then execute it
 * synchronously. Returns the final row (RENDERED or FAILED). A failed render is
 * a normal outcome — it does not throw; the caller inspects `status`.
 */
export async function createAndRunRender(
  pageId: string,
  opts: RenderWholePageOptions = {},
): Promise<CreateAndRunResult> {
  const prepared = await prepareRender(pageId);

  // Empty-body guard (Tier-0): refuse to spend an image on a content page with
  // no body text. This catches the silent-blank-page failure where a page was
  // never paginated (readingFieldText null). Throws BEFORE creating a render row
  // or calling the model. NOTE: when front matter is built, COVER/TITLE pages
  // legitimately have no body — exempt those page types here at that time.
  if (!(prepared.spec.pageText.body ?? '').trim()) {
    throw new Error(`empty_body_text:${pageId}`);
  }

  const created = await createRenderRow({
    pageId,
    projectId: prepared.projectId,
    specJson: prepared.spec,
    assembledPrompt: prepared.assembledPrompt,
    standardVersion: WILDLANDS_STANDARD.version,
  });
  const row = await executeRender(created.renderId, opts);
  return {
    renderId: created.renderId,
    version: created.version,
    attempts: created.attempts,
    softCapExceeded: created.softCapExceeded,
    status: row.status,
    row,
  };
}

/**
 * Execute a QUEUED/FAILED render row: build blueprint, generate, store
 * artifacts, mark RENDERED. On any generation error, mark FAILED and return the
 * row — does NOT throw for expected generation failures (DB/storage faults do).
 */
export async function executeRender(
  renderId: string,
  opts: RenderWholePageOptions = {},
): Promise<WholePageRenderRow> {
  const generator = opts.generator ?? generateImageFromBlueprint;
  const existing = await getRenderById(renderId);
  if (!existing) throw new Error(`render_not_found:${renderId}`);

  await markRendering(renderId);
  try {
    // Single load path — page, project, config, geometry, allocation, spec, and
    // prompt are all derived here exactly once (no second fetch).
    const prepared = await prepareRender(existing.pageId);

    // Same deterministic blueprint production uses for the layout zones.
    const [bw, bh] = prepared.size.split('x').map(Number);
    const { png: blueprintPng } = await renderBlueprintPng(prepared.allocation, bw ?? 1024, bh ?? 1536);

    const image = await generator({ prompt: prepared.assembledPrompt, blueprintPng, size: prepared.size });

    const storage = getProjectStorage();
    const base = `${prepared.pageKey}-${renderId}`;
    const imageStored = await storage.writeProjectFile(
      prepared.projectId,
      ['experimental', 'whole-page', `${base}.png`],
      image.pngBuffer,
    );
    const specStored = await storage.writeProjectFile(
      prepared.projectId,
      ['experimental', 'whole-page', `${base}.json`],
      JSON.stringify(prepared.spec, null, 2),
    );
    const promptStored = await storage.writeProjectFile(
      prepared.projectId,
      ['experimental', 'whole-page', `${base}.prompt.txt`],
      prepared.assembledPrompt,
    );
    // Blueprint auditability (SPEC_GEOMETRY_RECONCILIATION §4): persist the
    // layout blueprint so every render package is complete and reproducible —
    // spec JSON + prompt + blueprint + output image.
    const blueprintStored = await storage.writeProjectFile(
      prepared.projectId,
      ['experimental', 'whole-page', `${base}.blueprint.png`],
      blueprintPng,
    );

    await markRendered(renderId, {
      imagePath: imageStored.relativePath,
      specPath: specStored.relativePath,
      promptPath: promptStored.relativePath,
      blueprintPath: blueprintStored.relativePath,
      widthPx: image.widthPx,
      heightPx: image.heightPx,
      model: image.model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(renderId, message);
  }

  const final = await getRenderById(renderId);
  if (!final) throw new Error(`render_not_found_after_execute:${renderId}`);
  return final;
}
