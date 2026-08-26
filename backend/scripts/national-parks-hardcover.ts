/*
 * HISTORICAL — DO NOT USE FOR NEW BOOKS.
 *
 * This built the 7 NATIONAL PARKS hardcover case. It is kept so that artifact can be reproduced, and
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
 * HARDCOVER case-laminate wrap for 7 NATIONAL PARKS.
 *
 * Geometry comes from `getKdpCoverDimensions`, which serves VERIFIED readings
 * from Amazon's own Cover Calculator and refuses to guess. For this book:
 *
 *   full wrap  14.025 x 10.417 in
 *   spine      0.450 in   (against 0.261 in paperback, at the SAME 116 pages —
 *                          the case board is the difference)
 *   wrap       0.591 in turn-in on every outside edge
 *   hinge      0.394 in either side of the spine, where the case folds
 *
 * The approved paperback artwork is RECOMPOSED into that geometry, never
 * stretched: same scale-gently-and-make-the-height-up-in-the-sky treatment the
 * paperback uses, re-solved for a wrap that is wider, taller and has four times
 * the turn-in.
 *
 * PAGE COUNT IS READ FROM THE INTERIOR, never typed in.
 *
 *   npx tsx scripts/national-parks-hardcover.ts <artPng> <interiorPdf> <outPdf> [--scale=N]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { getKdpCoverDimensions } from '../src/pipeline/publishing-standard/kdp-cover-specs.js';
import { extendSkyUpward, planSpineType } from '../src/pipeline/publishing-standard/spine-type.js';
import {
  findPaintedPanel,
  planBackCoverLine,
  planParkListOverlay,
} from '../src/pipeline/publishing-standard/back-cover-copy.js';

const ART = process.argv[2];
const INTERIOR = process.argv[3];
const OUT = process.argv[4];
if (!ART || !INTERIOR || !OUT) throw new Error('usage: national-parks-hardcover.ts <artPng> <interiorPdf> <outPdf>');

const DPI = 300;
const pageCount = (await PDFDocument.load(readFileSync(INTERIOR))).getPageCount();

const d = getKdpCoverDimensions({
  binding: 'HARDCOVER',
  coverType: 'CASE_LAMINATE',
  interiorType: 'BLACK_AND_WHITE',
  paperType: 'WHITE',
  trimSize: '6x9',
  pageCount,
});

const W = Math.round(d.fullWidthIn * DPI);
const H = Math.round(d.fullHeightIn * DPI);

console.log(`interior   : ${pageCount} pages (read from the PDF)`);
console.log(`provenance : ${d.provenance} — ${d.note}`);
console.log(`wrap       : ${d.fullWidthIn} x ${d.fullHeightIn} in = ${W} x ${H} px @ ${DPI} DPI`);
console.log(`spine      : ${d.spineIn} in   wrap ${d.wrapIn} in   hinge ${d.hingeIn} in`);

/** Panel boundaries across the wrap, in inches from the left edge. */
const backPanelL = d.wrapIn;
const spineL = (d.fullWidthIn - d.spineIn) / 2;
const spineR = spineL + d.spineIn;
const frontPanelR = d.fullWidthIn - d.wrapIn;
console.log(`panels     : back ${backPanelL.toFixed(3)}-${spineL.toFixed(3)} | spine ${spineL.toFixed(3)}-${spineR.toFixed(3)} | front ${spineR.toFixed(3)}-${frontPanelR.toFixed(3)} in`);

/**
 * COPY MUST CLEAR THE TURN-IN, THE MARGIN *AND* THE HINGE.
 *
 * A hardcover is far less forgiving than a paperback here. 0.591in of every
 * edge folds around the board and is never seen flat, and a further 0.394in
 * either side of the spine is the hinge, where the case creases. Type in either
 * is lost, so the usable band is much narrower than the paperback's.
 */
const SAFE_FROM_EDGE = d.wrapIn + d.marginIn + 0.125; // turn-in + margin + a little
console.log(`copy safe  : >= ${SAFE_FROM_EDGE.toFixed(3)} in from the outer edge, and clear of the ${d.hingeIn} in hinge\n`);

/**
 * Scale, solved against where the artwork actually put its back copy.
 *
 * Measured on the approved art: the back-copy block starts at x = 82px of the
 * 1536px canvas. Filling the hardcover height would crop 0.8in per side and put
 * that block 0.03in from the wrap edge — inside the turn-in, folded around the
 * board and gone. So the same remedy as the paperback, re-solved: scale gently,
 * crop less, and make the residual height up by stretching the top band, which
 * is sky.
 */
const BACK_COPY_X_PX = 82;
const native = await sharp(ART).metadata();
const scaleArg = process.argv.find((a) => a.startsWith('--scale='));

/**
 * SCALED UNDER, THEN PADDED AT THE EDGES.
 *
 * The tension: filling the wrap's width wants a large scale, and protecting the
 * back-cover copy from the turn-in wants a small one. At the smallest scale that
 * still covers the width, the copy lands 0.749in from the edge -- inside KDP's
 * 0.716in safe line by only three hundredths of an inch, which is no margin at
 * all on a case that wraps around board.
 *
 * So the art is scaled BELOW full width and the shortfall is filled by stretching
 * the outermost columns. That padding lands entirely inside the 0.591in turn-in,
 * which folds around the board edge and is never seen flat -- and the far left is
 * canyon wall in shadow, the far right sunlit rock, both close to vertical, so
 * there is no feature a narrow horizontal stretch can distort.
 *
 * Both sides are padded equally, so the painted spine stays centred on the
 * physical one. An asymmetric crop would buy margin and misregister the spine,
 * which is the more expensive mistake.
 */
const scale = scaleArg ? Number(scaleArg.split('=')[1]) : 2.68;
const scaledW = Math.round(native.width! * scale);
const scaledH = Math.round(native.height! * scale);
const sidePad = Math.max(0, Math.round((W - scaledW) / 2));
const sideCrop = Math.max(0, Math.round((scaledW - W) / 2));
const skyStretch = H - scaledH;
if (skyStretch < 0) throw new Error(`scale ${scale} too large: ${scaledH}px against a ${H}px wrap`);

const backCopyIn = (BACK_COPY_X_PX * scale + sidePad - sideCrop) / DPI;
console.log(`art        : ${native.width} x ${native.height} px`);
console.log(`scale      : ${scale} -> ${scaledW} x ${scaledH} px`);
console.log(`side       : ${sidePad ? `pad ${(sidePad / DPI).toFixed(3)}in` : `crop ${(sideCrop / DPI).toFixed(3)}in`} per side`);
console.log(`sky stretch: ${(skyStretch / DPI).toFixed(3)} in at the TOP only`);
console.log(`back copy  : lands ${backCopyIn.toFixed(3)} in from the wrap edge (need >= ${SAFE_FROM_EDGE.toFixed(3)})`);
if (backCopyIn < SAFE_FROM_EDGE - 0.01) throw new Error('back copy would fall inside the turn-in');

const scaled = await sharp(ART).resize(scaledW, scaledH, { kernel: 'lanczos3' }).toBuffer();
const cropped = sideCrop > 0
  ? await sharp(scaled).extract({ left: sideCrop, top: 0, width: W, height: scaledH }).toBuffer()
  : scaled;
const innerW = sideCrop > 0 ? W : scaledW;

/** Edge columns, stretched outward to fill the turn-in. Never mirrored. */
const padded = sidePad === 0
  ? cropped
  : await sharp({ create: { width: W, height: scaledH, channels: 3, background: '#000' } })
      .composite([
        {
          input: await sharp(cropped)
            .extract({ left: 0, top: 0, width: 12, height: scaledH })
            .resize(sidePad, scaledH, { fit: 'fill', kernel: 'lanczos3' })
            .toBuffer(),
          left: 0,
          top: 0,
        },
        { input: cropped, left: sidePad, top: 0 },
        {
          input: await sharp(cropped)
            .extract({ left: innerW - 12, top: 0, width: 12, height: scaledH })
            .resize(W - sidePad - innerW, scaledH, { fit: 'fill', kernel: 'lanczos3' })
            .toBuffer(),
          left: sidePad + innerW,
          top: 0,
        },
      ])
      .png()
      .toBuffer();

/**
 * A TALL BAND, STRETCHED GENTLY -- not a thin one blown up.
 *
 * Taking 40 rows and resizing them to 1.27in is a 10x stretch, and it shows: the
 * top of the wrap came out as vertical smears where the cloud banding should be.
 * Stretching the top HALF of the image by the same absolute amount is a ~28%
 * stretch instead, which cloud and haze absorb without reading as a defect.
 *
 * Still the top only. The foot of the wrap holds the hiker, the rock ledge and
 * the author panel, and smearing a recognisable subject is worse than any margin
 * it would buy.
 */
const SKY_BAND_FRACTION = 0.5;
const skyBandPx = Math.round(scaledH * SKY_BAND_FRACTION);
const placed = await extendSkyUpward(padded, W, scaledH, H, SKY_BAND_FRACTION);
console.log(`sky band   : top ${(skyBandPx / DPI).toFixed(2)}in stretched to ${((skyBandPx + skyStretch) / DPI).toFixed(2)}in (${((skyStretch / skyBandPx) * 100).toFixed(0)}%)`);


// -- The seven parks, set into the gap the painting leaves under the blurb ----
/**
 * Same addition as the paperback, from the same verified list, found the same
 * way. The band is DETECTED rather than copied across: this wrap holds the same
 * artwork at a different scale with a different sky stretch, so the paperback's
 * coordinates mean nothing here.
 */
const PARKS_LEAD = 'Featured parks:';
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
  backPanelRightIn: spineL,
  lead: PARKS_LEAD,
  items: PARKS,
  joiner: ' · ',
  scanLeftIn: d.wrapIn + 0.1,
  scanRightInsetIn: 1.35,
});
console.log(`
back copy  : column ${parks.columnLeftIn.toFixed(3)}-${parks.columnRightIn.toFixed(3)}in, band ${parks.bandTopIn.toFixed(3)}-${parks.bandBottomIn.toFixed(3)}in`);
console.log(`park list  : ${parks.sizePx}px (${(parks.sizePx / DPI * 72).toFixed(1)}pt), ${parks.lines.length} lines, widest ${(parks.widestLinePx / DPI).toFixed(3)}in of ${(parks.measurePx / DPI).toFixed(3)}in`);
for (const l of parks.lines) console.log(`           : "${l}"`);
console.log(`           : block ${(parks.blockTopPx / DPI).toFixed(3)}-${(parks.blockBottomPx / DPI).toFixed(3)}in, air ${(parks.airAbovePx / DPI).toFixed(3)}in above / ${(parks.airBelowPx / DPI).toFixed(3)}in below`);

/**
 * Gates. A hardcover wrap folds around board, so the outside edges are the
 * turn-in, not a bleed: copy must clear `wrapIn` plus the margin, not 0.125in.
 */
{
  const rightIn = parks.columnLeftIn + parks.widestLinePx / DPI;
  const liveLeft = d.wrapIn + d.marginIn;
  const liveTop = d.wrapIn + d.marginIn;
  const liveBottom = d.fullHeightIn - d.wrapIn - d.marginIn;
  const topIn = parks.blockTopPx / DPI;
  const botIn = parks.blockBottomPx / DPI;
  if (parks.columnLeftIn < liveLeft) throw new Error(`park list starts at ${parks.columnLeftIn.toFixed(3)}in, inside the ${liveLeft.toFixed(3)}in turn-in and margin`);
  if (rightIn > spineL - d.hingeIn) throw new Error(`park list reaches ${rightIn.toFixed(3)}in, into the ${d.hingeIn}in hinge`);
  if (topIn < liveTop || botIn > liveBottom) throw new Error('park list falls outside the live area');
  const barcodeTopIn = liveBottom - 1.2;
  if (botIn > barcodeTopIn) throw new Error(`park list reaches ${botIn.toFixed(3)}in, into the barcode reserve`);
  console.log(`           : x ${parks.columnLeftIn.toFixed(3)}-${rightIn.toFixed(3)}in; live ${liveLeft.toFixed(3)}-${(spineL - d.hingeIn).toFixed(3)}in, hinge starts ${(spineL - d.hingeIn).toFixed(3)}in`);
}

const withParks = await sharp(placed)
  .composite([{ input: Buffer.from(parks.svg), left: 0, top: 0 }])
  .png()
  .toBuffer();


// -- The same seven parks on the FRONT cover, under the subtitle -------------
/**
 * A hardcover's outer edges are the turn-in rather than a bleed, so "safe" here
 * is `wrapIn + marginIn + 0.125` from the outside and the hinge from the spine
 * side — the same envelope the back copy is held to.
 */
/**
 * UNDER THE SUBTITLE, SET LIKE THE BACK COVER — the same as the paperback.
 *
 * Two lines rather than one, and that is the point: seven names on a single line
 * across a six-inch cover can only ever be about nine point. Breaking them over
 * two halves the width each line carries and buys about half as much size again.
 *
 * The title block is FOUND on this wrap rather than copied from the paperback's
 * coordinates: the same artwork sits 6.6% larger here with its top half stretched
 * another 28%, so nothing measured over there means anything here.
 */
const FRONT_LIVE_LEFT_IN = spineR + d.hingeIn;
const FRONT_LIVE_RIGHT_IN = d.fullWidthIn - SAFE_FROM_EDGE;

const titlePanel = await findPaintedPanel(
  withParks,
  Math.round(spineR * DPI),
  Math.round(frontPanelR * DPI),
  Math.round(0.4 * DPI),
  Math.round(d.fullHeightIn * 0.66 * DPI),
  Math.round(0.02 * DPI),
);

const JOINER = process.env.NP_JOINER ?? ' · ';
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

if (frontParks.lines.length !== 2) throw new Error(`front strip set ${frontParks.lines.length} lines; the brief is two`);
if (frontParks.blockTopPx < titlePanel.footPx) throw new Error('front strip overlaps the title block');
{
  const l = frontParks.drawnLeftPx / DPI;
  const r = frontParks.drawnRightPx / DPI;
  if (l < FRONT_LIVE_LEFT_IN || r > FRONT_LIVE_RIGHT_IN) {
    throw new Error(`front strip spans ${l.toFixed(3)}-${r.toFixed(3)}in, outside live ${FRONT_LIVE_LEFT_IN.toFixed(3)}-${FRONT_LIVE_RIGHT_IN.toFixed(3)}in`);
  }
}

const withFrontParks = await sharp(withParks)
  .composite([{ input: Buffer.from(frontParks.svg), left: 0, top: 0 }])
  .png()
  .toBuffer();

// ── Spine type, set by code, sized from the HARDCOVER spine safe area ──────
/**
 * INTERNAL production target for spine fold clearance.
 *
 * KDP's hard floor is 0.0625in. This is 0.075in, and the difference is
 * deliberate: the first halo-aware measurement of this wrap came out at
 * 0.0633in — a pass by eight ten-thousandths of an inch, which is not tolerance,
 * it is luck. The title is sized down until the COMPLETE drawn typography clears
 * both folds by this much.
 */
const TARGET_CLEAR_IN = 0.075;

const spineLeftPx = Math.round(spineL * DPI);
const spineWpx = Math.round(d.spineIn * DPI);
const safeStripPx = Math.round(d.spineSafeWidthIn * DPI);

const TITLE = '7 National Parks Without the Rookie Mistakes';
const AUTHOR = 'Tom Everett';

/**
 * The type sits inside the spine SAFE area in both directions: KDP's spine safe
 * width across, and its safe height along. `GAP_IN` is the clear space between
 * the end of the title and the start of the author block -- enough that the two
 * read as separate blocks rather than one run of words.
 *
 * Set through the shared spine typesetter, which MEASURES both strings before
 * placing them and carries them on a dark halo rather than a painted strip. The
 * measuring is why this spine works: placed at the old fixed fractions of the
 * wrap height, a forty-four character title on a 10.4in spine ran straight
 * through the author block and the two printed on top of each other.
 */
const GAP_IN = 0.5;
const plan = await planSpineType({
  title: TITLE,
  author: AUTHOR,
  wrapHeightPx: H,
  spineWidthPx: spineWpx,
  foldSafeWidthPx: safeStripPx,
  safeLengthPx: Math.round(d.spineSafeHeightIn * DPI),
  gapPx: Math.round(GAP_IN * DPI),
  targetClearPx: Math.round(TARGET_CLEAR_IN * DPI),
});

console.log(`
spine strip: ${spineWpx}px, safe area ${safeStripPx}px (${d.spineSafeWidthIn} in)`);
console.log(`spine type : title ${plan.titlePx}px (cap ${plan.titleCapPx}px), author ${plan.authorPx}px`);
/* The hardcover printed a computed clearance and gated on nothing, which is how
   spine type reached a finished wrap sitting ON the front fold while the line
   above it read a comfortable 0.1233in. Every number below is now MEASURED off
   an isolated transparent render of the typography — fill, halo and the
   antialiased edge of both — so no artwork can flatter it and no ratio can
   stand in for it. */
const FOLD_VARIANCE_IN = 0.0625;
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
}console.log(
  `spine length: title ${(plan.titleLengthPx / DPI).toFixed(2)} in + gap ${GAP_IN} in + author ` +
    `${(plan.authorLengthPx / DPI).toFixed(2)} in = ${(plan.totalLengthPx / DPI).toFixed(2)} in ` +
    `of ${d.spineSafeHeightIn} in safe`,
);
if (plan.reducedToFit) console.log('spine fit  : size reduced so the type fits the spine length');

const wrap = await sharp(withFrontParks)
  .composite([{ input: Buffer.from(plan.svg), left: spineLeftPx, top: 0 }])
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
  .toBuffer();

const pdf = await PDFDocument.create();
const page = pdf.addPage([d.fullWidthIn * 72, d.fullHeightIn * 72]);
const img = await pdf.embedJpg(wrap);
page.drawImage(img, { x: 0, y: 0, width: d.fullWidthIn * 72, height: d.fullHeightIn * 72 });
const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
writeFileSync(OUT, bytes);

const proof = OUT.replace(/\.pdf$/i, '-proof.png');
await sharp(wrap).resize(1700).png().toFile(proof);

console.log(`\nfile       : ${OUT}`);
console.log(`bytes      : ${bytes.length}`);
console.log(`sha256     : ${createHash('sha256').update(bytes).digest('hex')}`);
console.log(`proof      : ${proof}`);
process.exit(0);
