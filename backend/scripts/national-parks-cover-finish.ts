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
const SPINE_END_INSET_IN = 0.7;

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
 * one here: it crops 0.68in from each side, and the painting sets the title
 * closer to the edge than that. An early attempt at this cover sliced the last
 * letters off "7 NATIONAL PARKS" for exactly that reason.
 *
 * So the art is scaled less, cropped less, and the residual height made up by
 * stretching the TOP band, which is sky across the whole wrap. The bottom is
 * never stretched: it holds the foreground rock and the author's name, and
 * smearing a recognisable object is worse than any margin gained.
 *
 * PASS THE ART PRE-ENHANCED AND CALL THIS WITH --scale=1. The approved painting
 * is 1536 x 1024 and the wrap is 3756 x 2775, so it has to be resampled upward
 * whatever happens. Doing it here as well as in the enhancer would resample it
 * twice and throw away what the enhancer just recovered.
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

/**
 * GATE: IS THIS THE APPROVED PAINTING?
 *
 * There are two paintings for this cover and only one was approved. The
 * superseded one has a flat olive band down the middle of it, painted as a
 * spine back when green was the accent colour of the title and author panels.
 * The approved one is a single continuous photograph with no band at all.
 *
 * They are the same size and they look alike in a thumbnail, and a whole cover
 * was built off the wrong one already. A flat field is trivial to tell from a
 * photograph — it barely varies down its height where a photograph varies a
 * great deal — so this refuses rather than let it happen twice.
 */
{
  const { data, info } = await sharp(ART).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ys: number[] = [];
  for (let y = 2; y < native.height! - 2; y += 2) ys.push(y);
  const sd = (x: number): number => {
    const l = ys.map((y) => {
      const i = (y * info.width + x) * info.channels;
      return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    });
    const m = l.reduce((acc, v) => acc + v, 0) / l.length;
    return Math.sqrt(l.reduce((acc, v) => acc + (v - m) ** 2, 0) / l.length);
  };
  const c = Math.round(native.width! / 2);
  const v = sd(c);
  if (v < 12) {
    let a = c;
    while (a - 1 >= 0 && sd(a - 1) < 12) a -= 1;
    let b = c;
    while (b + 1 < native.width! && sd(b + 1) < 12) b += 1;
    throw new Error(
      `REFUSING: this artwork has a flat painted band ${b - a + 1}px wide down its middle (art x ${a}..${b}). ` +
        'That is the SUPERSEDED painting with the olive spine stripe, not the approved one. ' +
        'Use 7-NATIONAL-PARKS-COVER-EDIT\\APPROVED-ART_v2.png.',
    );
  }
  console.log(`source     : continuous across the spine (centre column varies by ${v.toFixed(1)}, a flat band would be under 12) — this is the approved painting`);
}

/**
 * WHERE THE MISSING HEIGHT IS ADDED, and why it is a real decision.
 *
 * The painting is 1.500 wide to 1, the wrap is 1.354 to 1, so once the width
 * is covered the picture is 0.663in short of the height. That 0.663in has to
 * come from somewhere, and where it goes moves everything else.
 *
 *   top    the established fit: stretch the SKY band upward. Nothing
 *          recognisable is smeared, but every painted element sits 0.663in
 *          LOWER on the wrap, which is what drops the last back-cover
 *          paragraph into the barcode reserve.
 *
 *   bottom stretch the FOREGROUND band downward instead. Every painted
 *          element keeps its own place and the whole picture sits 0.663in
 *          higher, which lifts the copy clear of the barcode. The cost is
 *          that the bottom band of rock is stretched.
 *
 * Neither is free. The default stays TOP because that is the established fit
 * for this edition; BOTTOM exists so the barcode collision can be fixed
 * without moving a single painted element.
 */
const FILL = (process.argv.find((a) => a.startsWith('--fill=')) ?? '--fill=top').split('=')[1];
if (FILL !== 'top' && FILL !== 'bottom') throw new Error('--fill must be top or bottom');
console.log(`fill       : the missing ${skyStretch}px (${(skyStretch / DPI).toFixed(3)}in) is stretched into the ${FILL.toUpperCase()} band`);
/** At scale 1 the art is already at working size: crop it, do not resample it again. */
const fitted = scale === 1 ? sharp(ART) : sharp(ART).resize(scaledW, scaledH, { kernel: 'lanczos3' });
const body = await fitted.extract({ left: sideCrop, top: 0, width: W, height: scaledH }).toBuffer();
let wrap = FILL === 'top'
  ? await extendSkyUpward(body, W, scaledH, H)
  : await (async () => {
      /**
       * The mirror of extendSkyUpward, with the band placed BELOW EVERY PAINTED
       * ELEMENT rather than at an arbitrary half way.
       *
       * A band at 50% runs straight through the back-cover copy, so the copy is
       * stretched along with everything else in it and barely rises at all: the
       * first attempt at this moved it 0.11in of the 0.66in that was needed. The
       * band has to start under the last line of type on either panel. Then every
       * painted element keeps its exact position in the picture and the whole
       * block of them sits 0.663in higher on the wrap, which is what lifts the
       * back copy out of the barcode reserve without moving one of them.
       *
       * The lowest type is FOUND, not assumed, by the same edge-crossing test the
       * barcode gate uses: a row of set type flips dark-to-light many times across
       * the measure, a photograph does not.
       */
      const g = await sharp(body).greyscale().raw().toBuffer();
      let lowestType = -1;
      for (let y = 0; y < scaledH; y += 1) {
        let n = 0;
        let prev = g[y * W]! > 128;
        for (let x = 1; x < W; x += 1) {
          const cur = g[y * W + x]! > 128;
          if (cur !== prev) n += 1;
          prev = cur;
        }
        if (n >= 24) lowestType = y;
      }
      if (lowestType < 0) throw new Error('found no painted type at all; refusing to guess where the ground band starts');
      const band = Math.min(scaledH - 8, lowestType + 24);
      const stretched = scaledH - band + skyStretch;
      console.log(`ground band: lowest painted type at ${lowestType}px (${(lowestType / DPI).toFixed(3)}in); band ${band}..${scaledH} stretched ${scaledH - band} -> ${stretched}px (x${(stretched / (scaledH - band)).toFixed(2)})`);
      const keep = await sharp(body).extract({ left: 0, top: 0, width: W, height: band }).toBuffer();
      const ground = await sharp(body)
        .extract({ left: 0, top: band, width: W, height: scaledH - band })
        .resize(W, stretched, { fit: 'fill', kernel: 'lanczos3' })
        .toBuffer();
      return sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
        .composite([{ input: keep, left: 0, top: 0 }, { input: ground, left: 0, top: band }])
        .png()
        .toBuffer();
    })();


// ── GATE: does the PAINTED back copy clear the barcode reserve? ────────────
/**
 * Text is found by EDGE CROSSINGS along each row, not by brightness. The back
 * panel is a photograph with light lettering on it, so a brightness threshold
 * counts sunlit rock as readily as a serif. A row of set type alternates
 * dark/light many times across the measure; landscape, however busy, does not.
 */
{
  /**
   * THE RESERVE IS A RECTANGLE, NOT A HORIZONTAL LINE.
   *
   * KDP keeps a 2.0 x 1.2in box in the BOTTOM RIGHT of the back cover and prints
   * the barcode into it. It does not touch the rest of the panel. An earlier
   * version of this gate tested every row of the full panel width and refused
   * any type at all below the top of that box, which condemned a cover whose
   * only offence was a four-word last line sitting on the far LEFT, a clear
   * two inches from the barcode. The test is now the box itself.
   *
   * Text is still found by EDGE CROSSINGS rather than brightness: the back panel
   * is a photograph with light lettering on it, so a brightness threshold counts
   * sunlit rock as readily as a serif. A row of set type flips dark-to-light many
   * times across the measure; landscape, however busy, does not.
   */
  const boxLeft = inPx(backRightIn - BARCODE_CLEAR - 2.0);
  const boxRight = inPx(backRightIn - BARCODE_CLEAR);
  const boxTop = inPx(barcodeTopIn);
  const boxBottom = inPx(fullHeightIn - BLEED - BARCODE_CLEAR);
  const TEXT_ROW = 24;

  const scan = async (left: number, width: number, from: number, to: number): Promise<{ lowest: number; worst: number }> => {
    const { data } = await sharp(wrap)
      .extract({ left, top: 0, width, height: H })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let lowest = -1;
    let worst = 0;
    for (let y = from; y <= to; y += 1) {
      let n = 0;
      let prev = data[y * width]! > 128;
      for (let x = 1; x < width; x += 1) {
        const cur = data[y * width + x]! > 128;
        if (cur !== prev) n += 1;
        prev = cur;
      }
      if (n > worst) worst = n;
      if (n >= TEXT_ROW) lowest = y;
    }
    return { lowest, worst };
  };

  const panel = await scan(inPx(BLEED), inPx(backRightIn) - inPx(BLEED), 0, H - 1);
  const box = await scan(boxLeft, boxRight - boxLeft, boxTop, boxBottom);

  console.log(`\nbarcode    : KDP reserves ${((boxRight - boxLeft) / DPI).toFixed(2)} x ${((boxBottom - boxTop) / DPI).toFixed(2)}in at ${(boxLeft / DPI).toFixed(3)}-${(boxRight / DPI).toFixed(3)}in across, ${(boxTop / DPI).toFixed(3)}-${(boxBottom / DPI).toFixed(3)}in down`);
  console.log(`back copy  : lowest painted text row on the panel at ${(panel.lowest / DPI).toFixed(3)}in`);
  if (panel.lowest >= boxTop) {
    console.log(`           : that is below the top of the reserve, but the reserve is a box — checking inside it`);
  }
  console.log(`in the box : busiest row reads ${box.worst} crossings (set type reads ${TEXT_ROW} or more)`);
  /**
   * --barcode=warn produces a REVIEW copy of a cover that fails this gate, so the
   * collision can be looked at instead of described. It is never the default and
   * it never means the cover is shippable.
   */
  const BARCODE_MODE = (process.argv.find((a) => a.startsWith('--barcode=')) ?? '--barcode=refuse').split('=')[1];
  if (box.worst >= TEXT_ROW && BARCODE_MODE === 'warn') {
    console.log(`           : *** REVIEW COPY ONLY — painted copy runs into the barcode box (${box.worst} crossings at ${(box.lowest / DPI).toFixed(3)}in). NOT SHIPPABLE. ***`);
  } else if (box.worst >= TEXT_ROW) {
    throw new Error(
      `REFUSING: painted copy runs into KDP's barcode box (${box.worst} crossings at ${(box.lowest / DPI).toFixed(3)}in, inside ` +
        `${(boxLeft / DPI).toFixed(3)}-${(boxRight / DPI).toFixed(3)}in across and ${(boxTop / DPI).toFixed(3)}-${(boxBottom / DPI).toFixed(3)}in down). ` +
        'Amazon prints the barcode straight over those words. Do not ship this.',
    );
  }
  if (box.worst < TEXT_ROW) console.log(`           : the barcode box holds no type — PASS`);
}

/** The front panel centre, used by anything set on the front. */
const frontCentreIn = frontLeftIn + TRIM_W / 2;

/**
 * WHAT THE APPROVED PAINTING ALREADY CARRIES IS NOT SET AGAIN.
 *
 * The approved artwork carries its own author name, in its own panel, in the
 * composition that was signed off. Setting the name a second time at the foot
 * of the front panel would print it twice. The park list is not in the approved
 * composition at all, so adding it would be a redesign.
 *
 * Both are kept behind flags rather than deleted, because a later artwork may
 * arrive without them. They are OFF by default: the default has to match the
 * approved painting, so a run with no flags cannot silently double a name.
 */
const SET_PARKS = process.argv.includes('--set-parks');
const SET_AUTHOR = process.argv.includes('--set-author');

if (SET_PARKS) {
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
} else {
  console.log(`
front parks: not set — the approved composition carries no park list (--set-parks to add one)`);
}

if (SET_AUTHOR) {
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
  
} else {
  console.log(`author     : not set here — "${AUTHOR}" is already painted on the approved front panel (--set-author to set it in type)`);
}

// ── The spine ──────────────────────────────────────────────────────────────
const spineWpx = Math.round(spineIn * DPI);
const safeStripPx = Math.round((spineIn - 2 * FOLD_VARIANCE_IN) * DPI);
const spine = await planSpineType({
  title: '7 National Parks Without the Rookie Mistakes',
  author: AUTHOR,
  wrapHeightPx: H,
  spineWidthPx: spineWpx,
  foldSafeWidthPx: safeStripPx,
  /**
   * HOW FAR IN FROM THE HEAD AND THE FOOT THE TYPE STARTS.
   *
   * The planner hangs the author name on the bottom end of this run, so this
   * number IS the author name's foot margin. It was 0.25in, which is the bare
   * KDP safe margin and nothing more: the name sat right on the limit, and KDP
   * trims with variance, so it read as about to be shaved off the bottom.
   * 0.7in is a foot margin a printed spine actually has. The head end is inset
   * by the same amount so the two lines stay balanced on the run.
   */
  safeLengthPx: Math.round((TRIM_H - 2 * SPINE_END_INSET_IN) * DPI),
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
