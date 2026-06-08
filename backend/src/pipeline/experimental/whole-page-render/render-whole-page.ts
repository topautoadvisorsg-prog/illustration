/**
 * Whole-page render experiment — orchestrator.
 *
 * Loads a paginated page row + project config, builds the JSON spec, assembles
 * the prompt, builds the same layout blueprint production uses, calls OpenAI
 * via the existing image-edit endpoint, and writes the result + the spec +
 * the assembled prompt to a separate `experimental/whole-page/` directory.
 *
 * Production renderer and Stage 3 are not touched.
 */

import { randomUUID } from 'node:crypto';
import { ProjectConfigSchema, type ProjectConfig } from '@wildlands/shared';
import { getProject } from '../../../db/repositories/projects.repo.js';
import {
  getEntryMetaByKeys,
  getPaginatedPageById,
} from '../../../db/repositories/pagination.repo.js';
import { directLayout } from '../../stage-6-layout/layout-director.js';
import { computePageGeometry } from '../../stage-6-layout/page-geometry.js';
import { renderBlueprintPng } from '../../stage-3-generation/blueprint.js';
import { generateImageFromBlueprint, type ImageSize } from '../../../services/openai/openai.js';
import { getProjectStorage } from '../../../services/storage/project-storage.js';
import { buildPageSpec } from './build-page-spec.js';
import { assembleExperimentPrompt } from './assemble-experiment-prompt.js';
import type { WholePageRenderResult } from './types.js';

export interface RenderWholePageInput {
  pageId: string;
  decidedBy: string;
}

/** Pick image-edit size from the trim aspect; keep it simple. */
function pickSize(trimWidthIn: number, trimHeightIn: number): ImageSize {
  if (trimHeightIn > trimWidthIn) return '1024x1536';
  if (trimWidthIn > trimHeightIn) return '1536x1024';
  return '1024x1024';
}

export async function renderWholePage(input: RenderWholePageInput): Promise<WholePageRenderResult> {
  const pageRow = await getPaginatedPageById(input.pageId);
  if (!pageRow) {
    throw new Error(`page_not_found:${input.pageId}`);
  }
  const project = await getProject(pageRow.projectId);
  if (!project) {
    throw new Error(`project_not_found:${pageRow.projectId}`);
  }
  const config: ProjectConfig = ProjectConfigSchema.parse(project.config);

  const entryKey = pageRow.entryKey ?? pageRow.pageKey;
  const entryMeta = await getEntryMetaByKeys(pageRow.projectId, [entryKey]);
  const meta = entryMeta.get(entryKey);
  const entryTitle = meta?.entryTitle || pageRow.pageKey;
  const imageSubject = meta?.imageSubject || entryTitle;

  const geometry = computePageGeometry(config.trimSize);
  const allocation = directLayout({
    bodyMarkdown: pageRow.readingFieldText ?? '',
    layoutTemplate: pageRow.layoutTemplate as Parameters<typeof directLayout>[0]['layoutTemplate'],
    geometry,
    bodyPt: config.typography.bodyPt,
    lineHeight: config.typography.lineHeight,
  });

  const spec = buildPageSpec({
    pageRow,
    config,
    geometry,
    allocation,
    entryTitle,
    imageSubject,
  });
  const assembledPrompt = assembleExperimentPrompt(spec);

  // Same blueprint production uses — gives the model the layout zones to anchor on.
  const size = pickSize(geometry.trimWidthIn, geometry.trimHeightIn);
  const [bw, bh] = size.split('x').map(Number);
  const { png: blueprintPng } = await renderBlueprintPng(allocation, bw ?? 1024, bh ?? 1536);

  const image = await generateImageFromBlueprint({
    prompt: assembledPrompt,
    blueprintPng,
    size,
  });

  const runId = randomUUID();
  const storage = getProjectStorage();
  const imageStored = await storage.writeProjectFile(
    pageRow.projectId,
    ['experimental', 'whole-page', `${pageRow.pageKey}-${runId}.png`],
    image.pngBuffer,
  );
  const specStored = await storage.writeProjectFile(
    pageRow.projectId,
    ['experimental', 'whole-page', `${pageRow.pageKey}-${runId}.json`],
    JSON.stringify(spec, null, 2),
  );
  const promptStored = await storage.writeProjectFile(
    pageRow.projectId,
    ['experimental', 'whole-page', `${pageRow.pageKey}-${runId}.prompt.txt`],
    assembledPrompt,
  );

  return {
    runId,
    pageId: input.pageId,
    pageKey: pageRow.pageKey,
    spec,
    assembledPrompt,
    imageRelativePath: imageStored.relativePath,
    specRelativePath: specStored.relativePath,
    promptRelativePath: promptStored.relativePath,
    widthPx: image.widthPx,
    heightPx: image.heightPx,
    model: image.model,
  };
}
