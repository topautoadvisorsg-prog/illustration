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
const placed = skyStretch === 0
  ? padded
  : await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
      .composite([
        {
          input: await sharp(padded)
            .extract({ left: 0, top: 0, width: W, height: skyBandPx })
            .resize(W, skyBandPx + skyStretch, { fit: 'fill', kernel: 'lanczos3' })
            .toBuffer(),
          left: 0,
          top: 0,
        },
        {
          input: await sharp(padded)
            .extract({ left: 0, top: skyBandPx, width: W, height: scaledH - skyBandPx })
            .toBuffer(),
          left: 0,
          top: skyBandPx + skyStretch,
        },
      ])
      .png()
      .toBuffer();
console.log(`sky band   : top ${(skyBandPx / DPI).toFixed(2)}in stretched to ${((skyBandPx + skyStretch) / DPI).toFixed(2)}in (${((skyStretch / skyBandPx) * 100).toFixed(0)}%)`);

// ── Spine type, set by code, sized from the HARDCOVER spine safe area ──────
const spineLeftPx = Math.round(spineL * DPI);
const spineWpx = Math.round(d.spineIn * DPI);
const safeStripPx = Math.round(d.spineSafeWidthIn * DPI);

const SPINE_FONT = 'Georgia, serif';
const CREAM = '#F2E8D5';
const titleCapFor = (px: number): number => Math.round(px * 0.69);

const TITLE = '7 National Parks Without the Rookie Mistakes';
const AUTHOR = 'Tom Everett';
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * HOW LONG THE TYPE ACTUALLY IS, measured rather than assumed.
 *
 * Spine text used to be placed at fixed fractions of the wrap height — the title
 * centred at -6% and the author at +20% — with nothing anywhere checking how long
 * either string rendered. That works until a title is long, and this one is
 * forty-four characters. On the hardcover the title ran straight through the
 * author and the two printed on top of each other.
 *
 * A string's ink length scales linearly with font size, so one measurement at a
 * reference size answers every size. The text is rasterised on its own and the
 * transparent margin trimmed off; what is left is the real extent, kerning,
 * letter-spacing, descenders and all.
 */
const REF_PX = 200;
async function inkLengthPx(text: string, weight: number): Promise<number> {
  const canvasW = REF_PX * text.length;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${REF_PX * 3}">
    <text x="${canvasW / 2}" y="${REF_PX * 1.5}" text-anchor="middle" dominant-baseline="middle"
          font-family="${SPINE_FONT}" font-size="${REF_PX}" font-weight="${weight}"
          fill="#fff" letter-spacing="1">${esc(text)}</text>
  </svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
  return info.width;
}

const titleRefPx = await inkLengthPx(TITLE, 600);
const authorRefPx = await inkLengthPx(AUTHOR, 400);

/**
 * The type sits inside the spine SAFE area in both directions: KDP's spine safe
 * width across, and its safe height along. `GAP_IN` is the clear space between
 * the end of the title and the start of the author block — enough that the two
 * read as separate blocks rather than one run of words.
 */
const GAP_IN = 0.5;
const safeLenPx = Math.round(d.spineSafeHeightIn * DPI);
const gapPx = Math.round(GAP_IN * DPI);

/** The size the strip width allows, before any length constraint. */
const widthLimitedPx = Math.floor((safeStripPx / 0.69) * 0.62);

/**
 * Shrink until the title, the gap and the author all fit along the safe height.
 * On this book the width limit wins and no shrinking happens — but a longer title
 * or a thinner spine would silently overrun without this, which is exactly how
 * the paperback ended up with its first six characters off the top of the spine.
 */
let titlePx = widthLimitedPx;
const lengthAt = (px: number): number =>
  Math.round((titleRefPx * px) / REF_PX) + gapPx + Math.round((authorRefPx * px * 0.72) / REF_PX);
while (titlePx > 8 && lengthAt(titlePx) > safeLenPx) titlePx -= 1;
if (titlePx < widthLimitedPx) {
  console.log(`spine fit  : title reduced ${widthLimitedPx} -> ${titlePx}px so the type fits the spine length`);
}

const authorPx = Math.floor(titlePx * 0.72);
const titleLenPx = Math.round((titleRefPx * titlePx) / REF_PX);
const authorLenPx = Math.round((authorRefPx * authorPx) / REF_PX);
const titleCapPx = titleCapFor(titlePx);
const clearPerSidePx = Math.round((spineWpx - titleCapPx) / 2);

console.log(`\nspine strip: ${spineWpx}px, safe area ${safeStripPx}px (${d.spineSafeWidthIn} in)`);
console.log(`spine type : title ${titlePx}px (cap ${titleCapPx}px), author ${authorPx}px`);
console.log(`clearance  : ${(clearPerSidePx / DPI).toFixed(4)} in per side`);
console.log(
  `spine length: title ${(titleLenPx / DPI).toFixed(2)} in + gap ${GAP_IN} in + author ` +
    `${(authorLenPx / DPI).toFixed(2)} in = ${((titleLenPx + gapPx + authorLenPx) / DPI).toFixed(2)} in ` +
    `of ${d.spineSafeHeightIn} in safe`,
);
if (titleLenPx + gapPx + authorLenPx > safeLenPx) {
  throw new Error('spine type does not fit the safe height even at the minimum size');
}

/**
 * Author pinned to the foot of the safe area, title centred in what is left above
 * it. Both blocks are positioned from their measured length, so neither can run
 * off an end or into the other.
 *
 * Coordinates are in the rotated frame, where x runs down the spine from the top
 * and 0 is the middle of the wrap.
 */
const safeTopX = -safeLenPx / 2;
const safeBotX = safeLenPx / 2;
const authorCentreX = safeBotX - authorLenPx / 2;
const titleFieldTop = safeTopX;
const titleFieldBot = authorCentreX - authorLenPx / 2 - gapPx;
const titleCentreX = (titleFieldTop + titleFieldBot) / 2;
/**
 * A DARK HALO, not a solid strip.
 *
 * The artwork now runs continuously through the spine, which is what it should
 * do -- and it means the spine type crosses pale sky in the upper third and dark
 * canyon lower down. Cream on cream is unreadable, and painting a solid band
 * behind it would put back exactly the artificial strip this edition exists to
 * remove.
 *
 * So each line is stroked with a soft dark outline underneath the fill
 * (`paint-order: stroke`), the same device the approved front title uses against
 * the photograph. The type reads on any background and the illustration stays
 * unbroken.
 */
const HALO = '#101a14';
const haloPx = Math.max(3, Math.round(titlePx * 0.14));
const spineSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spineWpx}" height="${H}">
  <g transform="translate(${spineWpx / 2}, ${H / 2}) rotate(90)">
    <text x="${titleCentreX}" y="0" text-anchor="middle" dominant-baseline="middle"
          font-family="${SPINE_FONT}" font-size="${titlePx}" font-weight="600"
          fill="${CREAM}" stroke="${HALO}" stroke-width="${haloPx}" stroke-opacity="0.85"
          paint-order="stroke fill" stroke-linejoin="round"
          letter-spacing="1">${esc(TITLE)}</text>
    <text x="${authorCentreX}" y="0" text-anchor="middle" dominant-baseline="middle"
          font-family="${SPINE_FONT}" font-size="${authorPx}" font-weight="400"
          fill="${CREAM}" stroke="${HALO}" stroke-width="${Math.max(2, Math.round(authorPx * 0.14))}" stroke-opacity="0.85"
          paint-order="stroke fill" stroke-linejoin="round"
          letter-spacing="1">${esc(AUTHOR)}</text>
  </g>
</svg>`;

const wrap = await sharp(placed)
  .composite([{ input: Buffer.from(spineSvg), left: spineLeftPx, top: 0 }])
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
