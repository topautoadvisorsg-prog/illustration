/**
 * COVER SPEC — the one object a cover is generated from.
 *
 * Everything the model, the blueprint, the preflight and the validator need,
 * resolved once from the project, so those four can never disagree about what
 * book they are making.
 *
 * ─── THE THREE THINGS THAT MUST NOT BE ONE THING ──────────────────────────────
 *
 *   COPY            the exact words that get PRINTED on the cover.
 *   ART DIRECTION   what the cover should LOOK like. Never printed.
 *   LAYOUT          WHERE things go. Derived from geometry, never authored.
 *
 * These were previously blended. `publishing.coverDescription` is the clearest
 * casualty: it is a printed front-cover line (it reaches `coverCopy`, the title
 * hierarchy, and the text-fidelity reviewer's source text), and the old builder
 * ALSO interpolated it into the illustration subject's `environment` and
 * `primary`. One field was simultaneously a printed string and scene direction,
 * so an operator writing a marketing line got it painted into the artwork as
 * subject matter.
 *
 * Here `coverDescription` is copy and only copy. Art direction comes from
 * `coverArtDirection` and the production profile, and nothing that is printed is
 * ever fed to the model as a description of the scene.
 */
import type { ProjectConfig } from '@wildlands/shared';
import { buildBackCoverCopy, buildSeriesLine } from '@wildlands/shared';
import { getProductionProfile } from '../production-profiles/registry.js';
import { assembleIllustrationDna, getStyleDna } from '../publishing-standard/style-dna.js';
import { coverAllowsSpineText } from '../stage-6-layout/render-html.js';
import { resolveCoverGeometry, MODEL_CANVAS, type CoverGeometry } from './cover-geometry.js';

/** Words that will be printed on the cover. Nothing here describes the artwork. */
export interface CoverCopy {
  title: string;
  subtitle?: string;
  /** A printed front-cover line, e.g. "A Field Guide to ...". PRINTED, not art direction. */
  coverDescription?: string;
  author: string;
  seriesLine?: string;
  back?: {
    mainDescription?: string;
    insideThisVolume?: string[];
    authorBio?: string;
  };
}

/** How the cover should look. None of this is ever printed. */
export interface CoverArtDirection {
  styleDnaId: string;
  /** The assembled style block for that DNA. */
  masterStyleBlock: string;
  /** Operator-authored scene direction, verbatim. Optional. */
  operatorDirection?: string;
  /** The book class's own cover language, from the production profile. */
  atmosphere: string;
  mood: string;
  /** True when the resolved DNA renders in colour. */
  fullColour: boolean;
  paperHex: string;
  inkHex: string;
}

export interface CoverModelConfig {
  model: string;
  sizePx: { widthPx: number; heightPx: number };
  quality: 'low' | 'medium' | 'high' | 'auto';
  /** Whether a reference blueprint is supplied with the request. */
  usesBlueprint: boolean;
}

export interface CoverSpec {
  projectId: string;
  productionProfileId: string;
  copy: CoverCopy;
  art: CoverArtDirection;
  geometry: CoverGeometry;
  model: CoverModelConfig;
  /**
   * KDP only permits spine text from 79 pages up. Below that the spine must stay
   * clean artwork, so the prompt and the blueprint both have to know.
   */
  spineTextAllowed: boolean;
  /**
   * WHO SETS THE SPINE TYPE.
   *
   * 'deterministic' asks the model for an EMPTY spine and lets code set the type
   * afterwards. This is the default because the spine is the one part of the
   * wrap that is not illustration — it is two lines of type on a flat field —
   * and because a 46px strip is below what an image model can letter. Three
   * attempts on this book produced stacked, stacked, and mirrored-and-garbled.
   *
   * 'ai' keeps the old behaviour for the book that already shipped that way.
   */
  spineTypeSetBy: 'deterministic' | 'ai';
  /**
   * WHO SETS THE AUTHOR NAME. Same reasoning as the spine, learned the same way.
   *
   * An image model has a strong learned convention that the author's name sits
   * at the very bottom of a front cover, and it follows that convention over any
   * instruction to the contrary. Measured on DIRT RICH: the type-safety block
   * permits type down to 95.9% of the canvas height, the art direction demanded
   * the name end by 86%, and four consecutive generations placed it at 90-96% —
   * hard against the trim, which is exactly what it must never be.
   *
   * 'deterministic' therefore asks the model for artwork with NO author lettering
   * and lets code place the name at an exact height afterwards. 'ai' keeps the
   * old behaviour for covers already approved that way.
   */
  authorTypeSetBy: 'deterministic' | 'ai';
  provenance: {
    resolvedAt: string;
    pageCountSource: 'typeset' | 'rendered-pages';
    /** Set when the book already has artwork built for a page count. */
    coverBuiltForPageCount: number | null;
  };
}

/**
 * A B&W INTERIOR IS NOT A B&W COVER.
 *
 * KDP prints every paperback cover in full colour regardless of the interior, so
 * the cover must resolve its own DNA. Left to inherit, this book generated in
 * monochrome and quietly converted the art direction's cobalt and signal orange
 * into tone. Precedence: explicit edition DNA, then the profile's COVER DNA,
 * then the profile default.
 */
export function resolveCoverStyleDnaId(config: ProjectConfig, editionStyleDnaId?: string): string {
  const profile = getProductionProfile(config.productionProfileId);
  return editionStyleDnaId ?? profile.coverStyleDnaId ?? profile.defaultStyleDnaId;
}

export interface BuildCoverSpecInput {
  projectId: string;
  config: ProjectConfig;
  pageCount: number;
  pageCountSource: 'typeset' | 'rendered-pages';
  model: string;
  editionStyleDnaId?: string;
  quality?: CoverModelConfig['quality'];
  spineTypeSetBy?: 'deterministic' | 'ai';
  authorTypeSetBy?: 'deterministic' | 'ai';
}

/**
 * Strip spine-lettering direction out of operator art direction.
 *
 * When code sets the spine, an art-direction line telling the model to letter it
 * is a contradiction, and contradictions in this prompt are exactly what
 * produced the bad covers. The stored field is NEVER mutated — this is a
 * build-time transformation of a copy.
 */
export function withoutSpineLetteringDirection(direction: string): string {
  return direction
    .split(/\n/)
    .filter((line) => !/^\s*SPINE\s*[:—-]/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildCoverSpec(input: BuildCoverSpecInput): CoverSpec {
  const { config, pageCount } = input;
  const profile = getProductionProfile(config.productionProfileId);
  const styleDnaId = resolveCoverStyleDnaId(config, input.editionStyleDnaId);
  const dna = getStyleDna(styleDnaId);

  const back = buildBackCoverCopy(config.publishing.bookDescription);
  const seriesLine =
    buildSeriesLine(config.publishing.series?.name, config.publishing.series?.volumeNumber ?? config.volume) ??
    undefined;

  const copy: CoverCopy = {
    title: (config.publishing.title ?? config.title).toUpperCase(),
    subtitle: config.publishing.subtitle ?? config.subtitle ?? undefined,
    coverDescription: config.publishing.coverDescription || undefined,
    author: config.publishing.authors?.length ? config.publishing.authors.join(', ') : config.authorName,
    seriesLine,
    back: back
      ? {
          mainDescription: back.mainDescription,
          insideThisVolume: back.insideThisVolume,
          authorBio: back.authorBio,
        }
      : undefined,
  };

  // The field guide has no explicit cover language; its historical wording is
  // kept so that book's prompt is unchanged by this module existing.
  const artLanguage = profile.coverArtLanguage ?? {
    atmosphere:
      'a single continuous wilderness panorama wrapping back-to-front; archival painterly naturalist atmosphere, scaled up to a premium collector cover',
    mood: 'premium, cinematic, atmospheric, cohesive',
  };

  const spineTypeSetBy = input.spineTypeSetBy ?? 'deterministic';
  // Defaults to 'ai' so existing books are untouched; a book opts in.
  const authorTypeSetBy = input.authorTypeSetBy ?? 'ai';
  const rawDirection = (config.publishing.coverArtDirection ?? '').trim();
  const direction =
    spineTypeSetBy === 'deterministic' ? withoutSpineLetteringDirection(rawDirection) : rawDirection;

  const art: CoverArtDirection = {
    styleDnaId,
    masterStyleBlock: assembleIllustrationDna(styleDnaId),
    operatorDirection: direction || undefined,
    atmosphere: artLanguage.atmosphere,
    mood: artLanguage.mood,
    // Read from the resolved DNA rather than from the interior's colour setting.
    fullColour: /FULL COLOU?R/i.test(dna.colorMode),
    paperHex: dna.palette.paperHex,
    inkHex: dna.palette.inkHex,
  };

  return {
    projectId: input.projectId,
    productionProfileId: profile.id,
    copy,
    art,
    geometry: resolveCoverGeometry(config, pageCount, MODEL_CANVAS),
    spineTextAllowed: coverAllowsSpineText(pageCount),
    spineTypeSetBy,
    authorTypeSetBy,
    model: {
      model: input.model,
      sizePx: { widthPx: MODEL_CANVAS.widthPx, heightPx: MODEL_CANVAS.heightPx },
      quality: input.quality ?? 'high',
      usesBlueprint: true,
    },
    provenance: {
      resolvedAt: new Date().toISOString(),
      pageCountSource: input.pageCountSource,
      coverBuiltForPageCount: config.publishing.coverSync?.builtForPageCount ?? null,
    },
  };
}
