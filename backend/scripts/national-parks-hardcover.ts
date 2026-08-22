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

// ── Spine type, set by code, sized from the HARDCOVER spine safe area ──────
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
});

console.log(`
spine strip: ${spineWpx}px, safe area ${safeStripPx}px (${d.spineSafeWidthIn} in)`);
console.log(`spine type : title ${plan.titlePx}px (cap ${plan.titleCapPx}px), author ${plan.authorPx}px`);
console.log(`clearance  : ${(plan.clearPerSidePx / DPI).toFixed(4)} in per side`);
console.log(
  `spine length: title ${(plan.titleLengthPx / DPI).toFixed(2)} in + gap ${GAP_IN} in + author ` +
    `${(plan.authorLengthPx / DPI).toFixed(2)} in = ${(plan.totalLengthPx / DPI).toFixed(2)} in ` +
    `of ${d.spineSafeHeightIn} in safe`,
);
if (plan.reducedToFit) console.log('spine fit  : size reduced so the type fits the spine length');

const wrap = await sharp(placed)
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
