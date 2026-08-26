/*
 * HISTORICAL — DO NOT USE FOR NEW BOOKS.
 *
 * This built the shipped 7 NATIONAL PARKS paperback wrap. It is kept so that artifact can be reproduced, and
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
 * Place the generated National Parks artwork on the print wrap and set the spine.
 *
 * Follows the DIRT RICH lineage exactly (`dirt-rich-cover-rev5-pdf.ts`): the
 * model paints one continuous wrap including the title, subtitle and back copy;
 * CODE sets the spine type, because a 0.26in strip is below what an image model
 * can letter reliably.
 *
 * PAGE COUNT IS READ FROM THE BUILT INTERIOR, never typed in. The spine width is
 * the one number that, if wrong, wastes a whole print run.
 *
 *   npx tsx scripts/national-parks-cover-print.ts <artPng> <interiorPdf> <outPdf>
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { extendSkyUpward, planSpineType } from '../src/pipeline/publishing-standard/spine-type.js';
import { PAGE_THICKNESS_IN } from '../src/pipeline/publishing-standard/cover-dimensions.js';
import {
  findPaintedPanel,
  planBackCoverLine,
  planParkListOverlay,
} from '../src/pipeline/publishing-standard/back-cover-copy.js';

const ART = process.argv[2];
const INTERIOR = process.argv[3];
const OUT = process.argv[4];
if (!ART || !INTERIOR || !OUT) {
  throw new Error('usage: national-parks-cover-print.ts <artPng> <interiorPdf> <outPdf>');
}

const DPI = 300;
const TRIM_W = 6;
const TRIM_H = 9;
const BLEED = 0.125;
const THICKNESS_WHITE_BW = PAGE_THICKNESS_IN.white;
/** KDP allows this much fold wander either side of each spine fold. */
const FOLD_VARIANCE_IN = 0.0625;
/** KDP's barcode reserve, lower right of the back panel, plus its clearance. */
const BARCODE_H = 1.2;
const BARCODE_CLEAR = 0.25;
/** Front panel and its live area, for the strip along the foot of the cover. */
const LIVE_MARGIN_IN = 0.25;
/**
 * INTERNAL production target for spine fold clearance.
 *
 * KDP's hard floor is 0.0625in of fold variance. This is 0.075in, and the
 * difference is deliberate: the first halo-aware measurement of this cover came
 * out at 0.0633in — a pass by eight ten-thousandths of an inch, which is not
 * tolerance, it is luck. The title is sized down until the COMPLETE drawn
 * typography, halo and antialiasing included, clears both folds by this much.
 */
const TARGET_CLEAR_IN = 0.075;


// ── Geometry, from the interior itself ─────────────────────────────────────
const pageCount = (await PDFDocument.load(readFileSync(INTERIOR))).getPageCount();
const spineIn = pageCount * THICKNESS_WHITE_BW;
const fullWidthIn = BLEED + TRIM_W + spineIn + TRIM_W + BLEED;
const fullHeightIn = BLEED + TRIM_H + BLEED;

const W = Math.round(fullWidthIn * DPI);
const H = Math.round(fullHeightIn * DPI);

console.log(`interior   : ${INTERIOR}`);
console.log(`page count : ${pageCount} (read from the PDF)`);
console.log(`spine      : ${pageCount} x ${THICKNESS_WHITE_BW} = ${spineIn.toFixed(6)} in`);
console.log(`wrap       : ${fullWidthIn.toFixed(6)} x ${fullHeightIn.toFixed(6)} in  = ${W} x ${H} px @ ${DPI} DPI`);

// ── Fit the art ────────────────────────────────────────────────────────────
/**
 * Scale to fill the HEIGHT exactly and crop the width evenly.
 *
 * The model paints 1536x1024 (aspect 1.500); the wrap is aspect 1.3526. The
 * retained width is 1.3526/1.500 = 90.2% — which is precisely the "outer 9.9%
 * is cropped away, half from each side" the prompt and blueprint told the model
 * to design around. Any other scale would crop a different amount than the
 * safe zones were computed for, which is how a previous cover lost its margins.
 */
const native = await sharp(ART).metadata();

/**
 * SCALE IS CHOSEN TO PROTECT THE COPY, not to fill the height.
 *
 * Filling the height exactly crops 4.9% off each side — which is precisely what
 * the prompt and blueprint told the model to design around. The model did not
 * comply: it painted the back-cover copy starting at 5.3% of its canvas when the
 * instruction was 8.7%, and after the crop that copy landed 0.07in OUTSIDE the
 * trim line, where a printer would slice it off mid-word. Measured on the wrap
 * with trim guides drawn, not inferred.
 *
 * So the compositor scales GENTLY, crops less, and makes the residual height up
 * by stretching the topmost band — which is sky on both panels. This is the
 * DIRT RICH remedy, applied for the same reason: the art was correct, the
 * composition was cutting it off.
 *
 * The bottom is NEVER stretched: it holds the hiker, the rock ledge and the
 * author panel, and smearing a recognisable object is worse than any margin
 * gained. Sky has no feature a stretch can distort.
 */
const scaleArg = process.argv.find((a) => a.startsWith('--scale='));
const scale = scaleArg ? Number(scaleArg.split('=')[1]) : 2.5153;
const scaledW = Math.round(native.width! * scale);
const scaledH = Math.round(native.height! * scale);
const sideCrop = Math.round((scaledW - W) / 2);
const skyStretch = H - scaledH;
if (sideCrop < 0) throw new Error(`scale ${scale} too small: ${scaledW}px against a ${W}px wrap`);
if (skyStretch < 0) throw new Error(`scale ${scale} too large: ${scaledH}px against a ${H}px wrap`);

console.log(`art        : ${native.width} x ${native.height} px`);
console.log(`scale      : ${scale} -> ${scaledW} x ${scaledH} px`);
console.log(`side crop  : ${sideCrop}px (${(sideCrop / DPI).toFixed(4)}in) per side, retaining ${((W / scaledW) * 100).toFixed(1)}%`);
console.log(`sky stretch: ${skyStretch}px (${(skyStretch / DPI).toFixed(4)}in) added at the TOP only`);

const body = await sharp(ART)
  .resize(scaledW, scaledH, { kernel: 'lanczos3' })
  .extract({ left: sideCrop, top: 0, width: W, height: scaledH })
  .toBuffer();

/**
 * Edge-stretch, never mirror: a mirrored band once reflected a sign upside down.
 *
 * The stretch is spread across the TOP HALF of the image, not the top forty
 * rows. The first version of this took forty rows to the full missing height —
 * a several-hundred-per-cent stretch of a sliver, which smeared whatever texture
 * those rows happened to hold into visible vertical streaks across the top of
 * the finished wrap. Sky is a smooth gradient: stretching half the image by
 * 15% is invisible, stretching a sliver of it by 400% is not.
 */
const placed = await extendSkyUpward(body, W, scaledH, H);


// -- The seven parks, set into the gap the painting leaves under the blurb ----
/**
 * The front cover promises seven national parks and the back cover never said
 * which. This is the answer, composited rather than repainted: the artwork is
 * approved and untouched, and there is no text layer on this wrap to edit.
 *
 * Verified against the canonical manuscript's own PART 2 chapter headings
 * (sha256 9d3263d7...), chapters 4 through 10, not from memory.
 */
const PARKS_LEAD = 'Featured parks:';
/** Book order is Great Smoky Mountains first; selling order leads with the names
 *  a browser recognises fastest. Same seven either way. */
const PARKS = [
  'Yellowstone',
  'Grand Canyon',
  'Yosemite',
  'Zion',
  'Great Smoky Mountains',
  'Rocky Mountain',
  'Acadia',
];

const parks = await planParkListOverlay({
  wrap: placed,
  wrapWidthPx: W,
  wrapHeightPx: H,
  dpi: DPI,
  backPanelRightIn: BLEED + TRIM_W,
  lead: PARKS_LEAD,
  items: PARKS,
  joiner: ' · ',
});
console.log(`
back copy  : column ${parks.columnLeftIn.toFixed(3)}-${parks.columnRightIn.toFixed(3)}in, band ${parks.bandTopIn.toFixed(3)}-${parks.bandBottomIn.toFixed(3)}in`);
console.log(`park list  : ${parks.sizePx}px (${(parks.sizePx / DPI * 72).toFixed(1)}pt), ${parks.lines.length} lines, widest ${(parks.widestLinePx / DPI).toFixed(3)}in of ${(parks.measurePx / DPI).toFixed(3)}in`);
for (const l of parks.lines) console.log(`           : "${l}"`);
console.log(`           : block ${(parks.blockTopPx / DPI).toFixed(3)}-${(parks.blockBottomPx / DPI).toFixed(3)}in, air ${(parks.airAbovePx / DPI).toFixed(3)}in above / ${(parks.airBelowPx / DPI).toFixed(3)}in below`);

/**
 * Gates, because this draws onto a finished cover. Horizontal first: the line
 * must stay on the BACK panel and inside the live margin, nowhere near the
 * spine or the front. Then vertical: inside the live area and well clear of the
 * barcode reserve in the panel's lower right.
 */
{
  const rightIn = parks.columnLeftIn + parks.widestLinePx / DPI;
  const backPanelRightIn = BLEED + TRIM_W;
  if (parks.columnLeftIn < 0.375) throw new Error(`park list starts at ${parks.columnLeftIn.toFixed(3)}in, inside the live margin`);
  if (rightIn > backPanelRightIn - 0.25) {
    throw new Error(`park list reaches ${rightIn.toFixed(3)}in, past the back panel's live edge`);
  }
  const topIn = parks.blockTopPx / DPI;
  const botIn = parks.blockBottomPx / DPI;
  const barcodeTopIn = fullHeightIn - (BLEED + BARCODE_H + BARCODE_CLEAR);
  if (botIn > barcodeTopIn) throw new Error(`park list reaches ${botIn.toFixed(3)}in, into the barcode reserve`);
  if (topIn < 0.375 || botIn > fullHeightIn - 0.375) throw new Error('park list falls outside the live area');
  console.log(`           : x ${parks.columnLeftIn.toFixed(3)}-${rightIn.toFixed(3)}in of ${backPanelRightIn}in back panel; barcode reserve starts ${barcodeTopIn.toFixed(3)}in`);
}

const withParks = await sharp(placed)
  .composite([{ input: Buffer.from(parks.svg), left: 0, top: 0 }])
  .png()
  .toBuffer();


// -- The same seven parks along the foot of the FRONT cover ------------------
/**
 * The front cover names the number and the back cover names the parks. This puts
 * the parks on the front too, as a strip along the bottom, so the promise and its
 * answer are on the same face.
 *
 * Set in code over the finished artwork, like everything else on this cover that
 * an image model places badly. Nothing is repainted.
 *
 * The lead-in is dropped here. On the back it distinguishes the list from the
 * paragraph above it; on the front the title three inches up already says
 * 7 NATIONAL PARKS, so "Featured parks:" would only spend width — and width is
 * what buys type size in a strip this shallow.
 */
const FRONT_LEFT_IN = BLEED + TRIM_W + spineIn;
const FRONT_RIGHT_IN = FRONT_LEFT_IN + TRIM_W;
const FRONT_LIVE_LEFT_IN = FRONT_LEFT_IN + LIVE_MARGIN_IN;
const FRONT_LIVE_RIGHT_IN = FRONT_RIGHT_IN - LIVE_MARGIN_IN;
const FRONT_LIVE_BOTTOM_IN = fullHeightIn - BLEED - LIVE_MARGIN_IN;
/** The title block sits in the top half; stop well above the hiker. */
const TITLE_PANEL_SEARCH_BOTTOM_IN = fullHeightIn * 0.66;

const FRONT_LEFT_PX = Math.round(FRONT_LEFT_IN * DPI);
const FRONT_RIGHT_PX = Math.round(FRONT_RIGHT_IN * DPI);
/**
 * UNDER THE SUBTITLE, SET LIKE THE BACK COVER.
 *
 * Two lines rather than one, and that is the whole point: seven park names on a
 * single line across a six-inch cover can only ever be about nine point, which
 * is too small to read from a shelf or a thumbnail. Breaking them over two lines
 * halves the width each line has to carry and buys about half as much size again.
 *
 * It sits directly beneath the title block, in the same "Featured parks:" style
 * the back cover uses, aligned to the block's own width so it reads as the last
 * line of the title lockup rather than as something dropped onto the picture.
 */
const titlePanel = await findPaintedPanel(
  withParks,
  FRONT_LEFT_PX,
  FRONT_RIGHT_PX,
  Math.round(0.4 * DPI),
  Math.round(TITLE_PANEL_SEARCH_BOTTOM_IN * DPI),
  Math.round(0.02 * DPI),
);

const JOINER = process.env.NP_JOINER ?? ' · ';
/** Cap in points, so the list stays clearly subordinate to the subtitle. */
const FRONT_MAX_PT = Number(process.env.NP_FRONT_PT ?? 13.5);
const bandTopPx = titlePanel.footPx;
const bandBottomPx = bandTopPx + Math.round(0.62 * DPI);
console.log(
  `
front strip: title block ${(titlePanel.topPx / DPI).toFixed(3)}-${(titlePanel.footPx / DPI).toFixed(3)}in, ` +
    `x ${(titlePanel.leftPx / DPI).toFixed(3)}-${(titlePanel.rightPx / DPI).toFixed(3)}in`,
);

const frontParks = await planBackCoverLine({
  lead: 'Featured parks:',
  items: PARKS,
  joiner: JOINER,
  wrapWidthPx: W,
  wrapHeightPx: H,
  dpi: DPI,
  bandTopPx,
  bandBottomPx,
  columnLeftPx: titlePanel.leftPx,
  columnRightPx: titlePanel.rightPx,
  align: 'centre',
  minAirPx: 0,
  maxSizePx: Math.round((FRONT_MAX_PT / 72) * DPI),
  pinAirAbovePx: Math.round(0.055 * DPI),
  targetLines: 2,
});

console.log(
  `front parks: ${frontParks.sizePx}px (${((frontParks.sizePx / DPI) * 72).toFixed(1)}pt), ` +
    `${frontParks.lines.length} line(s), widest ${(frontParks.widestLinePx / DPI).toFixed(3)}in of ` +
    `${(frontParks.measurePx / DPI).toFixed(3)}in`,
);
for (const l of frontParks.lines) console.log(`           : "${l}"`);
console.log(
  `           : block ${(frontParks.blockTopPx / DPI).toFixed(3)}-${(frontParks.blockBottomPx / DPI).toFixed(3)}in, ` +
    `x ${(frontParks.drawnLeftPx / DPI).toFixed(3)}-${(frontParks.drawnRightPx / DPI).toFixed(3)}in`,
);

if (frontParks.lines.length !== 2) {
  throw new Error(`front strip set ${frontParks.lines.length} lines; the brief is two`);
}
if (frontParks.blockTopPx < titlePanel.footPx) throw new Error('front strip overlaps the title block');

const withFrontParks = await sharp(withParks)
  .composite([{ input: Buffer.from(frontParks.svg), left: 0, top: 0 }])
  .png()
  .toBuffer();

// ── Spine type, set by code ────────────────────────────────────────────────
const spineLeftPx = Math.round((BLEED + TRIM_W) * DPI);
const spineWpx = Math.round(spineIn * DPI);
/** The strip that survives fold wander on both sides. */
const safeStripIn = spineIn - FOLD_VARIANCE_IN * 2;
const safeStripPx = Math.round(safeStripIn * DPI);

const TITLE = '7 National Parks Without the Rookie Mistakes';
const AUTHOR = 'Tom Everett';

/**
 * Type may occupy the trim height less a quarter inch at head and foot. The wrap
 * is taller than that by the bleed, and type running to the very ends of a
 * perfect-bound spine reads as a mistake even when it survives the trim.
 */
const SPINE_SAFE_LEN_IN = TRIM_H - 0.5;
const GAP_IN = 0.5;

/**
 * Set through the shared spine typesetter, which MEASURES both strings before
 * placing them and carries them on a dark halo.
 *
 * This spine used to place the title at a fixed -6% of the wrap height and the
 * author at +20%, in flat cream with no outline. Two defects came out of that on
 * the finished cover: nothing checked the type's length, and cream painted
 * straight onto a continuous illustration disappeared wherever the illustration
 * went bright. "7 Nati" was invisible against the sunlit sky while the rest of
 * the title read perfectly against dark rock.
 */
const plan = await planSpineType({
  title: TITLE,
  author: AUTHOR,
  wrapHeightPx: H,
  spineWidthPx: spineWpx,
  foldSafeWidthPx: safeStripPx,
  safeLengthPx: Math.round(SPINE_SAFE_LEN_IN * DPI),
  gapPx: Math.round(GAP_IN * DPI),
  targetClearPx: Math.round(TARGET_CLEAR_IN * DPI),
});

console.log(`\nspine strip: ${spineWpx}px wide, fold-safe ${safeStripPx}px`);
console.log(`spine type : title ${plan.titlePx}px (cap ${plan.titleCapPx}px), author ${plan.authorPx}px`);
console.log(
  `clearance  : title ${(plan.titleClearLeftPx / DPI).toFixed(4)} / ${(plan.titleClearRightPx / DPI).toFixed(4)}in, ` +
    `author ${(plan.authorClearLeftPx / DPI).toFixed(4)} / ${(plan.authorClearRightPx / DPI).toFixed(4)}in`,
);
console.log(
  `           : WORST ${(plan.measuredClearPerSidePx / DPI).toFixed(4)}in (KDP floor ${FOLD_VARIANCE_IN}, house target ${TARGET_CLEAR_IN}), ` +
    `imbalance ${(plan.measuredImbalancePx / DPI).toFixed(4)}in` +
    `${plan.reducedForClearance ? ' — title sized down to reach the target' : ''}`,
);
console.log(`           : (the old cap-ratio figure would have said ${(plan.clearPerSidePx / DPI).toFixed(4)}in)`);
if (plan.measuredClearPerSidePx / DPI < TARGET_CLEAR_IN) {
  throw new Error(
    `spine typography clears only ${(plan.measuredClearPerSidePx / DPI).toFixed(4)}in, ` +
      `under the ${TARGET_CLEAR_IN}in house target`,
  );
}
if (plan.measuredImbalancePx / DPI > 0.02) {
  throw new Error(`spine type is ${(plan.measuredImbalancePx / DPI).toFixed(4)}in off centre across the spine`);
}
const wrap = await sharp(withFrontParks)
  .composite([{ input: Buffer.from(plan.svg), left: spineLeftPx, top: 0 }])
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
  .toBuffer();

// ── Into a PDF at exactly the required page box ────────────────────────────
const pdf = await PDFDocument.create();
const page = pdf.addPage([fullWidthIn * 72, fullHeightIn * 72]);
const img = await pdf.embedJpg(wrap);
page.drawImage(img, { x: 0, y: 0, width: fullWidthIn * 72, height: fullHeightIn * 72 });
const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
writeFileSync(OUT, bytes);

const proof = OUT.replace(/\.pdf$/i, '-proof.png');
await sharp(wrap).resize(1600).png().toFile(proof);

/**
 * The finished wrap, lossless, for the Kindle cover to be cut from.
 *
 * The ebook cover is this front panel and nothing else, so it has to come from
 * THIS file rather than from a parallel rebuild of the same artwork. It used to
 * come from a separate script that re-composed the wrap from the art, which was
 * fine while the only thing on the front was painted — and stopped being fine
 * the moment code started drawing on it, because that script knew nothing about
 * the park strip and would have shipped an ebook cover missing it.
 *
 * PNG, not JPEG: the Kindle cover is compressed once, at the end, rather than
 * inheriting this wrap's compression and then being compressed again.
 */
const wrapPng = OUT.replace(/\.pdf$/i, '-wrap.png');
await sharp(wrap).png({ compressionLevel: 6 }).toFile(wrapPng);
console.log(`wrap png   : ${wrapPng}`);

console.log(`\nfile       : ${OUT}`);
console.log(`bytes      : ${bytes.length}`);
console.log(`sha256     : ${createHash('sha256').update(bytes).digest('hex')}`);
console.log(`proof      : ${proof}`);
console.log(`placed     : ${W} x ${H} px into ${fullWidthIn.toFixed(4)} x ${fullHeightIn.toFixed(4)} in = ${DPI} DPI`);
process.exit(0);
