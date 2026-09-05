/**
 * TRAIN THE DOG YOU'VE GOT — the book's constants, in one place.
 *
 * Everything book-specific lives here or in `build.ts`. Nothing in this folder
 * is imported by any other book, and this folder imports the shared pipeline
 * READ-ONLY: the geometry resolver, the artwork fitter, the validator, the proof
 * renderer, the spine typesetter and the copy-column typesetter are used exactly
 * as BEFORE YOU NEED IT uses them, and not one of them is modified.
 *
 * WHY A DOG-BOOK MODULE RATHER THAN AN EXTENSION OF THE COMPOSITOR.
 * `build-cover.ts` opens by saying "Nothing about any particular book belongs in
 * this file." A front cover whose title is stacked on three lines, optically
 * balanced, colour-matched to one particular illustration and sized against one
 * particular thumbnail is exactly that — a book's design, not an engine's
 * capability. Putting it in the shared compositor would have contradicted the
 * compositor's own contract and put the puberty book's build behind a diff it
 * has no use for. So the layout lives here and the MATHS stays there.
 *
 * The one authority for trim, bleed, spine and safe zones remains
 * `resolveCoverGeometry`. This folder never computes a dimension.
 */
import type { KdpBinding, KdpInk, KdpPaper } from '../../src/pipeline/publishing-standard/kdp-spec.js';

export const BOOK = "TRAIN THE DOG YOU'VE GOT";

const ROOT = 'C:/Users/jovan/Downloads/train-the-dog-youve-got/10-PRODUCTION';

/** The interior that is actually shipping. Its page count and hash are authoritative. */
export const INTERIOR_PDF = `${ROOT}/INTERIOR.pdf`;
export const INTERIOR_NAME = 'INTERIOR.pdf';

/** Everything this pipeline writes. Clean production files and guided proofs are kept apart inside it. */
export const COVER_DIR = `${ROOT}/cover`;

/**
 * The printing configuration, fixed by decisions already taken and recorded in
 * PRODUCTION-REPORT.md: 6x9 regular trim, black ink, white paper.
 */
export const KDP_CONFIG: { binding: KdpBinding; ink: KdpInk; paper: KdpPaper; trim: string } = {
  binding: 'PAPERBACK',
  ink: 'BLACK_AND_WHITE',
  paper: 'WHITE',
  trim: '6x9',
};

export const TITLE = "TRAIN THE DOG YOU'VE GOT";
export const AUTHOR = 'Drew Corley';
export const SUBTITLE = 'Dog Training for Kids 8\u201312';
