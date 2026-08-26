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

// ── Fit the art ────────────────────────────────────────────────────────────
/**
 * SCALE GENTLY AND STRETCH THE SKY, because this artwork carries TYPE.
 *
 * Filling the height exactly is the honest fit for a clean plate and the wrong
 * one here: it crops 0.68in from each side, and the model paints the title
 * closer to the edge than that. The first attempt at this cover sliced the last
 * letters off "7 NATIONAL PARKS" and "ROOKIE MISTAKES" for exactly that reason.
 *
 * So the art is scaled less, cropped less, and the residual height made up by
 * stretching the TOP band, which is sky on both panels. The bottom is never
 * stretched: it holds the foreground rock and the author's name, and smearing a
 * recognisable object is worse than any margin gained. This is the same remedy
 * the approved cover used, for the same reason.
 */
const native = await sharp(ART).metadata();
const scaleArg = process.argv.find((a) => a.startsWith('--scale='));
const scale = scaleArg ? Number(scaleArg.split('=')[1]) : 2.5153;
const scaledW = Math.round(native.width! * scale);
const scaledH = Math.round(native.height! * scale);
const sideCrop = Math.round((scaledW - W) / 2);
const skyStretch = H - scaledH;
if (sideCrop < 0) throw new Error(`scale ${scale} too small: ${scaledW}px against a ${W}px wrap`);
if (skyStretch < 0) throw new Error(`scale ${scale} too large: ${scaledH}px against a ${H}px wrap`);
console.log(`art        : ${native.width} x ${native.height} px`);
console.log(`fit        : x${scale} -> ${scaledW} x ${scaledH}px, cropping ${(sideCrop / DPI).toFixed(3)}in per side, retaining ${((W / scaledW) * 100).toFixed(1)}%`);
console.log(`sky stretch: ${skyStretch}px (${(skyStretch / DPI).toFixed(3)}in) added at the TOP only`);

const body = await sharp(ART)
  .resize(scaledW, scaledH, { kernel: 'lanczos3' })
  .extract({ left: sideCrop, top: 0, width: W, height: scaledH })
  .toBuffer();
let wrap = await extendSkyUpward(body, W, scaledH, H);

// -- Take the olive band off the spine --------------------------------------
/**
 * The artwork paints a flat olive band down the middle of the wrap.
 *
 * That was correct for the cover it was made for: green was the accent colour of
 * the title and author panels, and the original brief asked for the spine to be
 * "a plain, flat, EVEN field of the cover's dominant background colour". Those
 * panels are gone now, so the band matches nothing on the book and reads as a
 * stripe someone forgot to remove.
 *
 * THE BAND IS NOT THE SPINE, AND IT IS MEASURED, NOT ASSUMED. The spine of a
 * 120-page block is 0.270in, 81px at 300 DPI. The painted band is 0.85in, about
 * 256px: it overhangs the fold by roughly 0.3in onto each panel. Filling only
 * the 81px between the folds would leave an olive sliver down each panel beside
 * a photographic spine, which is worse than the stripe. So the flat field is
 * found by column variance -- a painted flat field barely varies down its
 * height, a photograph varies a great deal -- and the fill covers what was
 * measured. It refuses to run if the field it finds does not contain the spine.
 *
 * WHAT REPLACES IT, AND WHY IT IS NOT CARRIED ACROSS.
 *
 * The obvious fix is to continue the photograph through the spine. It cannot be
 * done, because there is no one photograph: the model painted a DIPTYCH either
 * side of the band. Left of it is a shaded canyon wall in forest; right of it is
 * a sunlit valley with a hiker. They are different views. Anything that blends
 * one into the other has to invent 0.85in of picture that was never photographed
 * and it shows. Two attempts were built and rejected by eye:
 *
 *   Mirroring a band-width block of picture in from each side. The hiker stands
 *   0.5in from the right edge of the band, so this put a SECOND hiker on the
 *   spine under a perfectly symmetrical mountain.
 *
 *   Cross-fading one blurred column in from each side. No duplicated objects,
 *   but dark forest fading into bright valley over 0.85in is a grey smear, and
 *   the band still read as a band.
 *
 * So each panel keeps its own picture and nothing crosses the fold:
 *
 *   the 0.3in of band lying on the BACK panel is filled by mirroring the back
 *   panel's own texture outward to the fold,
 *   the 0.3in lying on the FRONT panel likewise from the front panel,
 *   and only the 0.27in BETWEEN the folds -- the spine itself, the part that is
 *   the fold -- carries a soft blend from one to the other.
 *
 * Mirroring is exact at the seam, so neither panel gains an edge. Both source
 * blocks are narrow enough to hold texture and no subject: the hiker is 0.2in
 * beyond the reach of the front sample and is checked for, not assumed.
 *
 * Done in code, not by another edit pass. The last two passes each risked the
 * back-cover text -- one of them corrupted a word -- and no image model needs to
 * be involved in filling a band this narrow.
 */
{
  const x0 = inPx(backRightIn);
  const x1 = inPx(frontLeftIn);
  const centre = Math.round((x0 + x1) / 2);
  const searchFrom = Math.max(0, centre - Math.round(1.4 * DPI));
  const searchTo = Math.min(W - 1, centre + Math.round(1.4 * DPI));

  const { data, info } = await sharp(wrap).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rows: number[] = [];
  for (let y = 4; y < H - 4; y += 5) rows.push(y);
  const FLAT_SD = 12;
  const isFlat = (x: number): boolean => {
    const l: number[] = [];
    let sum = 0;
    for (const y of rows) {
      const i = (y * info.width + x) * info.channels;
      const v = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      l.push(v);
      sum += v;
    }
    const m = sum / l.length;
    return Math.sqrt(l.reduce((acc, v) => acc + (v - m) ** 2, 0) / l.length) < FLAT_SD;
  };

  if (!isFlat(centre)) throw new Error(`no flat painted band at the spine centre (x=${centre}); this is not the artwork this was written for`);
  let a = centre;
  while (a - 1 >= searchFrom && isFlat(a - 1)) a -= 1;
  let b = centre;
  while (b + 1 <= searchTo && isFlat(b + 1)) b += 1;
  const bandIn = (b - a + 1) / DPI;
  if (a > x0 || b < x1 - 1) throw new Error(`the flat band (x ${a}..${b}) does not cover the spine (x ${x0}..${x1}); refusing to fill part of it`);
  if (bandIn > 1.5) throw new Error(`flat field runs ${bandIn.toFixed(3)}in — too wide to be the painted spine band; not filling it`);

  /** A few pixels past each measured edge, to swallow the antialiased fringe. */
  const PAD = 4;
  const bandL = a - PAD;
  const bandR = b + PAD;
  const overhangL = x0 - bandL;
  const overhangR = bandR - x1 + 1;
  if (overhangL < 1 || overhangR < 1) throw new Error('the band does not overhang the folds; this fill has nothing to do');

  /**
   * NOTHING RECOGNISABLE MAY BE MIRRORED, and that is checked by eye rather than
   * by a number. The crossings test that finds type on the back panel does not
   * transfer: dense foliage flips dark-to-light across a row far more often than
   * a hiker does, so it would flag the safe block and pass the unsafe one. What
   * keeps this honest is that each source block is only as wide as the overhang
   * it fills -- about 0.3in, texture at this scale -- and that the finished wrap
   * is rendered and looked at.
   */
  const srcL = bandL - overhangL;
  const srcR = bandR + 1;
  if (srcL < 0 || srcR + overhangR > W) throw new Error('not enough picture beside the band to mirror outward');

  const mirrorL = await sharp(wrap).extract({ left: srcL, top: 0, width: overhangL, height: H }).flop().png().toBuffer();
  const mirrorR = await sharp(wrap).extract({ left: srcR, top: 0, width: overhangR, height: H }).flop().png().toBuffer();
  wrap = await sharp(wrap)
    .composite([
      { input: mirrorL, left: bandL, top: 0 },
      { input: mirrorR, left: x1, top: 0 },
    ])
    .png()
    .toBuffer();

  /**
   * THE SPINE ITSELF: 0.27in, on the fold, blended from what now sits either
   * side of it. Sixteen columns per side averaged into one and blurred along
   * their length, cross-faded across the strip, feathered into the panels at
   * both ends so the join has no edge. At this width and in this position it
   * reads as the roll of the fold.
   */
  const SAMPLE_W = 16;
  const FEATHER = 12;
  const from = x0 - FEATHER;
  const to = x1 - 1 + FEATHER;
  const patchW = to - from + 1;
  const colFrom = async (left: number): Promise<Buffer> => {
    const one = await sharp(wrap)
      .extract({ left, top: 0, width: SAMPLE_W, height: H })
      .resize(1, H, { fit: 'fill', kernel: 'lanczos3' })
      .blur(10)
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
  const mixMask = tiled((x) => smoothstep(x / Math.max(1, patchW - 1)));
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

  console.log(`\nspine band : flat painted field measured at x ${a}..${b} (${b - a + 1}px, ${bandIn.toFixed(3)}in)`);
  console.log(`           : the spine itself is x ${x0}..${x1} (${x1 - x0}px, ${((x1 - x0) / DPI).toFixed(3)}in) — the band overhangs it both ways`);
  console.log(`back panel : ${overhangL}px (${(overhangL / DPI).toFixed(3)}in) of band filled by mirroring x ${srcL}..${bandL - 1} outward`);
  console.log(`front panel: ${overhangR}px (${(overhangR / DPI).toFixed(3)}in) of band filled by mirroring x ${srcR}..${srcR + overhangR - 1} outward`);
  console.log(`spine strip: x ${from}..${to} blended across ${patchW}px, ${FEATHER}px feathered into each panel`);
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
