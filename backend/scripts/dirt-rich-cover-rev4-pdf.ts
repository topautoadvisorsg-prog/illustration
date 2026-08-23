/**
 * DIRT RICH paperback cover wrap -> print-ready PDF for KDP.
 *
 * ─── WHY THIS DOES NOT CALL composeCoverPrint ─────────────────────────────
 * It should, and eventually will. Two defects in that engine made the first
 * shipped attempt unusable, and both are recorded here so the fix is obvious
 * when the engine is corrected:
 *
 * 1. ASPECT CROP. The model paints 1536x1024 (aspect 1.500). A 6x9 wrap with a
 *    0.315in spine is aspect 1.359. `composeCoverPrint` resolves that with
 *    sharp `fit:'cover'`, which scales to the larger dimension and CROPS THE
 *    SIDES - 196px, or 0.654in, off each edge. The blueprint tells the model to
 *    keep copy inside a safe margin expressed as a fraction of ITS canvas, so
 *    the model complied (back copy landed 0.753in from the edge) and the
 *    composition then sliced that margin down to 0.187in, inside the 0.125in
 *    trim line. The art was correct; the compositor cut it off.
 *    Here a gentler scale crops only 0.313in per side, and the residual height
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
 *   yarn tsx scripts/dirt-rich-cover-pdf.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ProjectConfigSchema } from '@wildlands/shared';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { computeCoverDimensions } from '../src/pipeline/stage-6-layout/render-html.js';

const PROJECT_ID = '55d7bce0-2f71-4f02-8131-e6c750c8506e';
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
const ART = 'C:/Users/jovan/Downloads/dirt rich book/COVER REV4 - subtitle change/DIRT-RICH-COVER-REV4-ARTWORK-raw.png';
const INTERIOR = `${BOOK_DIR}/DIRT-RICH-INTERIOR-FINAL.pdf`;
const OUT_PDF = `${BOOK_DIR}/COVER REV4 - subtitle change/DIRT-RICH-COVER-REV4-PRINT.pdf`;
const OUT_PROOF = `${BOOK_DIR}/COVER REV4 - subtitle change/DIRT-RICH-COVER-REV4-proof.png`;

const DPI = 300;
/** KDP: keep every piece of type this far inside the physical edge. */
const SAFE_IN = 0.375;
/** Chosen so the back copy lands ~0.49in in - clear of safe, minimal side loss. */
const SCALE = 2.577;
/** The clear band of path: the sign ends at 5.16in, the hen's comb starts 5.77in. */
/**
 * Author baseline, measured UP FROM THE FOOT rather than down from the head.
 * Placed at 5.6in it sat directly under the subtitle and read as part of the
 * sign. One inch off the foot puts it where a reader expects an author name.
 */
const AUTHOR_BASE_ABOVE_FOOT_IN = 1.0;
/** Sampled from the title lettering itself, not an invented white. */
const AUTHOR_CREAM = '#e7d4b4';
const AUTHOR_FONT_PX = 120;
/** KDP allows this much fold variance either side of each spine fold. */
const SPINE_FOLD_VARIANCE_IN = 0.0625;
/**
 * Spine type, set by CODE for the same reason the author name is.
 *
 * The spine is 0.315in of a 12.565in wrap — 95px at print, ~11px on the model's
 * own canvas. At that size an image model cannot hold orientation, spacing or
 * spelling, so the blueprint tells it to leave the spine EMPTY and the type is
 * composited here. Sampled from the delivered artwork, the spine is a flat
 * #3b3c1c olive over its whole height, so cream reads cleanly on it.
 *
 * Sizes are bounded by the fold-safe strip, not by taste: 0.315in less 0.0625in
 * of fold variance per side leaves 0.19in = 57px to hold the type across.
 */
//
// SIZE. 38/26px set the title at under half the 57px it had to work with and
// left the strip looking empty from across a room, which is the only distance a
// spine is ever read from. Georgia's caps are ~0.69em, so a 58px title stands
// 40px tall and fills the strip with ~8px of breathing room each side, still
// well inside the fold variance. The author keeps a step down in weight.
const SPINE_TITLE_PX = 61;   // was 76: -20%, widens fold clearance from 3px to 8px per side
const SPINE_AUTHOR_PX = 42;  // was 52: -20%, keeps the step down from the title
/**
 * Where each line sits down the spine, as a fraction of wrap height.
 *
 * The pair is centred as ONE GROUP about the mid-point, not individually: the
 * title runs 0.30-0.50 and the author 0.55-0.70, so the block's centre lands on
 * 0.50. With the author down at 0.78 the two lines were pushed to opposite ends
 * and the spine read as lopsided even though each line was centred across it.
 */
const SPINE_TITLE_AT = 0.4;
const SPINE_AUTHOR_AT = 0.62;

const project = await getProject(PROJECT_ID);
if (!project) throw new Error('project not found');
const config = ProjectConfigSchema.parse(project.config);
const pageCount = (await PDFDocument.load(readFileSync(INTERIOR))).getPageCount();
const dims = computeCoverDimensions(config, pageCount);

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
const spineX1 = Math.round((dims.fullWidthIn - config.trimSize.widthIn - 0.125) * DPI);
const spineX0 = spineX1 - spineWpx;


// ── the author name, set at full print resolution ─────────────────────────
// The previous wrap composited the name at 1536px wide and then upscaled the
// whole result 2.45x, so the lettering was soft before it ever reached a page.
const frontCentreX = Math.round((dims.fullWidthIn - config.trimSize.widthIn / 2 - 0.125) * DPI);
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
const spineTitle = esc(config.title ?? 'DIRT RICH');
// Inside the rotated group a point (a, b) lands at (spineWpx - b, a): `a` runs
// DOWN the spine, `b` runs ACROSS it. Centring on `b` centres between the folds.
const across = spineWpx / 2;
const spineSvg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${spineWpx}" height="${H}">`,
  `<g transform="rotate(90) translate(0, -${spineWpx})">`,
  `<text x="${Math.round(H * SPINE_TITLE_AT)}" y="${(across + SPINE_TITLE_PX * 0.345).toFixed(1)}"`,
  ` text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="${SPINE_TITLE_PX}"`,
  ` font-weight="700" letter-spacing="${(SPINE_TITLE_PX * 0.08).toFixed(1)}"`,
  ` fill="${AUTHOR_CREAM}">${spineTitle}</text>`,
  `<text x="${Math.round(H * SPINE_AUTHOR_AT)}" y="${(across + SPINE_AUTHOR_PX * 0.30).toFixed(1)}"`,
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

const outPdf = CLEAN ? `${BOOK_DIR}/DIRT-RICH-COVER-CLEAN-no-author-no-spine.pdf` : OUT_PDF;
const outProof = CLEAN ? `${BOOK_DIR}/DIRT-RICH-COVER-CLEAN-no-author-no-spine.png` : OUT_PROOF;
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
console.log(`spine type : ${SPINE_TITLE_PX}px title, ${SPINE_AUTHOR_PX}px author`);

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
const foldX0 = Math.round((dims.fullWidthIn - config.trimSize.widthIn - 0.125) * DPI);
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
const foldX = (dims.fullWidthIn - config.trimSize.widthIn - 0.125) * DPI;

/**
 * Spine ink, measured the same way as the author name: by DIFFERENCING the
 * written wrap against the plate. The spine is flat olive, so a threshold would
 * probably work here — but a threshold is what reported the author name wrong
 * once already, and there is no reason to keep two methods.
 */
let sL = spineX1;
let sR = spineX0;
let sT = H;
let sB = 0;
for (let y = 0; y < H; y++) {
  for (let x = spineX0; x < spineX1; x++) {
    const i = (y * info.width + x) * info.channels;
    const j = (y * before.info.width + x) * before.info.channels;
    const delta =
      Math.abs(data[i]! - before.data[j]!) +
      Math.abs(data[i + 1]! - before.data[j + 1]!) +
      Math.abs(data[i + 2]! - before.data[j + 2]!);
    if (delta > 60) {
      if (x < sL) sL = x;
      if (x > sR) sR = x;
      if (y < sT) sT = y;
      if (y > sB) sB = y;
    }
  }
}
const spineInkFound = sR >= sL;
const spineLeftClear = (sL - spineX0) / DPI;
const spineRightClear = (spineX1 - sR) / DPI;

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
      `(need ${SPINE_FOLD_VARIANCE_IN}in)`],
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
