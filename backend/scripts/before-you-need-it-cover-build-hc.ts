/**
 * BEFORE YOU NEED IT — compose the paperback wrap.
 *
 * Runs the canonical compositor. It reads the page count out of the interior
 * that is actually shipping, derives the geometry, places the approved artwork,
 * sets the spine type and the front author name as REAL TYPE, checks the
 * barcode reserve and the effective resolution, and emits both a clean
 * production PDF and a guided proof.
 *
 * Nothing here decides geometry. The artwork is never regenerated.
 *
 *   yarn tsx scripts/before-you-need-it-cover-build.ts
 *
 * Local and free: no model, no network.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildCover } from '../src/pipeline/cover/compositor/build-cover.js';
import { INTERIOR_NAME, INTERIOR_PDF } from './before-you-need-it-config.js';

const BOOK = 'C:/Users/jovan/Downloads/before-you-need-it';
const COVER = `${BOOK}/06-PRODUCTION/cover`;
const INTERIOR = INTERIOR_PDF;
/**
 * HARDCOVER USES ITS OWN PLATE.
 *
 * KDP rejected the hardcover: the title ran into the hinge and over the top
 * safe line. The hardcover has a 0.394in hinge either side of the spine and a
 * 0.635in safe inset; the paperback has neither, and its title clears its own
 * 0.25in margin, so the paperback is left exactly as approved and shipping.
 *
 * `_byni_titlefix.ts` builds this plate from the approved artwork by lifting the
 * lettering, filling behind it, and putting it back at 80%. Nothing else in the
 * artwork differs from the shared master.
 */
const ARTWORK = `${COVER}/_titlefix/wrap-art-HARDCOVER-title80.png`;

mkdirSync(COVER, { recursive: true });

/**
 * TWO APPROVED SPINE VERSIONS, BUILT FROM ONE SCRIPT.
 *
 *   (no flag)  VERSION A — spine type solid black, author flush to the foot of
 *              the safe zone. The approved, shipping set.
 *   --version-b  VERSION B — spine type in the front cover's navy, and the
 *              author lifted 0.30in off the foot so it sits nearer the title
 *              and further from the trim edge.
 *
 * They differ in the spine typography and NOTHING else: same artwork, same
 * front, same back, same geometry, same type size. Version B writes to its own
 * filenames so it cannot overwrite the approved set — the cover PDF build is
 * not deterministic (three builds of one input give three hashes), so an
 * overwritten file cannot be restored by rebuilding it.
 */
const VERSION_B = process.argv.includes('--version-b');
/** The title's navy, the same ink the front cover author is set in. */
const SPINE_NAVY = '#08254C';

const result = await buildCover({
  interiorPdf: readFileSync(INTERIOR),
  interiorName: INTERIOR_NAME,
  artwork: readFileSync(ARTWORK),
  artworkName: 'wrap-art-HARDCOVER-title80.png (from BYNI-cover-wrap-art-A_UPSCALED)',

  binding: 'HARDCOVER',
  ink: 'BLACK_AND_WHITE',
  paper: 'WHITE',
  trim: '5.5x8.5',

  title: 'Before You Need It',
  author: 'Margo Teale',
  subtitle:
    'A Mother\u2019s Honest Guide to Periods, Puberty, and Everything Nobody Explains \u2014 For Girls 8\u201312',

  /** Title and author on the spine, as live type. Never generated into the art. */
  spineText: true,
  spineInkHex: VERSION_B ? SPINE_NAVY : undefined,
  spineAuthorFootInsetIn: VERSION_B ? 0.30 : undefined,

  /**
   * The author name on the FRONT, in real type rather than painted into the
   * raster — so its spelling and typography are exact and a change costs a
   * rebuild rather than a paid image edit.
   *
   * Two inches up from the bottom trim, per the owner's direction: clear of the
   * edge, and below the objects the artwork already places.
   */
  frontAuthor: {
    /** Lower on the panel — down near the foot, but clear of the trim. */
    baselineFromBottomIn: 1.05,
    /** Half again bigger: it has to read on a shelf, not just on screen. */
    capHeightIn: 0.30,
    maxWidthIn: 4.0,
    /**
     * The title's own navy, sampled off the approved artwork (#06234a..#09274d)
     * rather than picked by eye, so the author name and the title are the same
     * ink. Cream-on-cream was invisible.
     */
    fill: '#08254C',
    /** A soft cream halo, so the name still holds where it crosses the figure. */
    halo: 'rgba(250,244,230,0.75)',
  },

  builtAt: '2026-08-31T00:00:00.000Z',
});

console.log(result.report);
console.log(`\nstatus: ${result.status}`);
console.log(`spine text: requested=${result.spineText.requested} placed=${result.spineText.placed}`);
if (result.manifest.frontAuthor) {
  const fa = result.manifest.frontAuthor;
  console.log(`front author: "${fa.name}" ${fa.sizePx}px, ink ${fa.inkWidthIn.toFixed(3)}in, baseline ${fa.baselineFromBottomIn}in from bottom`);
}
console.log(`effective ppi: ${result.manifest.effectivePpi}`);

/**
 * NAMED FROM THE INTERIOR THAT WAS ACTUALLY MEASURED, not from a literal.
 *
 * These filenames carried a hardcoded "184pp" from before the blank leaves came
 * out, so a wrap built for a 174-page book was written to a file announcing 184
 * -- the geometry inside was right and the name on the outside was wrong, which
 * is the version of this mistake nobody catches by looking.
 *
 * The manifest is per-binding for the same reason: both scripts wrote
 * `BYNI-cover-manifest.json`, so whichever ran second silently replaced the
 * other's record of what shipped.
 */
const PP = result.manifest.interior.pageCount;
const SUFFIX = VERSION_B ? '-VERSION-B-navy-spine' : '';
const STEM = `${COVER}/BYNI-cover-HARDCOVER-${PP}pp${SUFFIX}`;

writeFileSync(`${STEM}.pdf`, result.productionPdf);
writeFileSync(`${STEM}-PROOF.png`, result.proofPng);
writeFileSync(`${COVER}/BYNI-cover-HARDCOVER-manifest${SUFFIX}.json`, JSON.stringify(result.manifest, null, 2));
console.log(`\nproduction -> ${STEM}.pdf`);
console.log(`proof      -> ${STEM}-PROOF.png`);
process.exit(result.status === 'READY' ? 0 : 1);
