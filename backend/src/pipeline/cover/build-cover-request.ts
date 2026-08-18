/**
 * BUILD COVER REQUEST — the whole no-spend half of cover generation, in one call.
 *
 * Resolve the spec, draw the blueprint, write the prompt, run the preflight.
 * Everything here is free and repeatable, which is the point: the operator gets
 * to see exactly what would be sent, and the gate gets to refuse it, before any
 * paid call exists.
 *
 * The paid call is deliberately NOT in this module. Generation takes the output
 * of this function; it never rebuilds it. If those two ever assembled the
 * request separately, the preflight would be approving something other than what
 * was sent, which is worse than having no preflight at all.
 */
import type { ProjectConfig } from '@wildlands/shared';
import { getEnv } from '../../env.js';
import { getProductionProfile } from '../production-profiles/registry.js';
import { resolveTrack } from '../book-assembly/interior-artifact.js';
import { buildCoverSpec, type CoverSpec } from './cover-spec.js';
import { buildCoverBlueprintSvg, renderCoverBlueprintPng } from './cover-blueprint.js';
import { buildCoverPrompt } from './cover-prompt.js';
import { runCoverPreflight, type CoverPreflightReport } from './cover-preflight.js';

export interface CoverRequest {
  spec: CoverSpec;
  prompt: string;
  blueprintSvg: string;
  blueprintPng: Buffer;
  preflight: CoverPreflightReport;
}

/**
 * The interior page count for the cover, for either track.
 *
 * Delegates to the same track-aware resolver the existing cover path uses, so
 * the new engine and the old one can never size a spine from different numbers.
 */
async function resolvePageCount(
  projectId: string,
  config: ProjectConfig,
): Promise<{ pageCount: number; source: 'typeset' | 'rendered-pages' }> {
  // renderCoverGeometry already wraps the track-aware resolver and is exported
  // for exactly this purpose: callers that need to DESCRIBE a cover rather than
  // render one. Reusing it means there is still only one page-count path.
  const { renderCoverGeometry } = await import('../stage-6-layout/render-chapter.js');
  const track = resolveTrack(getProductionProfile(config.productionProfileId)?.bodyRenderTrack);
  const { pageCount } = await renderCoverGeometry(projectId, config);
  return { pageCount, source: track === 'typeset' ? 'typeset' : 'rendered-pages' };
}

export async function buildCoverRequest(
  projectId: string,
  config: ProjectConfig,
  options: {
    editionStyleDnaId?: string;
    /** Who sets the author name. See CoverSpec.authorTypeSetBy. */
    authorTypeSetBy?: 'deterministic' | 'ai';
  } = {},
): Promise<CoverRequest> {
  const env = getEnv();
  const { pageCount, source } = await resolvePageCount(projectId, config);

  const spec = buildCoverSpec({
    projectId,
    config,
    pageCount,
    pageCountSource: source,
    model: env.OPENAI_IMAGE_MODEL,
    editionStyleDnaId: options.editionStyleDnaId,
    authorTypeSetBy: options.authorTypeSetBy,
  });

  const prompt = buildCoverPrompt(spec);
  const blueprintSvg = buildCoverBlueprintSvg(spec);
  const blueprintPng = await renderCoverBlueprintPng(spec);
  const preflight = runCoverPreflight({ spec, config, prompt });

  return { spec, prompt, blueprintSvg, blueprintPng, preflight };
}
