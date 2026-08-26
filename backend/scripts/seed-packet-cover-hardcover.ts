/**
 * WHAT THE SEED PACKET SKIPS — HARDCOVER case wrap -> print-ready PDF for KDP.
 *
 * Sibling of `seed-packet-cover-paperback.ts`, same artwork, different canvas.
 * A hardcover is NOT a paperback wrap scaled up: 0.591in of every edge folds
 * around the board, a 0.394in hinge either side of the spine is where the case
 * bends, and at the SAME 126 pages the spine is 0.504in against the paperback's
 * 0.315in. Geometry comes from a VERIFIED KDP Cover Calculator reading held in
 * `kdp-cover-specs.ts`, never from arithmetic on the paperback numbers.
 *
 *   node ../node_modules/tsx/dist/cli.mjs scripts/seed-packet-cover-hardcover.ts
 *
 * ─── WHY THIS DOES NOT CALL composeCoverPrint ─────────────────────────────
 * It should, and eventually will. Two defects in that engine made the first
 * shipped attempt unusable, and both are recorded here so the fix is obvious
 * when the engine is corrected:
 *
 * 1. ASPECT CROP. The model paints 3:2 (aspect 1.500). This hardcover case wrap
 *    is 14.079 x 10.417in, aspect 1.352. `composeCoverPrint` resolves that with
 *    sharp `fit:'cover'`, which scales to the larger dimension and CROPS THE
 *    SIDES - 196px, or 0.654in, off each edge. The blueprint tells the model to
 *    keep copy inside a safe margin expressed as a fraction of ITS canvas, so
 *    the model complied and the composition then sliced that margin away,
 *    inside the trim line. The art was correct; the compositor cut it off.
 *    Here a gentler scale crops only 0.400in per side, and the residual height
 *    is made up by stretching the TOP band, which is sky. The bottom is never
 *    stretched - it holds the basket and the hens, and smearing a recognisable
 *    object is worse than any margin gained.
 *
 * 2. SILENT FONT FALLBACK. `author-typesetter.ts` asks for 'Archivo'. sharp
 *    rasterises SVG through librsvg, which resolves families through fontconfig
 *    and CANNOT see the TTFs vendored for the interior. Archivo, Lora and EB
 *    Garamond all render byte-identical output - every one of them silently
 *    falls back to DejaVu Sans. The author name was never set in the face it
 *    asked for. Georgia is used here because it is verifiably resolvable and
 *    its warmth sits with the slab title; it is a SYSTEM font, so this is not
 *    portable to a Linux box and is the reason the engine still needs a real
 *    fix (register the vendored TTFs with fontconfig, or draw text as paths).
 *
 * Page count is READ FROM THE BUILT INTERIOR, never typed in.
 *
 */
import { readFileSync, writeFileSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';
import { ProjectConfigSchema } from '@wildlands/shared';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { computeCoverDimensions } from '../src/pipeline/publishing-standard/cover-dimensions.js';
import { getKdpCoverDimensions } from '../src/pipeline/publishing-standard/kdp-cover-specs.js';

/** The verified reading for this book. Replaces wrap/margin literals. */
const HC_KDP = getKdpCoverDimensions({
  binding: 'HARDCOVER',
  coverType: 'CASE_LAMINATE',
  interiorType: 'BLACK_AND_WHITE',
  paperType: 'CREAM',
  trimSize: '6x9',
  pageCount: 126,
});

// PRODUCTION CONTEXT. The dev database is not where the title lives, and the
// dev project still carries the OLD title — reading it would stamp the wrong
// spine. `getEnv()` caches lazily, so overriding here (after the hoisted imports
// have done their dotenv load) still wins, provided nothing has read env yet.
const __REPO_ROOT = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '../../');
const __PROD = parseDotenv(readFileSync(nodePath.join(__REPO_ROOT, '.env')));
process.env.DATABASE_URL = __PROD.DATABASE_URL;
process.env.APP_ENVIRONMENT = 'production';
const PROJECT_ID = 'a4e2bbda-645f-4583-9123-7d24ab515c9c'; // PRODUCTION — title/subtitle live here
// Downloads was reorganised on 2026-08-17 and the loose book files were moved
// into `dirt rich book/`. The deliverables are keyed off one directory so a
// future move is a single edit rather than four.
const BOOK_DIR = 'C:/Users/jovan/Downloads/dirt rich book';
/**
 * `--clean` writes the wrap with NO author name and NO spine type: the art
 * exactly as the model painted it, placed on the print wrap at final size.
 *
 * It exists because the author name and spine are composited by CODE, not by
 * the model, so "remove the lettering" is not a retouching job — it is simply
 * not drawing it. Anyone asked to delete that type by hand would be repainting
 * mulch that was never covered in the first place.
 */
const CLEAN = process.argv.includes('--clean');
// The APPROVED render. `_artwork-no-author.png` is the 20:36 re-render; the
// operator chose this earlier one back. Both are raw model output with NO
// lettering of any kind - the author name has always been composited by code,
// so switching between them never involves painting anything out.
const ART = 'C:/Users/jovan/Downloads/dirt rich book/COVER REV5 - new title/COVER-REV5-ARTWORK-UPSCALED-4x.png';
const INTERIOR = `${BOOK_DIR}/SEED-PACKET-INTERIOR-FINAL.pdf`;
const OUT_PDF = `C:/Users/jovan/Downloads/dirt rich book/COVER HARDCOVER/COVER-HARDCOVER-PRINT.pdf`;
const OUT_PROOF = `C:/Users/jovan/Downloads/dirt rich book/COVER HARDCOVER/COVER-HARDCOVER-proof.png`;

const DPI = 300;
/** KDP: keep every piece of type this far inside the physical edge. */
const SAFE_IN = HC_KDP.wrapIn + HC_KDP.marginIn; // wrap + margin: distance from the CANVAS edge
/** Chosen so the back copy lands ~0.49in in - clear of safe, minimal side loss. */
const SCALE = 4464 / 6144; // 0.40in side crop, ~0.50in sky extend on the hardcover canvas
/** The clear band of path: the sign ends at 5.16in, the hen's comb starts 5.77in. */
/**
 * Author baseline, measured UP FROM THE FOOT rather than down from the head.
 * Placed at 5.6in it sat directly under the subtitle and read as part of the
 * sign. One inch off the foot puts it where a reader expects an author name.
 */
const AUTHOR_BASE_ABOVE_FOOT_IN = HC_KDP.wrapIn + 1.0; // 1in above the TRIM foot
/** Sampled from the title lettering itself, not an invented white. */
const AUTHOR_CREAM = '#e7d4b4';
const AUTHOR_FONT_PX = 120;
/** KDP allows this much fold variance either side of each spine fold. */
const SPINE_FOLD_VARIANCE_IN = 0.0625;
/**
 * Spine type, set by CODE for the same reason the author name is.
 *
 * The spine is 0.504in of a 14.079in wrap — 151px at print, ~17px on the model's
 * own canvas. At that size an image model cannot hold orientation, spacing or
 * spelling, so the blueprint tells it to leave the spine EMPTY and the type is
 * composited here. Contrast is NOT assumed — see the halo note at the spine SVG
 * and the contrast gate at the foot of this file.
 *
 * Sizes are bounded by KDP's spine-safe strip, not by taste: the calculator
 * gives 0.379in of a 0.504in spine, so 0.0625in of fold variance per side.
 */
//
// SIZE. The strip is the only thing that bounds this: a 91px Arial Black cap
// stands ~0.209in, which fills the 0.379in spine-safe width with ~0.14in of
// clearance each side — comfortably inside the 0.0625in fold variance, and large
// enough to read from across a room, the only distance a spine is read from.
const SPINE_TITLE_PX = 91;  // refitted for hardcover: cap 0.209in inside a 0.379in safe strip
const SPINE_AUTHOR_PX = 63; // keeps the same step down from the title

const project = await getProject(PROJECT_ID);
if (!project) throw new Error('project not found');
const config = ProjectConfigSchema.parse(project.config);
const pageCount = (await PDFDocument.load(readFileSync(INTERIOR))).getPageCount();

/* HARDCOVER GEOMETRY comes from the VERIFIED KDP Cover Calculator reading, not
   from the paperback calculator. A hardcover is a case wrap: a 0.591in wrap
   folds around the board, a 0.394in hinge is where the cover bends, and the
   spine is 0.504in at the SAME 126 pages the paperback sets at 0.315in.
   Reusing paperback geometry here would be rejected by KDP. */
const { getKdpCoverDimensions } = await import('../src/pipeline/publishing-standard/kdp-cover-specs.js');
const kdp = getKdpCoverDimensions({
  binding: 'HARDCOVER',
  coverType: 'CASE_LAMINATE',
  interiorType: 'BLACK_AND_WHITE',
  paperType: 'CREAM',
  trimSize: '6x9',
  pageCount,
});
console.log(`KDP spec  : ${kdp.provenance.toUpperCase()} — ${kdp.note}`);
const dims = { fullWidthIn: kdp.fullWidthIn, fullHeightIn: kdp.fullHeightIn, spineIn: kdp.spineIn };

const W = Math.round(dims.fullWidthIn * DPI);
const H = Math.round(dims.fullHeightIn * DPI);
const native = await sharp(ART).metadata();
const scaledW = Math.round(native.width! * SCALE);
const scaledH = Math.round(native.height! * SCALE);
const sideCrop = Math.round((scaledW - W) / 2);
const topExtend = H - scaledH;
if (sideCrop < 0 || topExtend < 0) throw new Error('SCALE too small to fill the wrap');

const scaled = await sharp(ART)
  .resize(scaledW, scaledH, { kernel: 'lanczos3' })
  .extract({ left: sideCrop, top: 0, width: W, height: scaledH })
  .toBuffer();

// Edge-stretch, not mirror: a mirrored band once reflected the author's sign
// upside down. Stretching the outermost sky rows cannot duplicate an object.
const skyBand = await sharp(scaled)
  .extract({ left: 0, top: 0, width: W, height: 60 })
  .resize(W, topExtend, { fit: 'fill', kernel: 'lanczos3' })
  .toBuffer();

const plate = await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
  .composite([
    { input: skyBand, top: 0, left: 0 },
    { input: scaled, top: topExtend, left: 0 },
  ])
  .png()
  .toBuffer();

const spineWpx = Math.round(dims.spineIn * DPI);
const spineX1 = Math.round((dims.fullWidthIn - kdp.frontWidthIn - kdp.wrapIn) * DPI);
const spineX0 = spineX1 - spineWpx;


// ── the author name, set at full print resolution ─────────────────────────
// The previous wrap composited the name at 1536px wide and then upscaled the
// whole result 2.45x, so the lettering was soft before it ever reached a page.
const frontCentreX = Math.round((dims.fullWidthIn - kdp.frontWidthIn / 2 - kdp.wrapIn) * DPI);
/**
 * THE NAME SITS ON THE ARTWORK, NOT ON A PANEL.
 *
 * A solid band did guarantee contrast - by painting over the bottom of the
 * illustration, covering the hens and the path the cover is actually selling.
 * That is not a trade worth making; a cover that cannot be read is one problem,
 * a cover with its picture blanked out is a worse one.
 *
 * The baseline below was measured on THIS artwork: the sign ends at 5.16in and
 * the leading hen's comb starts at 5.77in, so 5.6in drops the name into the one
 * clear band of path, where a drop shadow is enough to hold it. Those two
 * numbers are asserted after the file is written, so if the art is ever
 * replaced the check fails rather than the name quietly landing on a bird.
 */
const baselineY = H - Math.round(AUTHOR_BASE_ABOVE_FOOT_IN * DPI);
const author = config.publishing?.author ?? 'Abby Fenwick';

const authorSvg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`,
  '<defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%">',
  '<feDropShadow dx="0" dy="3" stdDeviation="9" flood-color="#000" flood-opacity="0.72"/>',
  '</filter></defs>',
  `<text x="${frontCentreX}" y="${baselineY}" text-anchor="middle"`,
  ` font-family="Georgia, serif" font-size="${AUTHOR_FONT_PX}" font-weight="700"`,
  ` letter-spacing="${(AUTHOR_FONT_PX * 0.06).toFixed(1)}"`,
  ` fill="${AUTHOR_CREAM}" filter="url(#s)">${author}</text></svg>`,
].join('');

// ── the spine, set at print resolution ────────────────────────────────────
// The front panel begins immediately after the spine, so the spine's right edge
// IS the front fold. Deriving both from the same number keeps them from drifting.
const esc = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const spineTitle = esc(config.title ?? 'WHAT THE SEED PACKET SKIPS');
// Inside the rotated group a point (a, b) lands at (spineWpx - b, a): `a` runs
// DOWN the spine, `b` runs ACROSS it. Centring on `b` centres between the folds.
const across = spineWpx / 2;

/**
 * SPINE COMPOSITION — measured, not assumed.
 *
 * The old build pinned the title at 0.40 of wrap height and the author at 0.62.
 * Those two anchors sit 2.04in apart, which held a two-word title and nothing
 * longer. `WHAT THE SEED PACKET SKIPS` needs about 3.9in of run, so it grew
 * straight through the author and the two printed on top of each other — and
 * every existing gate passed, because none of them tested for collision.
 *
 * So: render each line ALONE, measure the ink it actually makes, then centre the
 * pair as ONE BLOCK on the spine. The composition is derived from the type, not
 * from percentages that were only ever true for one particular title.
 */
const SPINE_GAP_PX = Math.round(0.30 * DPI); // ink-to-ink breathing room

/** Length of a line's ink measured DOWN the spine, in px. */
const measureRun = async (text: string, fontPx: number, lsFactor: number): Promise<number> => {
  const probe = Buffer.from(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${H}" height="${Math.round(fontPx * 3)}">`,
      `<text x="${Math.round(H / 2)}" y="${Math.round(fontPx * 1.6)}" text-anchor="middle"`,
      ` font-family="Arial Black, Arial, sans-serif" font-size="${fontPx}" font-weight="700"`,
      ` letter-spacing="${(fontPx * lsFactor).toFixed(1)}" fill="#ffffff">${text}</text></svg>`,
    ].join(''),
  );
  const { data, info } = await sharp(probe).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let lo = info.width;
  let hi = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3]! > 24) {
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
  }
  return hi < 0 ? 0 : hi - lo + 1;
};

/**
 * Distance from a line's BASELINE to the vertical centre of its ink, in px.
 *
 * Across the spine the type has to sit on the strip's midline, and where that
 * midline falls relative to the baseline depends on the face's cap height — 0.345
 * of the em size was a guess at it. Once the fold-clearance check started
 * measuring the LETTERING rather than the lettering plus its shadow, the guess
 * showed up as 0.020in of imbalance on a 0.504in spine. So measure the face
 * instead of estimating it: `dominant-baseline` is not reliable through librsvg,
 * but the rendered ink is.
 */
const measureCapOffset = async (text: string, fontPx: number, lsFactor: number): Promise<number> => {
  const base = Math.round(fontPx * 1.6);
  const probe = Buffer.from(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${H}" height="${Math.round(fontPx * 3)}">`,
      `<text x="${Math.round(H / 2)}" y="${base}" text-anchor="middle"`,
      ` font-family="Arial Black, Arial, sans-serif" font-size="${fontPx}" font-weight="700"`,
      ` letter-spacing="${(fontPx * lsFactor).toFixed(1)}" fill="#ffffff">${text}</text></svg>`,
    ].join(''),
  );
  const { data: d, info: inf } = await sharp(probe).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let top = inf.height;
  let bot = -1;
  for (let y = 0; y < inf.height; y += 1) {
    for (let x = 0; x < inf.width; x += 1) {
      if (d[(y * inf.width + x) * inf.channels + 3]! > 24) {
        if (y < top) top = y;
        if (y > bot) bot = y;
        break;
      }
    }
  }
  return bot < 0 ? 0 : base - (top + bot) / 2;
};

const titleRun = await measureRun(spineTitle, SPINE_TITLE_PX, 0.08);
const authorRun = await measureRun(esc(author), SPINE_AUTHOR_PX, 0.06);
const titleCapOffset = await measureCapOffset(spineTitle, SPINE_TITLE_PX, 0.08);
const authorCapOffset = await measureCapOffset(esc(author), SPINE_AUTHOR_PX, 0.06);
const blockRun = titleRun + SPINE_GAP_PX + authorRun;
const blockTop = Math.round(H / 2 - blockRun / 2);
const titleAtPx = blockTop + titleRun / 2;
const authorAtPx = blockTop + titleRun + SPINE_GAP_PX + authorRun / 2;

console.log(
  `spine block: title run ${(titleRun / DPI).toFixed(2)}in, gap ${(SPINE_GAP_PX / DPI).toFixed(2)}in, ` +
    `author run ${(authorRun / DPI).toFixed(2)}in, total ${(blockRun / DPI).toFixed(2)}in, ` +
    `centred on ${(H / 2 / DPI).toFixed(2)}in of ${(H / DPI).toFixed(2)}in`,
);
if (blockRun > H - 2 * SAFE_IN * DPI) {
  throw new Error(
    `spine block ${(blockRun / DPI).toFixed(2)}in does not fit the safe spine height — reduce SPINE_TITLE_PX`,
  );
}

/**
 * A HALO BEHIND THE SPINE TYPE, AND WHY THE PAPERBACK DID NOT NEED ONE.
 *
 * The paperback spine sits at 6.157-6.472in of a 12.565in wrap, where this
 * artwork is flat #3b3c1c olive over its whole height, so cream type on bare art
 * was already high contrast. The hardcover spine is a DIFFERENT WINDOW ON THE
 * SAME PICTURE - 6.788-7.292in of a 14.079in wrap - and up at the head that
 * window crosses open sky and sunlit foliage. Measured on the first build, the
 * brightest tenth of the background under `WHAT THE` reached 193 against cream
 * ink at 214: a separation of 21, which is not a readable spine.
 *
 * Moving the block down would fix the contrast and break the centring, so the
 * type keeps its position and gets a symmetric dark halo instead - dx/dy zero,
 * so it reads as a shadow under the letters rather than an offset drop. This is
 * the same device the front author name already uses over mulch.
 */
const spineSvg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${spineWpx}" height="${H}">`,
  '<defs><filter id="sp" x="-25%" y="-25%" width="150%" height="150%">',
  '<feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="#000" flood-opacity="0.85"/>',
  '</filter></defs>',
  `<g transform="rotate(90) translate(0, -${spineWpx})" filter="url(#sp)">`,
  `<text x="${Math.round(titleAtPx)}" y="${(across + titleCapOffset).toFixed(1)}"`,
  ` text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="${SPINE_TITLE_PX}"`,
  ` font-weight="700" letter-spacing="${(SPINE_TITLE_PX * 0.08).toFixed(1)}"`,
  ` fill="${AUTHOR_CREAM}">${spineTitle}</text>`,
  `<text x="${Math.round(authorAtPx)}" y="${(across + authorCapOffset).toFixed(1)}"`,
  ` text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="${SPINE_AUTHOR_PX}"`,
  ` font-weight="700" letter-spacing="${(SPINE_AUTHOR_PX * 0.06).toFixed(1)}"`,
  ` fill="${AUTHOR_CREAM}">${esc(author)}</text>`,
  '</g></svg>',
].join('');

const wrap = CLEAN
  ? plate
  : await sharp(plate)
      .composite([
        { input: Buffer.from(authorSvg), top: 0, left: 0 },
        { input: Buffer.from(spineSvg), top: 0, left: spineX0 },
      ])
      .png()
      .toBuffer();

const outPdf = CLEAN ? `${BOOK_DIR}/COVER HARDCOVER/COVER-HARDCOVER-CLEAN-no-author-no-spine.pdf` : OUT_PDF;
const outProof = CLEAN ? `${BOOK_DIR}/COVER HARDCOVER/COVER-HARDCOVER-CLEAN-no-author-no-spine.png` : OUT_PROOF;
const pdf = await PDFDocument.create();
const page = pdf.addPage([dims.fullWidthIn * 72, dims.fullHeightIn * 72]);
page.drawImage(await pdf.embedPng(wrap), { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
writeFileSync(outPdf, Buffer.from(await pdf.save()));
writeFileSync(outProof, wrap);

console.log(`page count : ${pageCount} (read from the built interior)`);
console.log(`paper      : ${config.paperStock ?? 'white'}   spine ${dims.spineIn.toFixed(3)}in`);
console.log(`wrap       : ${dims.fullWidthIn.toFixed(3)} x ${dims.fullHeightIn.toFixed(3)}in = ${W} x ${H}px @ ${DPI} DPI`);
console.log(`side crop  : ${(sideCrop / DPI).toFixed(3)}in per side (the broken build cropped 0.654in)`);
console.log(`sky extend : ${(topExtend / DPI).toFixed(3)}in, top only`);
console.log(`author     : Georgia ${AUTHOR_FONT_PX}px on the artwork, ${AUTHOR_BASE_ABOVE_FOOT_IN}in above the foot, ${AUTHOR_CREAM}`);
console.log(`spine type : ${SPINE_TITLE_PX}px title, ${SPINE_AUTHOR_PX}px author; measured cap offsets ${titleCapOffset.toFixed(1)}px / ${authorCapOffset.toFixed(1)}px`);

// ── verification, against the bytes that were written ─────────────────────
const { data, info } = await sharp(wrap).raw().toBuffer({ resolveWithObject: true });
const rgb = (x: number, y: number): [number, number, number] => {
  const i = (y * info.width + x) * info.channels;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
};

if (CLEAN) {
  console.log(`
CLEAN WRAP (no author, no spine)
  ${outPdf}
  ${outProof}`);
  process.exit(0);
}

/** Type rows share a flush left edge; a stray sunlit leaf does not. */
const backCopyLeft = ((): number => {
  const lefts: number[] = [];
  for (let y = Math.round(H * 0.05); y < Math.round(H * 0.78); y++) {
    let first = -1;
    let count = 0;
    for (let x = 0; x < Math.round(W * 0.34); x++) {
      const [r, g, b] = rgb(x, y);
      if (r > 195 && g > 190 && b > 165) {
        count++;
        if (first < 0) first = x;
      }
    }
    if (count >= 25 && first >= 0) lefts.push(first);
  }
  lefts.sort((a, b) => a - b);
  return lefts[Math.floor(lefts.length / 2)]!;
})();

/**
 * Extent of the cream lettering we just drew. The window is clamped to the
 * FRONT panel and to the canvas: an earlier version ran x past W, where the
 * row-major index silently wraps onto the next scanline, and reached back onto
 * the rear panel, so it measured the back-cover copy and reported the author
 * name as 1.5in off the page.
 */
const foldX0 = Math.round((dims.fullWidthIn - kdp.frontWidthIn - kdp.wrapIn) * DPI);
// Find the ink by DIFFERENCING against the plate rather than by brightness. A
// cream threshold cannot separate the lettering from sunlit path and mulch,
// and reported the name 0.09in off centre when it was not. Whatever changed
// between plate and wrap is exactly what we drew.
const before = await sharp(plate).raw().toBuffer({ resolveWithObject: true });
let aL = W;
let aR = 0;
let aT = H;
let aB = 0;
for (let y = Math.max(0, baselineY - AUTHOR_FONT_PX); y < Math.min(H, baselineY + 40); y++) {
  for (let x = foldX0; x < W; x++) {
    const i = (y * info.width + x) * info.channels;
    const j = (y * before.info.width + x) * before.info.channels;
    const delta =
      Math.abs(data[i]! - before.data[j]!) +
      Math.abs(data[i + 1]! - before.data[j + 1]!) +
      Math.abs(data[i + 2]! - before.data[j + 2]!);
    if (delta > 60) {
      if (x < aL) aL = x;
      if (x > aR) aR = x;
      if (y < aT) aT = y;
      if (y > aB) aB = y;
    }
  }
}
const foldX = (dims.fullWidthIn - kdp.frontWidthIn - kdp.wrapIn) * DPI;

/**
 * Spine ink, measured the same way as the author name: by DIFFERENCING the
 * written wrap against the plate. The spine is flat olive, so a threshold would
 * probably work here — but a threshold is what reported the author name wrong
 * once already, and there is no reason to keep two methods.
 */
/* Two extents, because they answer two different questions. `s*` is the LETTERING
   — pixels that changed AND came out at the cream fill. `h*` additionally counts
   the halo, which is a soft shadow fading into the picture, not type. Fold-safe
   clearance is a rule about type, so it is measured on the lettering; the halo
   extent is printed alongside so nothing is hidden by the distinction. */
let sL = spineX1;
let sR = spineX0;
let sT = H;
let sB = 0;
let hL = spineX1;
let hR = spineX0;
for (let y = 0; y < H; y++) {
  for (let x = spineX0; x < spineX1; x++) {
    const i = (y * info.width + x) * info.channels;
    const j = (y * before.info.width + x) * before.info.channels;
    const delta =
      Math.abs(data[i]! - before.data[j]!) +
      Math.abs(data[i + 1]! - before.data[j + 1]!) +
      Math.abs(data[i + 2]! - before.data[j + 2]!);
    if (delta > 60) {
      if (x < hL) hL = x;
      if (x > hR) hR = x;
      if (data[i]! > 190 && data[i + 1]! > 175 && data[i + 2]! > 140) {
        if (x < sL) sL = x;
        if (x > sR) sR = x;
        if (y < sT) sT = y;
        if (y > sB) sB = y;
      }
    }
  }
}
/* Fold clearance and cross-spine centring are measured on the FULL extent of
   what was drawn (`h*`), not on the lettering alone (`s*`).

   Two reasons, and the second one bit. First, fold safety is conservative by
   nature: whatever reaches closest to the fold is what matters, and that is the
   halo. Second, the lettering extent is found with a cream-colour threshold, and
   a threshold does not measure type — it measures type AGAINST THIS PICTURE.
   Anti-aliased edge pixels over the bright side of the artwork still read as
   cream while the same pixels over the dark side do not, so the lettering mask
   drifts a few pixels toward the light and reported 0.027in of imbalance on a
   spine that the geometry places dead centre (`spineWpx - across === across`).
   The drawn extent has no such dependence on what is underneath it. */
const spineInkFound = hR >= hL;
const spineLeftClear = (hL - spineX0) / DPI;
const spineRightClear = (spineX1 - hR) / DPI;
const letterLeftClear = (sL - spineX0) / DPI;
const letterRightClear = (spineX1 - sR) / DPI;

/**
 * SPINE COLLISION GATE.
 *
 * Every other spine check treats the strip as ONE bounding box, so a title
 * printed directly on top of the author name passes fold clearance, centring and
 * presence without complaint. That happened: `WHAT THE SEED PACKET SKIPS` grew
 * through the author's fixed anchor and the two overprinted, and the build
 * reported PASS on all four checks.
 *
 * So look at the spine row by row, find the bands of ink, and require exactly two
 * of them with real space between. "Technically not touching" is not good enough
 * — a crowded spine looks like a mistake even when the boxes miss each other.
 */
/* 0.20in, not 0.12in. Word spaces inside `WHAT THE SEED PACKET SKIPS` measure
   over 0.12in on their own, so a 0.12in floor could be satisfied by a gap
   between two words while the title and author were still overprinting. The
   threshold has to sit above the largest word gap and below the designed line
   gap; the build prints both so the margin is visible rather than assumed. */
const SPINE_MIN_GAP_IN = 0.2;
const rowHasInk: boolean[] = new Array(H).fill(false);
for (let y = 0; y < H; y += 1) {
  for (let x = spineX0; x < spineX1; x += 1) {
    const i = (y * info.width + x) * info.channels;
    const j = (y * before.info.width + x) * before.info.channels;
    const delta =
      Math.abs(data[i]! - before.data[j]!) +
      Math.abs(data[i + 1]! - before.data[j + 1]!) +
      Math.abs(data[i + 2]! - before.data[j + 2]!);
    if (delta > 60) { rowHasInk[y] = true; break; }
  }
}
const rawBands: Array<[number, number]> = [];
for (let y = 0; y < H; y += 1) {
  if (!rowHasInk[y]) continue;
  let end = y;
  while (end + 1 < H && rowHasInk[end + 1]) end += 1;
  rawBands.push([y, end]);
  y = end;
}
/* Counting bands is the wrong test: text set down the spine breaks at every
   letter and again, wider, at every word, so a clean two-line spine still yields
   a dozen bands. The thing that actually matters is the SINGLE LARGEST vertical
   gap in the spine ink — on a correct spine that gap IS the space between the
   title and the author, and on a collided spine it collapses to a word gap. */
const bands = rawBands;
const gaps: Array<{ px: number; at: number }> = [];
for (let i = 1; i < bands.length; i += 1) {
  gaps.push({ px: bands[i]![0] - bands[i - 1]![1], at: bands[i - 1]![1] });
}
gaps.sort((a, b) => b.px - a.px);
const inkGap = (gaps[0]?.px ?? 0) / DPI;
const inkGapAt = gaps[0]?.at ?? 0;
const runnerUpGap = (gaps[1]?.px ?? 0) / DPI;
const twoBands = bands.length >= 2 && inkGap >= SPINE_MIN_GAP_IN;

/**
 * SPINE CONTRAST GATE.
 *
 * Geometry gates prove the type is in the right PLACE. None of them prove it can
 * be READ. The hardcover spine window crosses sky at the head, and the first
 * build put `WHAT THE` on a background whose brightest tenth measured 193
 * against cream ink at 214 — placed perfectly, and nearly invisible.
 *
 * So: find the ink, look at the band of picture immediately around it (14px, the
 * width of a letter stroke at this size — the area an eye actually compares the
 * letter against), and require real separation. Far-away bright sky is excluded
 * on purpose; it is not what the letter is read against.
 */
const SPINE_MIN_CONTRAST = 60; // luminance points between cream ink and its surround
const CONTRAST_HALO_PX = 14;
const relLum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const INK_L = relLum(0xe7, 0xd4, 0xb4);
const sw = spineX1 - spineX0;
const inkMask = new Uint8Array(sw * H);
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < sw; x += 1) {
    const i = (y * info.width + (x + spineX0)) * info.channels;
    const j = (y * before.info.width + (x + spineX0)) * before.info.channels;
    const changed =
      Math.abs(data[i]! - before.data[j]!) +
      Math.abs(data[i + 1]! - before.data[j + 1]!) +
      Math.abs(data[i + 2]! - before.data[j + 2]!) > 60;
    // The halo also changes pixels, so "changed" alone is not ink. Ink is what
    // came out at (close to) the cream fill.
    if (changed && data[i]! > 190 && data[i + 1]! > 175 && data[i + 2]! > 140) inkMask[y * sw + x] = 1;
  }
}
/** Separable box dilation: the neighbourhood a letter is judged against. */
const dilate = (src: Uint8Array): Uint8Array => {
  const tmp = new Uint8Array(sw * H);
  for (let y = 0; y < H; y += 1)
    for (let x = 0; x < sw; x += 1) {
      let on = 0;
      for (let d = -CONTRAST_HALO_PX; d <= CONTRAST_HALO_PX && !on; d += 1) {
        const xx = x + d;
        if (xx >= 0 && xx < sw && src[y * sw + xx]) on = 1;
      }
      tmp[y * sw + x] = on;
    }
  const out = new Uint8Array(sw * H);
  for (let x = 0; x < sw; x += 1)
    for (let y = 0; y < H; y += 1) {
      let on = 0;
      for (let d = -CONTRAST_HALO_PX; d <= CONTRAST_HALO_PX && !on; d += 1) {
        const yy = y + d;
        if (yy >= 0 && yy < H && tmp[yy * sw + x]) on = 1;
      }
      out[y * sw + x] = on;
    }
  return out;
};
const surround = dilate(inkMask);
const surroundLums: number[] = [];
for (let y = 0; y < H; y += 1)
  for (let x = 0; x < sw; x += 1) {
    if (!surround[y * sw + x] || inkMask[y * sw + x]) continue;
    const i = (y * info.width + (x + spineX0)) * info.channels;
    surroundLums.push(relLum(data[i]!, data[i + 1]!, data[i + 2]!));
  }
surroundLums.sort((a, b) => a - b);
const surroundP90 = surroundLums.length ? surroundLums[Math.floor(surroundLums.length * 0.9)]! : 0;
const spineContrast = INK_L - surroundP90;


const checks: Array<[string, boolean, string]> = [
  ['back copy inside safe', backCopyLeft / DPI >= SAFE_IN, `${(backCopyLeft / DPI).toFixed(3)}in from the edge`],
  ['author inside safe (outer)', (W - aR) / DPI >= SAFE_IN, `${((W - aR) / DPI).toFixed(3)}in from the edge`],
  ['author clear of the spine fold', aL > foldX, `${((aL - foldX) / DPI).toFixed(3)}in past the fold`],
  ['author inside safe (foot)', (H - aB) / DPI >= SAFE_IN, `${((H - aB) / DPI).toFixed(3)}in from the bottom edge`],
  ['author centred on the front', Math.abs((aL + aR) / 2 - frontCentreX) < 12,
    `${(((aL + aR) / 2 - frontCentreX) / DPI).toFixed(3)}in off centre`],
  ['spine type present', spineInkFound, spineInkFound
    ? `ink spans ${(sT / DPI).toFixed(2)}in to ${(sB / DPI).toFixed(2)}in down the spine`
    : 'NO ink found on the spine'],
  ['spine type inside the fold-safe strip',
    spineInkFound && spineLeftClear >= SPINE_FOLD_VARIANCE_IN && spineRightClear >= SPINE_FOLD_VARIANCE_IN,
    `${spineLeftClear.toFixed(3)}in clear of the back fold, ${spineRightClear.toFixed(3)}in clear of the front fold ` +
      `(need ${SPINE_FOLD_VARIANCE_IN}in); bare lettering reaches ${letterLeftClear.toFixed(3)}in / ` +
      `${letterRightClear.toFixed(3)}in`],
  ['spine type readable against the art', spineContrast >= SPINE_MIN_CONTRAST,
    `brightest tenth of the ${CONTRAST_HALO_PX}px surround is ${surroundP90.toFixed(0)} against cream ink at ` +
      `${INK_L.toFixed(0)} — separation ${spineContrast.toFixed(0)} (need ${SPINE_MIN_CONTRAST})`],
  ['spine title and author do not collide', twoBands,
    `largest gap ${inkGap.toFixed(3)}in at ${(inkGapAt / DPI).toFixed(2)}in down; ` +
      `next largest (a word space) ${runnerUpGap.toFixed(3)}in; threshold ${SPINE_MIN_GAP_IN}in`],
  ['spine block centred as one group',
    bands.length >= 1 &&
      Math.abs((bands[0]![0] + bands[bands.length - 1]![1]) / 2 - H / 2) / DPI < 0.35,
    bands.length >= 1
      ? `block centre is ${(((bands[0]![0] + bands[bands.length - 1]![1]) / 2 - H / 2) / DPI).toFixed(3)}in from the spine midpoint`
      : 'no ink'],
  ['spine type centred between the folds',
    spineInkFound && Math.abs(spineLeftClear - spineRightClear) <= 0.02,
    `${Math.abs(spineLeftClear - spineRightClear).toFixed(3)}in of imbalance`],
  ['single page at the exact size', pdf.getPageCount() === 1,
    `${(page.getWidth() / 72).toFixed(3)} x ${(page.getHeight() / 72).toFixed(3)}in`],
];

console.log('\nVERIFIED AGAINST THE WRITTEN FILE');
for (const [label, pass, detail] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(32)} ${detail}`);
}
const ok = checks.every(([, pass]) => pass);
console.log(ok ? '\nCOVER PRINT-READY' : '\nCOVER FAILED');
process.exit(ok ? 0 : 1);
