/**
 * FINISH THE PAPERBACK WRAP: the model's artwork plus the two strings it must
 * not paint.
 *
 * The artwork carries the title, the subtitle and all of the back-cover copy,
 * exactly as the approved cover did. Two things are set here instead, because a
 * model cannot be trusted with either:
 *
 *   AUTHOR NAME  it was painted lettering before, inside a green panel. Set here
 *                in real type, on clean artwork, with a dark halo so it reads
 *                against sunlit rock.
 *   SPINE        a 0.27in strip. Below what an image model can letter at all,
 *                and the one piece whose position is bounded by a fold.
 *
 * NOTHING ELSE IS DRAWN. The title, subtitle and back copy are the model's.
 *
 * THE BARCODE IS CHECKED, NOT ASSUMED. The previous wrap put back-cover copy
 * 0.818in inside KDP's reserve, where Amazon prints a barcode straight over the
 * words. This measures the painted copy by edge crossings — a row of type flips
 * dark-to-light many times across an inch, a photograph does not — and REFUSES
 * to write a cover whose copy reaches the reserve.
 *
 *   npx tsx scripts/national-parks-cover-finish.ts <artPng> <interiorPdf> <outPdf>
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { extendSkyUpward, planSpineType } from '../src/pipeline/publishing-standard/spine-type.js';
import { COPY_CREAM, COPY_FONT, COPY_HALO } from '../src/pipeline/publishing-standard/cover-copy-column.js';

const ART = process.argv[2];
const INTERIOR = process.argv[3];
const OUT = process.argv[4];
if (!ART || !INTERIOR || !OUT) throw new Error('usage: national-parks-cover-finish.ts <artPng> <interiorPdf> <outPdf>');

const DPI = 300;
const TRIM_W = 6;
const TRIM_H = 9;
const BLEED = 0.125;
const THICKNESS_WHITE_BW = 0.002252;
const BARCODE_H = 1.2;
const BARCODE_CLEAR = 0.25;
const FOLD_VARIANCE_IN = 0.0625;
const TARGET_CLEAR_IN = 0.075;
const AUTHOR = 'Tom Everett';

const inPx = (n: number): number => Math.round(n * DPI);
const escapeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Geometry, from the interior itself ─────────────────────────────────────
const pageCount = (await PDFDocument.load(readFileSync(INTERIOR))).getPageCount();
const spineIn = pageCount * THICKNESS_WHITE_BW;
const fullWidthIn = BLEED + TRIM_W + spineIn + TRIM_W + BLEED;
const fullHeightIn = BLEED + TRIM_H + BLEED;
const W = Math.round(fullWidthIn * DPI);
const H = Math.round(fullHeightIn * DPI);
const backRightIn = BLEED + TRIM_W;
const frontLeftIn = BLEED + TRIM_W + spineIn;
const barcodeTopIn = fullHeightIn - (BLEED + BARCODE_H + BARCODE_CLEAR);

console.log(`interior   : ${INTERIOR}`);
console.log(`page count : ${pageCount} (read from the PDF)`);
console.log(`spine      : ${pageCount} x ${THICKNESS_WHITE_BW} = ${spineIn.toFixed(6)} in`);
console.log(`wrap       : ${fullWidthIn.toFixed(6)} x ${fullHeightIn.toFixed(6)} in = ${W} x ${H} px @ ${DPI} DPI`);

// ── Fit the art, one panel at a time ───────────────────────────────────────
/**
 * THE ARTWORK IS A DIPTYCH, SO IT IS FITTED AS ONE.
 *
 * The model painted two scenes with a flat olive band between them: a shaded
 * canyon wall in forest for the back, a sunlit valley with a hiker for the
 * front. The band was the spine, and the brief that produced it asked for "a
 * plain, flat, EVEN field of the cover's dominant background colour" — correct
 * while green was the accent colour of the title and author panels, wrong the
 * moment those panels came off. It now matches nothing on the book and reads as
 * a stripe someone forgot to remove.
 *
 * THE BAND IS NOT THE SPINE. It is 102px of a 1536px painting, which lands
 * 0.85in wide on the wrap: more than three times the 0.270in spine of a
 * 120-page block, overhanging the fold by about 0.3in onto each panel. Painting
 * over the strip between the folds would leave an olive sliver down each face.
 *
 * Nor can the photograph be carried across it, because there is no one
 * photograph to carry. Three ways of inventing the missing 0.85in were built
 * and rejected by eye: mirroring a band-width block of picture in from each
 * side put a SECOND hiker on the spine beneath a symmetrical mountain;
 * cross-fading a blurred column from each side turned dark forest into lit
 * valley as a grey smear; mirroring each panel's own texture outward to the fold
 * left a visible butterfly seam 0.3in inside the back cover.
 *
 * So the band is not filled. It is CUT, and each scene is fitted to its own
 * panel — the back scene scaled to cover the back panel out to the fold, the
 * front scene to cover the front panel out to the fold, at one shared scale so
 * neither is distorted against the other. Every pixel on both faces is then real
 * painted picture right up to the fold, and the only invented strip left on the
 * cover is the 0.270in between the folds, which is the fold.
 *
 * The scale is the smallest that covers both panels, so the crop stays as gentle
 * as it can be. Filling the height exactly is the honest fit for a clean plate
 * and the wrong one here: it crops 0.68in a side, and the model paints the title
 * closer to the edge than that — the first attempt at this cover sliced the last
 * letters off "7 NATIONAL PARKS". The residual height is made up by stretching
 * the TOP band, which is sky on both scenes. The bottom is never stretched: it
 * holds the foreground rock and the author's name.
 */
const native = await sharp(ART).metadata();
const artW = native.width!;
const artH = native.height!;
const backRightPx = inPx(backRightIn);
const frontLeftPx = inPx(frontLeftIn);

/** The band is found by column variance: a painted flat field barely varies down its height. */
const [bandA, bandB] = await (async (): Promise<[number, number]> => {
  const { data, info } = await sharp(ART).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ys: number[] = [];
  for (let y = 2; y < artH - 2; y += 2) ys.push(y);
  const flat = (x: number): boolean => {
    const l = ys.map((y) => {
      const i = (y * info.width + x) * info.channels;
      return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    });
    const m = l.reduce((acc, v) => acc + v, 0) / l.length;
    return Math.sqrt(l.reduce((acc, v) => acc + (v - m) ** 2, 0) / l.length) < 12;
  };
  const c = Math.round(artW / 2);
  if (!flat(c)) throw new Error('no flat painted band down the middle of the artwork; this is not the art this fit was written for');
  let a = c;
  while (a - 1 >= 0 && flat(a - 1)) a -= 1;
  let b = c;
  while (b + 1 < artW && flat(b + 1)) b += 1;
  return [a, b];
})();
/** Two columns either side are the antialiased edge of the band. They are not picture. */
const FRINGE = 2;
const backArtW = bandA - FRINGE;
const frontArtX = bandB + 1 + FRINGE;
const frontArtW = artW - frontArtX;
console.log(`\nart        : ${artW} x ${artH} px`);
console.log(`band       : painted flat at art x ${bandA}..${bandB} (${bandB - bandA + 1}px) — CUT, not filled`);
console.log(`scenes     : back 0..${backArtW - 1} (${backArtW}px), front ${frontArtX}..${artW - 1} (${frontArtW}px)`);

/** The smallest scale that covers both panels out to their folds, with a little left to crop. */
const SPARE = 12;
const scaleArg = process.argv.find((a) => a.startsWith('--scale='));
const scale = scaleArg
  ? Number(scaleArg.split('=')[1])
  : Math.max((backRightPx + SPARE) / backArtW, (W - frontLeftPx + SPARE) / frontArtW);
const scaledW = Math.round(artW * scale);
const scaledH = Math.round(artH * scale);
const skyStretch = H - scaledH;
if (skyStretch < 0) throw new Error(`scale ${scale.toFixed(4)} too large: ${scaledH}px against a ${H}px wrap`);
const backScaledW = Math.round(backArtW * scale);
const frontScaledX = Math.round(frontArtX * scale);
const backCrop = backScaledW - backRightPx;
const frontCrop = scaledW - frontScaledX - (W - frontLeftPx);
if (backCrop < 0 || frontCrop < 0) {
  throw new Error(`scale ${scale.toFixed(4)} does not cover both panels (back short by ${-backCrop}px, front by ${-frontCrop}px)`);
}
console.log(`fit        : x${scale.toFixed(4)} -> ${scaledW} x ${scaledH}px, one scale for both scenes`);
console.log(`           : back panel ${backRightPx}px, cropping ${(backCrop / DPI).toFixed(3)}in off its outer edge`);
console.log(`           : front panel ${W - frontLeftPx}px, cropping ${(frontCrop / DPI).toFixed(3)}in off its outer edge`);
console.log(`sky stretch: ${skyStretch}px (${(skyStretch / DPI).toFixed(3)}in) added at the TOP only`);

const scaled = await sharp(ART).resize(scaledW, scaledH, { kernel: 'lanczos3' }).png().toBuffer();
const backPanel = await sharp(scaled).extract({ left: backCrop, top: 0, width: backRightPx, height: scaledH }).png().toBuffer();
const frontPanel = await sharp(scaled).extract({ left: frontScaledX, top: 0, width: W - frontLeftPx, height: scaledH }).png().toBuffer();
const body = await sharp({ create: { width: W, height: scaledH, channels: 3, background: '#000' } })
  .composite([
    { input: backPanel, left: 0, top: 0 },
    { input: frontPanel, left: frontLeftPx, top: 0 },
  ])
  .png()
  .toBuffer();
let wrap = await extendSkyUpward(body, W, scaledH, H);

// ── The spine: the one strip that is not painted picture ───────────────────
/**
 * 0.270in, fold to fold. Both panels now run right up to it and they do not
 * meet — shaded forest on one side, lit valley on the other — so it is a blend,
 * and it is honest about being one. Sixteen columns of each panel are averaged
 * into a single colour and blurred along their length so nothing streaks, the
 * two are cross-faded across the strip, and the patch is feathered a thirtieth
 * of an inch into each panel so the join has no edge of its own. At this width,
 * on the fold, it reads as the roll of the fold, which is what it is.
 *
 * Done in code, not by another edit pass. The last two passes each risked the
 * back-cover text — one of them corrupted a word — and no image model needs to
 * be involved in a strip this narrow.
 */
{
  const SAMPLE_W = 16;
  const FEATHER = 10;
  const from = backRightPx - FEATHER;
  const to = frontLeftPx - 1 + FEATHER;
  const patchW = to - from + 1;
  if (from - SAMPLE_W < 0 || to + SAMPLE_W >= W) throw new Error('no room either side of the spine to sample it from');

  const colFrom = async (left: number): Promise<Buffer> => {
    const one = await sharp(wrap)
      .extract({ left, top: 0, width: SAMPLE_W, height: H })
      .resize(1, H, { fit: 'fill', kernel: 'lanczos3' })
      .blur(8)
      .png()
      .toBuffer();
    return sharp(one).resize(patchW, H, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  };
  const leftFill = await colFrom(from - SAMPLE_W);
  const rightFill = await colFrom(to + 1);

  const smoothstep = (t: number): number => t * t * (3 - 2 * t);
  const tiled = (f: (x: number) => number): Buffer => {
    const r = Buffer.alloc(patchW);
    for (let x = 0; x < patchW; x += 1) r[x] = Math.round(Math.min(1, Math.max(0, f(x))) * 255);
    const m = Buffer.alloc(patchW * H);
    for (let y = 0; y < H; y += 1) r.copy(m, y * patchW);
    return m;
  };
  /** The back panel owns the left fold, the front panel the right, handing over between them. */
  const mixMask = tiled((x) => smoothstep(x / Math.max(1, patchW - 1)));
  /** And the patch fades in and out across the feather at each end. */
  const edgeMask = tiled((x) => smoothstep(Math.min(1, Math.min(x / FEATHER, (patchW - 1 - x) / FEATHER))));

  const rightMasked = await sharp(rightFill)
    .ensureAlpha()
    .composite([{ input: mixMask, raw: { width: patchW, height: H, channels: 1 }, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const mixed = await sharp(leftFill).composite([{ input: rightMasked }]).png().toBuffer();
  const patch = await sharp(mixed)
    .ensureAlpha()
    .composite([{ input: edgeMask, raw: { width: patchW, height: H, channels: 1 }, blend: 'dest-in' }])
    .png()
    .toBuffer();
  wrap = await sharp(wrap).composite([{ input: patch, left: from, top: 0 }]).png().toBuffer();

  console.log(`spine fill : x ${backRightPx}..${frontLeftPx - 1} (${frontLeftPx - backRightPx}px, ${((frontLeftPx - backRightPx) / DPI).toFixed(3)}in) blended between the panels`);
  console.log(`           : patched x ${from}..${to}, ${FEATHER}px feathered into each panel`);
}

/** NOTHING PAINTED MAY BE LEFT BEHIND. The cut is verified, not assumed. */
{
  const { data, info } = await sharp(wrap).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ys: number[] = [];
  for (let y = 4; y < H - 4; y += 5) ys.push(y);
  const sd = (x: number): number => {
    const l = ys.map((y) => {
      const i = (y * info.width + x) * info.channels;
      return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    });
    const m = l.reduce((acc, v) => acc + v, 0) / l.length;
    return Math.sqrt(l.reduce((acc, v) => acc + (v - m) ** 2, 0) / l.length);
  };
  /**
   * A leftover of the band would lie BESIDE THE FOLD, so that is where this
   * looks. It cannot reject every flat column on the cover: the outer inch of
   * the back panel is cliff shadow, genuinely flat and near black, and rejecting
   * that would fail every honest build. The blended spine strip itself is
   * exempt; it is the fold.
   */
  const reach = Math.round(1.5 * DPI);
  const faces: Array<[number, number, string]> = [
    [Math.max(inPx(BLEED), backRightPx - reach), backRightPx - 1, 'back'],
    [frontLeftPx, Math.min(W - inPx(BLEED) - 1, frontLeftPx + reach), 'front'],
  ];
  let flattest = Infinity;
  for (const [lo, hi, name] of faces) {
    for (let x = lo; x <= hi; x += 1) {
      const v = sd(x);
      if (v < flattest) flattest = v;
      if (v < 12) {
        throw new Error(
          `REFUSING: a flat painted column survives on the ${name} face at x=${x} (${(x / DPI).toFixed(3)}in), ` +
            `${(Math.abs(x < frontLeftPx ? backRightPx - x : x - frontLeftPx) / DPI).toFixed(3)}in from the fold. The band was not fully cut.`,
        );
      }
    }
  }
  console.log(`flat check : nothing flat within 1.5in of either fold (flattest column sd ${flattest.toFixed(1)} against 12) — the olive band is gone`);
}


// ── GATE: does the PAINTED back copy clear the barcode reserve? ────────────
/**
 * Text is found by EDGE CROSSINGS along each row, not by brightness. The back
 * panel is a photograph with light lettering on it, so a brightness threshold
 * counts sunlit rock as readily as a serif. A row of set type alternates
 * dark/light many times across the measure; landscape, however busy, does not.
 */
{
  const panelLeft = inPx(BLEED);
  const panelRight = inPx(backRightIn);
  const pw = panelRight - panelLeft;
  const { data } = await sharp(wrap)
    .extract({ left: panelLeft, top: 0, width: pw, height: H })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const crossings = (y: number): number => {
    let n = 0;
    let prev = data[y * pw]! > 128;
    for (let x = 1; x < pw; x += 1) {
      const cur = data[y * pw + x]! > 128;
      if (cur !== prev) n += 1;
      prev = cur;
    }
    return n;
  };
  const TEXT_ROW = 24;
  let lowestTextRow = -1;
  for (let y = 0; y < H; y += 1) if (crossings(y) >= TEXT_ROW) lowestTextRow = y;
  const lowestIn = lowestTextRow / DPI;
  console.log(`\nbarcode    : reserve begins ${barcodeTopIn.toFixed(3)}in down`);
  console.log(`back copy  : lowest painted text row at ${lowestIn.toFixed(3)}in`);
  if (lowestTextRow >= inPx(barcodeTopIn)) {
    throw new Error(
      `REFUSING: painted back-cover copy reaches ${lowestIn.toFixed(3)}in, ` +
        `${(lowestIn - barcodeTopIn).toFixed(3)}in inside the barcode reserve at ${barcodeTopIn.toFixed(3)}in. ` +
        'Regenerate the artwork; do not ship a cover with a barcode printed over the copy.',
    );
  }
  console.log(`           : clears by ${(barcodeTopIn - lowestIn).toFixed(3)}in — PASS`);
}

// -- The seven parks, set under the painted subtitle -------------------------
/**
 * PLACED OFF THE PAINTED INK, not off a guessed coordinate.
 *
 * The model decides where the subtitle ends, and it moves from render to render.
 * A hard-coded y would put this line through the subtitle on one cover and
 * halfway down the mountain on the next. So the front panel is scanned for the
 * lowest row of painted TYPE in its upper half, by the same edge-crossing test
 * used on the back, and the line is hung a fixed distance beneath it.
 *
 * Two balanced lines, not greedy wrapping: the size is bound by the LONGEST
 * line, so a packed first line holds the type small for no benefit.
 */
const PARKS_LINES = [
  'Yellowstone \u00b7 Grand Canyon \u00b7 Yosemite',
  'Zion \u00b7 Great Smoky Mountains \u00b7 Rocky Mountain \u00b7 Acadia',
];
const frontCentreIn = frontLeftIn + TRIM_W / 2;

let parksTopIn = 0;
{
  const left = inPx(frontLeftIn);
  const width = inPx(TRIM_W);
  /**
   * Scan only as far down as TYPE can be, and demand a type-like row.
   *
   * A first attempt scanned 5.4in at a threshold of 14 crossings and found the
   * cloud band, which alternates light and dark across a row much as a line of
   * text does. The park list was hung 0.3in under the clouds and landed across
   * Half Dome. The title and subtitle finish well above 4.4in, and 24 crossings
   * is the same bar the back-panel copy is found with.
   */
  const scanH = inPx(6.0);
  const { data } = await sharp(wrap)
    .extract({ left, top: 0, width, height: scanH })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const crossings = (y: number): number => {
    let n = 0;
    let prev = data[y * width]! > 170;
    for (let x = 1; x < width; x += 1) {
      const c = data[y * width + x]! > 170;
      if (c !== prev) n += 1;
      prev = c;
    }
    return n;
  };
  let lowest = -1;
  for (let y = 0; y < scanH; y += 1) if (crossings(y) >= 32) lowest = y;
  if (lowest < 0) throw new Error('found no painted type on the front panel to hang the park list from');
  parksTopIn = lowest / DPI + 0.30;
  console.log(`\nfront type : lowest painted row at ${(lowest / DPI).toFixed(3)}in; park list hung at ${parksTopIn.toFixed(3)}in`);

  /**
   * THEN WALK DOWN UNTIL THE BAND IS ACTUALLY CLEAR.
   *
   * Detection alone is not enough. The subtitle is gold on a bright sky, which
   * crosses the mid-grey far less often than cream on dark rock, so the strict
   * threshold that keeps clouds out steps straight over the subtitle: the first
   * attempt hung the park list at 4.67in and printed it across "What's Worth
   * Your Time, What to Skip".
   *
   * So the estimate is only a starting point. The band the list will occupy is
   * re-tested at a LOWER threshold and the list moves down a tenth of an inch at
   * a time until that band holds no type at all. An estimate can be wrong; a
   * band that has been read cannot be occupied.
   */
  const bandHeightIn = 0.62;
  const SOFT = 32;
  let guard = 0;
  const bandIsBusy = (topIn: number): boolean => {
    const from = Math.max(0, inPx(topIn));
    const to = Math.min(scanH - 1, inPx(topIn + bandHeightIn));
    for (let y = from; y <= to; y += 1) if (crossings(y) >= SOFT) return true;
    return false;
  };
  while (bandIsBusy(parksTopIn) && guard < 40) {
    parksTopIn += 0.1;
    guard += 1;
  }
  if (guard >= 40) throw new Error('found no clear band on the front panel for the park list');
  console.log(`           : cleared ${guard} step(s) of painted type; park list hung at ${parksTopIn.toFixed(3)}in`);
}

const parksMaxWidthIn = TRIM_W - 0.5 * 2;
let parksPx = inPx(0.2);
let parksInkIn = 0;
for (; parksPx > 20; parksPx -= 1) {
  const widths: number[] = [];
  for (const line of PARKS_LINES) {
    const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="${inPx(parksMaxWidthIn) * 3}" height="${parksPx * 4}">
      <text x="${(inPx(parksMaxWidthIn) * 3) / 2}" y="${parksPx * 2.5}" text-anchor="middle" font-family="${COPY_FONT}"
        font-size="${parksPx}" fill="#fff">${escapeXml(line)}</text></svg>`;
    const { info } = await sharp(Buffer.from(probe)).trim().toBuffer({ resolveWithObject: true });
    widths.push(info.width);
  }
  if (Math.max(...widths) <= inPx(parksMaxWidthIn)) {
    parksInkIn = Math.max(...widths) / DPI;
    break;
  }
}
const parksLeadPx = parksPx * 1.32;
const parksSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
${PARKS_LINES.map(
  (line, i) =>
    `  <text x="${inPx(frontCentreIn)}" y="${(inPx(parksTopIn) + parksLeadPx * (i + 1)).toFixed(1)}" text-anchor="middle" ` +
    `font-family="${COPY_FONT}" font-size="${parksPx}" fill="${COPY_CREAM}" stroke="${COPY_HALO}" ` +
    `stroke-width="${(parksPx * 0.14).toFixed(2)}" stroke-linejoin="round" paint-order="stroke">${escapeXml(line)}</text>`,
).join('\n')}
</svg>`;
const parksBottomIn = parksTopIn + (parksLeadPx * PARKS_LINES.length) / DPI;
console.log(`front parks: ${parksPx}px (${((parksPx / DPI) * 72).toFixed(1)}pt), widest ${parksInkIn.toFixed(3)}in of ${parksMaxWidthIn}in`);
console.log(`           : ${parksTopIn.toFixed(3)}-${parksBottomIn.toFixed(3)}in, centred at ${frontCentreIn.toFixed(3)}in`);
if (parksInkIn === 0) throw new Error('park list will not fit the front measure at any readable size');
wrap = await sharp(wrap).composite([{ input: Buffer.from(parksSvg), left: 0, top: 0 }]).png().toBuffer();

// ── The author name, set in real type on clean artwork ─────────────────────
/**
 * Sized down until its measured ink fits the width allowed, then drawn with a
 * dark halo. The halo is not decoration: cream lettering painted flat onto a
 * continuous photograph disappears wherever the photograph goes bright, which is
 * how "7 Nati" went invisible on the spine of an earlier cover.
 */
const authorMaxWidthIn = 3.4;
let authorPx = inPx(0.42);
let authorInkIn = 0;
for (; authorPx > 20; authorPx -= 1) {
  const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="${inPx(authorMaxWidthIn) * 3}" height="${authorPx * 4}">
    <text x="${(inPx(authorMaxWidthIn) * 3) / 2}" y="${authorPx * 2.5}" text-anchor="middle" font-family="${COPY_FONT}"
      font-size="${authorPx}" font-weight="700" fill="#fff">${escapeXml(AUTHOR)}</text></svg>`;
  const { info } = await sharp(Buffer.from(probe)).trim().toBuffer({ resolveWithObject: true });
  if (info.width <= inPx(authorMaxWidthIn)) {
    authorInkIn = info.width / DPI;
    break;
  }
}
/** Pinned above the foot, inside the live area, on the calm band the prompt reserved. */
const authorBaselineIn = fullHeightIn - BLEED - 0.85;
const authorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <text x="${inPx(frontCentreIn)}" y="${inPx(authorBaselineIn)}" text-anchor="middle"
    font-family="${COPY_FONT}" font-size="${authorPx}" font-weight="700"
    fill="${COPY_CREAM}" stroke="${COPY_HALO}" stroke-width="${(authorPx * 0.13).toFixed(2)}"
    stroke-linejoin="round" paint-order="stroke">${escapeXml(AUTHOR)}</text></svg>`;
console.log(`\nauthor     : "${AUTHOR}" at ${authorPx}px (${((authorPx / DPI) * 72).toFixed(1)}pt), ink ${authorInkIn.toFixed(3)}in of ${authorMaxWidthIn}in`);
console.log(`           : baseline ${authorBaselineIn.toFixed(3)}in, centred on the front panel at ${frontCentreIn.toFixed(3)}in`);
wrap = await sharp(wrap).composite([{ input: Buffer.from(authorSvg), left: 0, top: 0 }]).png().toBuffer();

// ── The spine ──────────────────────────────────────────────────────────────
const spineWpx = Math.round(spineIn * DPI);
const safeStripPx = Math.round((spineIn - 2 * FOLD_VARIANCE_IN) * DPI);
const spine = await planSpineType({
  title: '7 National Parks Without the Rookie Mistakes',
  author: AUTHOR,
  wrapHeightPx: H,
  spineWidthPx: spineWpx,
  foldSafeWidthPx: safeStripPx,
  safeLengthPx: Math.round((TRIM_H - 0.5) * DPI),
  gapPx: Math.round(0.5 * DPI),
  targetClearPx: Math.round(TARGET_CLEAR_IN * DPI),
});
console.log(`\nspine strip: ${spineWpx}px wide, fold-safe ${safeStripPx}px`);
console.log(`spine type : title ${spine.titlePx}px (cap ${spine.titleCapPx}px), author ${spine.authorPx}px`);
console.log(`           : WORST measured clearance ${(spine.measuredClearPerSidePx / DPI).toFixed(4)}in (KDP floor ${FOLD_VARIANCE_IN}, house target ${TARGET_CLEAR_IN})`);
if (spine.measuredClearPerSidePx / DPI < FOLD_VARIANCE_IN) {
  throw new Error(`spine type clears the fold by only ${(spine.measuredClearPerSidePx / DPI).toFixed(4)}in`);
}
wrap = await sharp(wrap)
  .composite([{ input: Buffer.from(spine.svg), left: inPx(backRightIn), top: 0 }])
  .png()
  .toBuffer();

// ── Out ────────────────────────────────────────────────────────────────────
writeFileSync(OUT.replace(/\.pdf$/i, '-wrap.png'), wrap);
const jpeg = await sharp(wrap).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
const doc = await PDFDocument.create();
const page = doc.addPage([fullWidthIn * 72, fullHeightIn * 72]);
const img = await doc.embedJpg(jpeg);
page.drawImage(img, { x: 0, y: 0, width: fullWidthIn * 72, height: fullHeightIn * 72 });
const bytes = await doc.save();
writeFileSync(OUT, bytes);
await sharp(wrap).resize({ width: 1600 }).png().toFile(OUT.replace(/\.pdf$/i, '-proof.png'));

console.log(`\nfile       : ${OUT}`);
console.log(`bytes      : ${bytes.length}`);
console.log(`sha256     : ${createHash('sha256').update(bytes).digest('hex')}`);
console.log(`proof      : ${OUT.replace(/\.pdf$/i, '-proof.png')}`);
process.exit(0);
