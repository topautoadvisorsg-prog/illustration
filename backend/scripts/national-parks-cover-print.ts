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
const THICKNESS_WHITE_BW = 0.002252;
/** KDP allows this much fold wander either side of each spine fold. */
const FOLD_VARIANCE_IN = 0.0625;

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

// Edge-stretch, never mirror: a mirrored band once reflected a sign upside down.
// Stretching the outermost sky rows cannot duplicate an object.
const placed = skyStretch === 0
  ? body
  : await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
      .composite([
        {
          input: await sharp(body)
            .extract({ left: 0, top: 0, width: W, height: 40 })
            .resize(W, skyStretch, { fit: 'fill', kernel: 'lanczos3' })
            .toBuffer(),
          left: 0,
          top: 0,
        },
        { input: body, left: 0, top: skyStretch },
      ])
      .png()
      .toBuffer();

// ── Spine type, set by code ────────────────────────────────────────────────
const spineLeftPx = Math.round((BLEED + TRIM_W) * DPI);
const spineWpx = Math.round(spineIn * DPI);
/** The strip that survives fold wander on both sides. */
const safeStripIn = spineIn - FOLD_VARIANCE_IN * 2;
const safeStripPx = Math.round(safeStripIn * DPI);

/**
 * Georgia, not the vendored interior faces.
 *
 * sharp rasterises SVG through librsvg, which resolves families through
 * fontconfig and CANNOT see the TTFs vendored for the interior — Archivo, Lora
 * and EB Garamond all render byte-identical, every one of them silently falling
 * back to DejaVu Sans. Georgia is verifiably resolvable here and is the face the
 * shipped DIRT RICH spine was set in.
 */
const SPINE_FONT = 'Georgia, serif';
const CREAM = '#F2E8D5';

/**
 * Sized from the fold-safe strip, not from taste. Georgia's caps are ~0.69em,
 * so the cap height must fit inside `safeStripPx` with clearance either side.
 */
const titlePx = Math.floor((safeStripPx / 0.69) * 0.62);
const authorPx = Math.floor(titlePx * 0.72);
const titleCapPx = Math.round(titlePx * 0.69);
const clearPerSidePx = Math.round((spineWpx - titleCapPx) / 2);

console.log(`\nspine strip: ${spineWpx}px wide, fold-safe ${safeStripPx}px`);
console.log(`spine type : title ${titlePx}px (cap ${titleCapPx}px), author ${authorPx}px`);
console.log(`clearance  : ${clearPerSidePx}px = ${(clearPerSidePx / DPI).toFixed(4)}in per side (need >= ${FOLD_VARIANCE_IN})`);
if (clearPerSidePx / DPI < FOLD_VARIANCE_IN) throw new Error('spine type too wide for the fold variance');

const TITLE = '7 National Parks Without the Rookie Mistakes';
const AUTHOR = 'Tom Everett';
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Rotated -90 so the spine reads top-to-bottom when the book stands on a shelf,
 * which is the American convention. The two lines are centred as ONE GROUP about
 * the mid-height, so the strip does not read lopsided.
 */
const spineSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spineWpx}" height="${H}">
  <g transform="translate(${spineWpx / 2}, ${H / 2}) rotate(90)">
    <text x="${-H * 0.06}" y="0" text-anchor="middle" dominant-baseline="middle"
          font-family="${SPINE_FONT}" font-size="${titlePx}" font-weight="600"
          fill="${CREAM}" letter-spacing="1">${esc(TITLE)}</text>
    <text x="${H * 0.20}" y="0" text-anchor="middle" dominant-baseline="middle"
          font-family="${SPINE_FONT}" font-size="${authorPx}" font-weight="400"
          fill="${CREAM}" letter-spacing="1">${esc(AUTHOR)}</text>
  </g>
</svg>`;

const wrap = await sharp(placed)
  .composite([{ input: Buffer.from(spineSvg), left: spineLeftPx, top: 0 }])
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

console.log(`\nfile       : ${OUT}`);
console.log(`bytes      : ${bytes.length}`);
console.log(`sha256     : ${createHash('sha256').update(bytes).digest('hex')}`);
console.log(`proof      : ${proof}`);
console.log(`placed     : ${W} x ${H} px into ${fullWidthIn.toFixed(4)} x ${fullHeightIn.toFixed(4)} in = ${DPI} DPI`);
process.exit(0);
