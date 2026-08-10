/**
 * THE APPROVED INTERIOR ARTIFACT — what downstream production consumes.
 *
 * The platform grew a second production track and nobody connected it to the
 * end of the factory. Downstream code assumed every book is an array of
 * approved raster page renders, because for the only book that had shipped, it
 * was. A typeset book is not: it is ONE finished PDF carrying live vector text,
 * embedded Type0 fonts and stamped illustrations.
 *
 * This module is the join. Both tracks resolve to the same small shape, so the
 * cover, the audits and final assembly can ask "how many pages, and where is the
 * interior" without knowing which track produced it.
 *
 * The typeset PDF is passed through UNCHANGED. Rasterising it back into page
 * images to satisfy the old assembler would destroy the vector text, the fonts
 * and the stamped art, which are the entire reason that track exists.
 */
import type { ProjectConfig } from '@wildlands/shared';

export type ProductionTrack = 'rendered-pages' | 'typeset';

export interface InteriorArtifact {
  track: ProductionTrack;
  /** Interior page count. The number the spine is sized from. */
  pageCount: number;
  /**
   * Present for the typeset track: the finished interior, already merged.
   * Absent for the rendered-page track, which assembles from per-page PDFs.
   */
  pdf?: Buffer;
  /** Human-readable account of where pageCount came from, for the audit UI. */
  source: string;
}

/**
 * Which track a project is on.
 *
 * Read from the production profile rather than guessed from what data happens
 * to exist: a half-populated project must not silently change tracks.
 */
export function resolveTrack(profileBodyRenderTrack: string | undefined): ProductionTrack {
  return profileBodyRenderTrack === 'typeset' ? 'typeset' : 'rendered-pages';
}

export interface ResolveInteriorDeps {
  /** Legacy planned-page rows. The rendered-page track's page source. */
  countPlannedPages: () => Promise<number>;
  /** Runs the typesetter and returns the finished interior. */
  renderTypesetInterior: () => Promise<{ pdf: Buffer; pageCount: number }>;
}

/**
 * Resolve the interior for either track.
 *
 * Deliberately takes its dependencies rather than importing them: the cover
 * path needs only the page count and must not pull the whole typesetting stack
 * into a cover-only request, which is the same reason renderCoverPdf avoided
 * rendering the interior in the first place.
 */
export async function resolveInteriorArtifact(
  track: ProductionTrack,
  deps: ResolveInteriorDeps,
): Promise<InteriorArtifact> {
  if (track === 'typeset') {
    const { pdf, pageCount } = await deps.renderTypesetInterior();
    return {
      track,
      pageCount,
      pdf,
      source: `typeset interior (${pageCount} pages, rendered by the typesetter)`,
    };
  }
  const pageCount = await deps.countPlannedPages();
  return {
    track,
    pageCount,
    source: `${pageCount} planned page rows`,
  };
}

/**
 * Page count only, for callers that must not pay to render the interior.
 *
 * A typeset book has no page table, so the only honest count comes from the
 * typesetter. Callers that cannot afford that (the cover, which used to throw
 * `no_pages` on every typeset book) may supply a cached count instead.
 */
export async function resolveInteriorPageCount(
  track: ProductionTrack,
  deps: { countPlannedPages: () => Promise<number>; countTypesetPages: () => Promise<number> },
): Promise<{ pageCount: number; source: string }> {
  if (track === 'typeset') {
    const pageCount = await deps.countTypesetPages();
    return { pageCount, source: 'typeset render' };
  }
  const pageCount = await deps.countPlannedPages();
  return { pageCount, source: 'planned page rows' };
}

/** Interior page count is the one input the cover cannot be built without. */
export function assertInteriorReady(artifact: { pageCount: number }, config: ProjectConfig): void {
  if (artifact.pageCount > 0) return;
  throw new Error(
    `No interior pages found for "${config.title}". Run the production step for this book's track ` +
      'before building the cover: pagination for a rendered-page book, or the typeset preview for a typeset book.',
  );
}
