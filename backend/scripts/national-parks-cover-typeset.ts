/*
 * HISTORICAL — DO NOT USE FOR NEW BOOKS.
 *
 * This built the shipped 7 NATIONAL PARKS cover typography. It is kept so that artifact can be reproduced, and
 * for no other reason. It is NOT the platform entry point and it is not a
 * template for anything new.
 *
 * NEW COVER PRODUCTION USES THE CANONICAL COMPOSITOR:
 *
 *   tsx scripts/qa/build-cover.ts --interior final.pdf --art approved.png \
 *       --binding paperback --ink bw --paper white --trim 6x9 \
 *       --title "..." --author "..." --out cover.pdf --proof proof.png
 *
 * That command reads the page count from the interior, takes its geometry
 * from the published KDP specification or a verified calculator reading,
 * validates effective resolution and the barcode reserve, and writes a
 * manifest pairing the cover to the interior it was built from. This file
 * does none of that. See docs/COVERS-AND-SPINES.md.
 *
 * Frozen deliberately: rewriting a script whose only job is to reproduce a
 * shipped book risks changing that book for no benefit.
 */
/**
 * COMPOSE THE PAPERBACK WRAP FROM A CLEAN PLATE, SETTING EVERY WORD IN CODE.
 *
 * The previous wrap had the image model paint the title, subtitle, back copy and
 * author name. That produced three defects that instruction could not fix, the
 * serious one being copy running 0.818in into KDP's barcode reserve — the
 * barcode prints over the artwork, so the last lines of the bio would have had a
 * barcode on top of them.
 *
 * Here the artwork carries no lettering at all and every string is SET, against
 * boxes measured from the wrap geometry. The back copy's band stops at the
 * barcode reserve, so the copy cannot reach it: the size is solved against the
 * box rather than checked afterwards.
 *
 * PAGE COUNT IS READ FROM THE BUILT INTERIOR, never typed in. The spine width is
 * the one number that, if wrong, wastes a whole print run.
 *
 *   npx tsx scripts/national-parks-cover-typeset.ts <cleanArtPng> <interiorPdf> <outPdf>
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { planSpineType } from '../src/pipeline/publishing-standard/spine-type.js';
import { PAGE_THICKNESS_IN } from '../src/pipeline/publishing-standard/cover-dimensions.js';
import {
  COPY_CREAM,
  COPY_FONT,
  COPY_HALO,
  planCopyColumn,
  type CopyBlockSpec,
} from '../src/pipeline/publishing-standard/cover-copy-column.js';

const ART = process.argv[2];
const INTERIOR = process.argv[3];
const OUT = process.argv[4];
if (!ART || !INTERIOR || !OUT) {
  throw new Error('usage: national-parks-cover-typeset.ts <cleanArtPng> <interiorPdf> <outPdf>');
}

const DPI = 300;
const TRIM_W = 6;
const TRIM_H = 9;
const BLEED = 0.125;
const THICKNESS_WHITE_BW = PAGE_THICKNESS_IN.white;
const BARCODE_H = 1.2;
const BARCODE_CLEAR = 0.25;
/** Type never comes closer than this to a trim edge. */
const LIVE_MARGIN = 0.5;
const TARGET_CLEAR_IN = 0.075;

const inPx = (n: number): number => Math.round(n * DPI);
const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Geometry, from the interior itself ─────────────────────────────────────
const pageCount = (await PDFDocument.load(readFileSync(INTERIOR))).getPageCount();
const spineIn = pageCount * THICKNESS_WHITE_BW;
const fullWidthIn = BLEED + TRIM_W + spineIn + TRIM_W + BLEED;
const fullHeightIn = BLEED + TRIM_H + BLEED;
const W = Math.round(fullWidthIn * DPI);
const H = Math.round(fullHeightIn * DPI);

const backLeftIn = BLEED;
const backRightIn = BLEED + TRIM_W;
const frontLeftIn = BLEED + TRIM_W + spineIn;
const frontRightIn = frontLeftIn + TRIM_W;
const barcodeTopIn = fullHeightIn - (BLEED + BARCODE_H + BARCODE_CLEAR);

console.log(`interior   : ${INTERIOR}`);
console.log(`page count : ${pageCount} (read from the PDF)`);
console.log(`spine      : ${pageCount} x ${THICKNESS_WHITE_BW} = ${spineIn.toFixed(6)} in`);
console.log(`wrap       : ${fullWidthIn.toFixed(6)} x ${fullHeightIn.toFixed(6)} in = ${W} x ${H} px @ ${DPI} DPI`);
console.log(`barcode    : reserve begins ${barcodeTopIn.toFixed(3)}in down; no type may pass it`);

// ── Fit the clean plate ────────────────────────────────────────────────────
/**
 * Scale to fill the HEIGHT exactly and crop the width evenly.
 *
 * The gentle-scale-and-stretch-the-sky workaround the painted wrap needed exists
 * only because the model put copy too near the edge and an honest crop sliced
 * it. A clean plate has nothing croppable on it, so the straightforward fit is
 * back: no stretching, no smeared sky, no distortion anywhere.
 */
const native = await sharp(ART).metadata();
const scale = H / native.height!;
const scaledW = Math.round(native.width! * scale);
const sideCrop = Math.round((scaledW - W) / 2);
if (sideCrop < 0) throw new Error(`art too narrow: ${scaledW}px against a ${W}px wrap`);
console.log(`art        : ${native.width} x ${native.height} px`);
console.log(`fit        : x${scale.toFixed(4)} -> ${scaledW} x ${H}px, cropping ${sideCrop}px (${(sideCrop / DPI).toFixed(3)}in) per side, retaining ${((W / scaledW) * 100).toFixed(1)}%`);

let wrap = await sharp(ART)
  .resize(scaledW, H, { kernel: 'lanczos3' })
  .extract({ left: sideCrop, top: 0, width: W, height: H })
  .png()
  .toBuffer();

// ── The copy ───────────────────────────────────────────────────────────────
const PARKS = ['Yellowstone', 'Grand Canyon', 'Yosemite', 'Zion', 'Great Smoky Mountains', 'Rocky Mountain', 'Acadia'];
const TITLE_LINES = ['7 NATIONAL', 'PARKS', 'WITHOUT THE', 'ROOKIE MISTAKES'];
const SUBTITLE_LINES = ["What's Worth Your Time, What to Skip,", 'and What I Learned the Hard Way'];
const AUTHOR = 'Tom Everett';

const BACK_BLOCKS: CopyBlockSpec[] = [
  {
    kind: 'para',
    text:
      'You saved a year for this trip. Do not spend the first morning of it in the wrong line. ' +
      'Every park in this book is quiet, cool and yours for about two hours after first light, ' +
      'and then several thousand people arrive. This is a first-timer’s guide to the seven parks ' +
      'most Americans actually visit, not a seven-hundred-page survey of all sixty-three.',
  },
  { kind: 'para', italic: true, text: `Featured parks: ${PARKS.join(' · ')}` },
  { kind: 'heading', text: 'INSIDE THIS VOLUME' },
  { kind: 'bullet', text: 'A verdict up front for every park, before any supporting detail' },
  { kind: 'bullet', text: 'Skip It / Do This Instead: the famous thing that is not worth it, and the better one half a mile away' },
  { kind: 'bullet', text: 'Three honest ways to spend a day, including one with no hiking at all' },
  { kind: 'bullet', text: 'A plan for the days you arrive at noon with half the day already gone' },
  { kind: 'bullet', text: 'Permits, timed entry and release dates, collected and dated at the back' },
  {
    kind: 'para',
    text:
      'Tom Everett drove to Zion at twenty-seven with no plan, got turned back at the canyon mouth, ' +
      'and learned at the junction that the permit he needed had been drawn months earlier. ' +
      'The afternoon he salvaged is still one of the best of his life. He has never stopped being ' +
      'annoyed about the day he wasted getting to it.',
  },
];

/**
 * OPTIONAL: a soft scrim under the back-panel copy.
 *
 * The clean plate carries a bright sunset band straight through the middle of
 * the back panel, and cream type with a halo goes weak crossing it. A halo
 * rescues a word; it cannot rescue eight lines running over a sunlit horizon.
 *
 * This is NOT the solid panel the operator rejected. It is a gradient that is
 * strongest at the top-left, where the copy is densest, and fades to nothing
 * before the panel edge, so the photograph stays visible everywhere and there is
 * no rectangle with a border. Off by default; `--scrim` turns it on.
 */
const SCRIM = process.argv.includes('--scrim');
if (SCRIM) {
  const x0 = inPx(backLeftIn);
  const x1 = inPx(backRightIn);
  const scrimSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="s" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#07100c" stop-opacity="0.62"/>
        <stop offset="0.55" stop-color="#07100c" stop-opacity="0.48"/>
        <stop offset="0.86" stop-color="#07100c" stop-opacity="0.20"/>
        <!-- Zero at the panel edge. Ending on 14% left a visible tonal step
             against the untouched spine, which reads as a rectangle even when
             the rectangle has no border. -->
        <stop offset="1" stop-color="#07100c" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="1"/>
        <stop offset="0.82" stop-color="#fff" stop-opacity="1"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <mask id="m"><rect x="${x0}" y="0" width="${x1 - x0}" height="${H}" fill="url(#v)"/></mask>
    </defs>
    <rect x="${x0}" y="0" width="${x1 - x0}" height="${H}" fill="url(#s)" mask="url(#m)"/>
  </svg>`;
  wrap = await sharp(wrap).composite([{ input: Buffer.from(scrimSvg), left: 0, top: 0 }]).png().toBuffer();
  console.log('scrim      : on — graded 62% at the outer edge to 0% at the spine, fading out at the foot');
}

// ── Back panel: the copy column, boxed off the barcode ─────────────────────
const backCopy = await planCopyColumn({
  blocks: BACK_BLOCKS,
  columnLeftPx: inPx(backLeftIn + LIVE_MARGIN),
  columnRightPx: inPx(backRightIn - LIVE_MARGIN),
  bandTopPx: inPx(BLEED + 0.55),
  /** The band STOPS at the reserve. This is why the copy cannot reach the barcode. */
  bandBottomPx: inPx(barcodeTopIn - 0.1),
  wrapWidthPx: W,
  wrapHeightPx: H,
  /**
   * The ceiling is generous on purpose. The search takes the LARGEST size that
   * fits the band, so a tight ceiling silently becomes the answer: at 0.145in
   * the copy set at 10.6pt and left 2.4in of the panel empty beneath it, which
   * reads as a mistake rather than as space.
   */
  maxSizePx: Math.round(0.2 * DPI),
  minSizePx: Math.round(0.075 * DPI),
});
console.log(`
back copy  : ${backCopy.sizePx}px (${((backCopy.sizePx / DPI) * 72).toFixed(1)}pt), ${backCopy.lineCount} lines`);
console.log(`           : column ${(backCopy.measurePx / DPI).toFixed(3)}in, widest drawn ${(backCopy.widestLinePx / DPI).toFixed(3)}in`);
console.log(`           : block ${(backCopy.blockTopPx / DPI).toFixed(3)}-${(backCopy.blockBottomPx / DPI).toFixed(3)}in, ${(backCopy.slackPx / DPI).toFixed(3)}in slack at the foot`);

{
  const botIn = backCopy.blockBottomPx / DPI;
  if (botIn > barcodeTopIn) throw new Error(`back copy reaches ${botIn.toFixed(3)}in, into the barcode reserve at ${barcodeTopIn.toFixed(3)}in`);
  console.log(`           : clears the barcode reserve by ${(barcodeTopIn - botIn).toFixed(3)}in`);
}
wrap = await sharp(wrap).composite([{ input: Buffer.from(backCopy.svg), left: 0, top: 0 }]).png().toBuffer();

// ── Front panel: title, subtitle, park list, author ────────────────────────
/**
 * A centred display block, set to the largest size whose longest line still
 * clears the live margin. Measured the same way the copy column is: the widest
 * line is rendered and its real ink taken, so a halo and its antialiasing are
 * inside the number rather than outside it.
 */
async function planCentredBlock(opts: {
  lines: string[];
  centreIn: number;
  maxWidthIn: number;
  topIn: number;
  sizeIn: number;
  leadRatio: number;
  bold: boolean;
  italic?: boolean;
  trackRatio?: number;
  fill?: string;
}): Promise<{ svg: string; sizePx: number; widestIn: number; topIn: number; bottomIn: number }> {
  const maxWidthPx = inPx(opts.maxWidthIn);
  let sizePx = inPx(opts.sizeIn);
  for (; sizePx > 8; sizePx -= 1) {
    const track = (opts.trackRatio ?? 0) * sizePx;
    const widths = await Promise.all(
      opts.lines.map(async (l) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxWidthPx * 4}" height="${sizePx * 4}">
          <text x="${maxWidthPx * 2}" y="${sizePx * 2.5}" text-anchor="middle" font-family="${COPY_FONT}"
            font-size="${sizePx}" font-weight="${opts.bold ? 700 : 400}"
            ${opts.italic ? 'font-style="italic"' : ''} letter-spacing="${track.toFixed(2)}"
            fill="#fff">${escapeXml(l)}</text></svg>`;
        const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
        return info.width;
      }),
    );
    if (Math.max(...widths) <= maxWidthPx) {
      const leadPx = sizePx * opts.leadRatio;
      const body = opts.lines
        .map(
          (l, i) =>
            `<text x="${inPx(opts.centreIn)}" y="${(inPx(opts.topIn) + leadPx * (i + 1)).toFixed(1)}" text-anchor="middle" ` +
            `font-family="${COPY_FONT}" font-size="${sizePx}" font-weight="${opts.bold ? 700 : 400}" ` +
            `${opts.italic ? 'font-style="italic"' : ''} letter-spacing="${track.toFixed(2)}" ` +
            `fill="${opts.fill ?? COPY_CREAM}" stroke="${COPY_HALO}" stroke-width="${(sizePx * 0.15).toFixed(2)}" ` +
            `stroke-linejoin="round" paint-order="stroke">${escapeXml(l)}</text>`,
        )
        .join('\n');
      return {
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${body}</svg>`,
        sizePx,
        widestIn: Math.max(...widths) / DPI,
        topIn: opts.topIn,
        bottomIn: opts.topIn + (leadPx * opts.lines.length) / DPI,
      };
    }
  }
  throw new Error('centred block will not fit its measure');
}

const frontCentreIn = frontLeftIn + TRIM_W / 2;
const frontMaxWidthIn = TRIM_W - LIVE_MARGIN * 2;

const title = await planCentredBlock({
  lines: TITLE_LINES,
  centreIn: frontCentreIn,
  maxWidthIn: frontMaxWidthIn,
  topIn: 0.95,
  sizeIn: 0.62,
  leadRatio: 1.08,
  bold: true,
  trackRatio: 0.01,
});
console.log(`
title      : ${title.sizePx}px (${((title.sizePx / DPI) * 72).toFixed(1)}pt), widest ${title.widestIn.toFixed(3)}in of ${frontMaxWidthIn}in`);
console.log(`           : ${title.topIn.toFixed(3)}-${title.bottomIn.toFixed(3)}in`);

const subtitle = await planCentredBlock({
  lines: SUBTITLE_LINES,
  centreIn: frontCentreIn,
  maxWidthIn: frontMaxWidthIn - 0.4,
  topIn: title.bottomIn + 0.18,
  sizeIn: 0.235,
  leadRatio: 1.3,
  bold: false,
  italic: true,
  fill: '#EBD9A8',
});
console.log(`subtitle   : ${subtitle.sizePx}px (${((subtitle.sizePx / DPI) * 72).toFixed(1)}pt), ${subtitle.topIn.toFixed(3)}-${subtitle.bottomIn.toFixed(3)}in`);

const frontParks = await planCentredBlock({
  lines: [PARKS.slice(0, 3).join(' · '), PARKS.slice(3).join(' · ')],
  centreIn: frontCentreIn,
  maxWidthIn: frontMaxWidthIn,
  topIn: subtitle.bottomIn + 0.16,
  sizeIn: 0.18,
  leadRatio: 1.3,
  bold: false,
});
console.log(`front parks: ${frontParks.sizePx}px (${((frontParks.sizePx / DPI) * 72).toFixed(1)}pt), ${frontParks.topIn.toFixed(3)}-${frontParks.bottomIn.toFixed(3)}in`);

const author = await planCentredBlock({
  lines: [AUTHOR],
  centreIn: frontCentreIn,
  maxWidthIn: frontMaxWidthIn - 1.2,
  topIn: TRIM_H + BLEED - 1.15,
  sizeIn: 0.42,
  leadRatio: 1.0,
  bold: true,
});
console.log(`author     : ${author.sizePx}px (${((author.sizePx / DPI) * 72).toFixed(1)}pt), ${author.topIn.toFixed(3)}-${author.bottomIn.toFixed(3)}in`);

for (const blk of [title, subtitle, frontParks, author]) {
  if (blk.bottomIn > fullHeightIn - BLEED - LIVE_MARGIN + 0.15) {
    throw new Error(`front block reaches ${blk.bottomIn.toFixed(3)}in, past the live area`);
  }
  wrap = await sharp(wrap).composite([{ input: Buffer.from(blk.svg), left: 0, top: 0 }]).png().toBuffer();
}

// ── Spine ──────────────────────────────────────────────────────────────────
/** Type stops a quarter inch short of head and foot; the wrap is taller by the bleed. */
const SPINE_SAFE_LEN_IN = TRIM_H - 0.5;
const SPINE_GAP_IN = 0.5;
const FOLD_VARIANCE_IN = 0.0625;
const spineWpx = Math.round(spineIn * DPI);
const safeStripPx = Math.round((spineIn - 2 * FOLD_VARIANCE_IN) * DPI);

const spine = await planSpineType({
  title: '7 National Parks Without the Rookie Mistakes',
  author: AUTHOR,
  wrapHeightPx: H,
  spineWidthPx: spineWpx,
  foldSafeWidthPx: safeStripPx,
  safeLengthPx: Math.round(SPINE_SAFE_LEN_IN * DPI),
  gapPx: Math.round(SPINE_GAP_IN * DPI),
  targetClearPx: Math.round(TARGET_CLEAR_IN * DPI),
});
console.log(`
spine strip: ${spineWpx}px wide, fold-safe ${safeStripPx}px`);
console.log(`spine type : title ${spine.titlePx}px (cap ${spine.titleCapPx}px), author ${spine.authorPx}px`);
console.log(`           : WORST measured clearance ${(spine.measuredClearPerSidePx / DPI).toFixed(4)}in ` +
  `(KDP floor ${FOLD_VARIANCE_IN}, house target ${TARGET_CLEAR_IN})`);
if (spine.measuredClearPerSidePx / DPI < FOLD_VARIANCE_IN) {
  throw new Error(`spine type clears the fold by only ${(spine.measuredClearPerSidePx / DPI).toFixed(4)}in`);
}
wrap = await sharp(wrap)
  .composite([{ input: Buffer.from(spine.svg), left: inPx(backRightIn), top: 0 }])
  .png()
  .toBuffer();

// ── Out ────────────────────────────────────────────────────────────────────
const wrapPng = OUT.replace(/\.pdf$/i, '-wrap.png');
writeFileSync(wrapPng, wrap);

const jpeg = await sharp(wrap).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
const doc = await PDFDocument.create();
const page = doc.addPage([fullWidthIn * 72, fullHeightIn * 72]);
const img = await doc.embedJpg(jpeg);
page.drawImage(img, { x: 0, y: 0, width: fullWidthIn * 72, height: fullHeightIn * 72 });
const bytes = await doc.save();
writeFileSync(OUT, bytes);

const proof = OUT.replace(/\.pdf$/i, '-proof.png');
await sharp(wrap).resize({ width: 1600 }).png().toFile(proof);

console.log(`
wrap png   : ${wrapPng}`);
console.log(`file       : ${OUT}`);
console.log(`bytes      : ${bytes.length}`);
console.log(`sha256     : ${createHash('sha256').update(bytes).digest('hex')}`);
console.log(`proof      : ${proof}`);
process.exit(0);
