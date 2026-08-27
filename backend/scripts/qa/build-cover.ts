/**
 * build-cover — THE operator command for finishing a cover.
 *
 * One command, both bindings. It replaces the pattern of writing a new
 * book-specific script every time a cover is needed.
 *
 *   tsx scripts/qa/build-cover.ts \
 *     --interior final-interior.pdf \
 *     --art approved-wrap.png \
 *     --binding paperback --ink bw --paper white --trim 6x9 \
 *     --title "..." --author "..." \
 *     --out cover.pdf --proof proof.png --manifest cover.json
 *
 * THERE IS NO --pages FLAG. The page count comes out of the interior PDF that is
 * shipping. A typed page count cannot be wrong loudly, and a wrong spine is a
 * reprint.
 *
 * THERE IS NO --spine FLAG either. Geometry comes from the published KDP
 * specification for a paperback, and from verified Cover Calculator readings for
 * a hardcover. An unsupported configuration exits 3 rather than approximating.
 *
 * This command does not generate, redesign or upscale artwork. It places art
 * that a human has already approved.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCover } from '../../src/pipeline/cover/compositor/build-cover.js';
import type { FitMode } from '../../src/pipeline/cover/compositor/artwork.js';
import { UnverifiedKdpConfigurationError } from '../../src/pipeline/publishing-standard/kdp-spec.js';
import type { KdpBinding, KdpInk, KdpPaper } from '../../src/pipeline/publishing-standard/kdp-spec.js';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const i = argv.indexOf(hit);
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : '';
};
const has = (name: string) => argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const die = (msg: string, code = 1): never => {
  console.error(msg);
  process.exit(code);
};

const INTERIOR = flag('interior');
const ART = flag('art');
if (!INTERIOR) die('build-cover: --interior <final interior PDF> is required.');
if (!ART) die('build-cover: --art <approved wrap artwork> is required.');

const BINDINGS: Record<string, KdpBinding> = { paperback: 'PAPERBACK', hardcover: 'HARDCOVER' };
const INKS: Record<string, KdpInk> = {
  bw: 'BLACK_AND_WHITE',
  'black-and-white': 'BLACK_AND_WHITE',
  premium: 'PREMIUM_COLOR',
  standard: 'STANDARD_COLOR',
};
const PAPERS: Record<string, KdpPaper> = { white: 'WHITE', cream: 'CREAM', groundwood: 'GROUNDWOOD' };

const binding = BINDINGS[(flag('binding') ?? 'paperback').toLowerCase()];
const ink = INKS[(flag('ink') ?? 'bw').toLowerCase()];
const paper = PAPERS[(flag('paper') ?? 'white').toLowerCase()];
if (!binding) die(`build-cover: --binding must be one of ${Object.keys(BINDINGS).join(', ')}.`);
if (!ink) die(`build-cover: --ink must be one of ${Object.keys(INKS).join(', ')}.`);
if (!paper) die(`build-cover: --paper must be one of ${Object.keys(PAPERS).join(', ')}.`);

const trim = flag('trim') ?? '6x9';
const title = flag('title') ?? '';
const author = flag('author') ?? '';
if (!title) die('build-cover: --title is required.');
if (!author) die('build-cover: --author is required.');

/**
 * Front-cover author placement, MEASURED off the approved artwork.
 *
 * Given together or not at all: a name set at a guessed baseline is worse than
 * no name, because it looks deliberate and is wrong.
 */
const faBaseline = flag('author-baseline');
const faCap = flag('author-cap-height');
const faWidth = flag('author-max-width');
const frontAuthor =
  faBaseline && faCap && faWidth
    ? {
        baselineFromBottomIn: Number(faBaseline),
        capHeightIn: Number(faCap),
        maxWidthIn: Number(faWidth),
      }
    : undefined;
if ((faBaseline || faCap || faWidth) && !frontAuthor) {
  die('build-cover: --author-baseline, --author-cap-height and --author-max-width are given together or not at all.');
}

/** Cap the side crop, for artwork whose type sits near its own edge. */
const maxSideCrop = flag('max-side-crop');

/**
 * A short list set across the front panel, under whatever the artwork paints.
 * Lines are separated by a pipe so a list can carry its own separators.
 */
const flLines = flag('front-list');
const flCap = flag('front-list-cap-height');
const flGap = flag('front-list-gap');
const flWidth = flag('front-list-max-width');
const frontList =
  flLines && flCap && flGap && flWidth
    ? {
        lines: flLines.split('|').map((l) => l.trim()).filter(Boolean),
        capHeightIn: Number(flCap),
        gapBelowTypeIn: Number(flGap),
        maxWidthIn: Number(flWidth),
      }
    : undefined;
if ((flLines || flCap || flGap || flWidth) && !frontList) {
  die('build-cover: --front-list, --front-list-cap-height, --front-list-gap and --front-list-max-width go together.');
}

const OUT = flag('out');
const PROOF = flag('proof');
const MANIFEST = flag('manifest');
const JSON_ONLY = has('json');

try {
  const result = await buildCover({
    interiorPdf: readFileSync(INTERIOR),
    interiorName: INTERIOR,
    artwork: readFileSync(ART),
    artworkName: ART,
    binding,
    ink,
    paper,
    trim,
    title,
    author,
    frontAuthor,
    ...(frontList ? { frontList } : {}),
    ...(maxSideCrop ? { maxSideCropIn: Number(maxSideCrop) } : {}),
    subtitle: flag('subtitle'),
    spineText: has('no-spine-text') ? false : undefined,
    fitMode: (flag('fit') as FitMode | undefined) ?? undefined,
    renderDpi: flag('dpi') ? Number(flag('dpi')) : undefined,
  });

  if (OUT) writeFileSync(OUT, result.productionPdf);
  if (PROOF) writeFileSync(PROOF, result.proofPng);
  if (MANIFEST) writeFileSync(MANIFEST, JSON.stringify(result.manifest, null, 2));

  if (JSON_ONLY) {
    console.log(
      JSON.stringify(
        { status: result.status, manifest: result.manifest, checks: result.checks, geometry: result.geometry },
        null,
        2,
      ),
    );
  } else {
    console.log(result.report);
    if (OUT) console.log(`  production            ${OUT}`);
    if (PROOF) console.log(`  proof                 ${PROOF}`);
    if (MANIFEST) console.log(`  manifest              ${MANIFEST}`);
    console.log('');
  }

  // A blocked cover must not look like a successful build to a shell script.
  if (result.status === 'BLOCKED') process.exit(2);
} catch (e) {
  if (e instanceof UnverifiedKdpConfigurationError) die(e.message, 3);
  die(`build-cover failed: ${(e as Error).message}`, 1);
}
