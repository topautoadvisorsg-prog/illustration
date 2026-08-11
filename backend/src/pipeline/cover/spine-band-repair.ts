/**
 * SPINE BAND REPAIR — rebuild a wrongly-painted spine band deterministically.
 *
 * The image model does not paint the spine where the spine is. On NO ONE TOLD ME
 * THAT it drew a band 90px wide, centred 15px left of the real one, when the
 * physical spine is 46px:
 *
 *     painted fold lines   x 708 .. 798   (90px)
 *     true spine           x 745 .. 791   (46px)
 *
 * So ~37px of "spine" — fake fold shadow, and mirrored duplicate lettering — sits
 * on the BACK COVER, and ~7px on the front. Repairing only the true spine leaves
 * that garbage on the panels, where it prints.
 *
 * This repairs the whole painted band as THREE regions, each rebuilt from the
 * material that actually belongs there:
 *
 *     [bandX0 .. spineX0)   native BACK-cover background
 *     [spineX0 .. spineX1)  native SPINE background
 *     [spineX1 .. bandX1)   native FRONT-cover background
 *
 * ─── WHY COLUMNS ARE COPIED ROW BY ROW ────────────────────────────────────────
 *
 * Never a sampled "average colour". These panels are not flat: this cover has a
 * cobalt field over an orange desk that runs across the bottom fifth, plus paper
 * grain throughout. A flat fill matched to the mean reads as a patch the moment
 * it meets grain, and would cut the desk in half.
 *
 * Instead every replacement pixel is a REAL pixel taken from the same ROW of a
 * clean neighbouring column range. Same row means the same horizontal structure:
 * the desk stays the desk, the grain stays grain, any gradient stays continuous.
 * The only thing that changes is which columns carry the old lettering.
 */
import sharp from 'sharp';

export interface Rgb { r: number; g: number; b: number }

export interface SpineBandRepairInput {
  /** The approved artwork. Nothing outside the band may change. */
  art: Buffer;
  /** The wrongly-painted band, measured from the artwork. */
  bandX0: number;
  bandX1: number;
  /** The TRUE spine, from the geometry engine. Must sit inside the band. */
  spineX0: number;
  spineX1: number;
  title: string;
  author: string;
  /** Font family available to the renderer. Vendored Archivo by default. */
  fontFamily?: string;
  /** Override the lifted ink colours when the artwork's own are unreliable. */
  creamSample?: Rgb;
  orangeSample?: Rgb;
  /** How far the painted fold shadow bleeds beyond the band. Default 14px. */
  shadowMarginPx?: number;
}

export interface SpineBandRepairReport {
  bandX0: number;
  bandX1: number;
  spineX0: number;
  spineX1: number;
  backFillPx: number;
  frontFillPx: number;
  backSource: [number, number];
  frontSource: [number, number];
  spineCleanRunRows: number;
  /** Rows where no clean source window existed and the edge column was extended. */
  backFallbackRows: number;
  frontFallbackRows: number;
  titleHex: string;
  authorHex: string;
  titlePx: number;
  authorPx: number;
  /** Pixels differing outside the band. Must be 0. */
  pixelsChangedOutsideBand: number;
}

const hex = (c: Rgb): string =>
  '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

const lumaOf = (d: Buffer, w: number, ch: number, x: number, y: number): number => {
  const i = (y * w + x) * ch;
  return 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
};

/**
 * Fill a column range with panel material, choosing the source PER ROW.
 *
 * A fixed source strip is not safe. The first attempt copied the 37px
 * immediately left of the band and imported the corner of the notebook that sits
 * there, so the back cover printed the notebook twice. Whether a strip is usable
 * depends entirely on which row you are on: the same x range is empty cobalt at
 * the top of the cover and a drawn object near the desk.
 *
 * So for every row, several candidate windows are scored against the colour of
 * the columns immediately beside the band — the material that must be continued
 * — and the flattest, closest match wins. When no candidate is clean (the row
 * crosses an object everywhere nearby) the row falls back to extending its own
 * edge column, which cannot introduce an object that was not already there.
 */
function fillFromPanelPerRow(
  data: Buffer,
  w: number,
  h: number,
  ch: number,
  dstX0: number,
  width: number,
  /** Direction to search for source material: -1 = leftwards, +1 = rightwards. */
  dir: -1 | 1,
  /** First source column, already clear of the band and its fold shadow. */
  searchFrom: number,
  /** How far the painted fold shadow bleeds beyond the band on this side. */
  shadowMarginPx: number,
): { fallbackRows: number } {
  const CANDIDATES = 4;
  let fallbackRows = 0;

  // The reference column is the material the fill must continue — but NOT the
  // pixel immediately beside the fill. The model painted a hard fold shadow that
  // bleeds a few pixels PAST the band, so the adjacent column is nearly black.
  // Referencing it made the fallback replicate that shadow into a 37px black
  // stripe: the repair reproduced the very defect it was removing.
  const refX = dir === -1 ? dstX0 - 1 - shadowMarginPx : dstX0 + width + shadowMarginPx;

  for (let y = 0; y < h; y++) {
    const ri = (y * w + Math.min(w - 1, Math.max(0, refX))) * ch;
    const ref = { r: data[ri]!, g: data[ri + 1]!, b: data[ri + 2]! };

    let best: { x0: number; score: number } | null = null;
    for (let k = 0; k < CANDIDATES; k++) {
      const x0 = dir === -1 ? searchFrom - k * width : searchFrom + k * width;
      if (x0 < 0 || x0 + width > w) continue;
      // Score = how far this window drifts from the reference colour, plus how
      // much it varies inside itself. An object edge scores badly on both.
      let drift = 0, variance = 0;
      let mr = 0, mg = 0, mb = 0;
      for (let i = 0; i < width; i++) {
        const si = (y * w + x0 + i) * ch;
        mr += data[si]!; mg += data[si + 1]!; mb += data[si + 2]!;
      }
      mr /= width; mg /= width; mb /= width;
      for (let i = 0; i < width; i++) {
        const si = (y * w + x0 + i) * ch;
        variance += Math.abs(data[si]! - mr) + Math.abs(data[si + 1]! - mg) + Math.abs(data[si + 2]! - mb);
      }
      variance /= width;
      drift = Math.abs(mr - ref.r) + Math.abs(mg - ref.g) + Math.abs(mb - ref.b);
      const score = drift * 2 + variance;
      if (!best || score < best.score) best = { x0, score };
    }

    // Threshold tuned to "this window is the same flat material as the edge".
    if (best && best.score < 90) {
      for (let i = 0; i < width; i++) {
        // Mirror, so the join with untouched artwork continues rather than
        // restarting the same sequence.
        const sx = best.x0 + (dir === -1 ? width - 1 - i : width - 1 - i);
        const si = (y * w + sx) * ch;
        const di = (y * w + dstX0 + i) * ch;
        for (let c = 0; c < ch; c++) data[di + c] = data[si + c]!;
      }
    } else {
      fallbackRows++;
      for (let i = 0; i < width; i++) {
        const di = (y * w + dstX0 + i) * ch;
        for (let c = 0; c < ch; c++) data[di + c] = data[ri + c]!;
      }
    }
  }
  return { fallbackRows };
}

/**
 * Erase a thin vertical line by interpolating across it, row by row.
 *
 * For the case where the model leaves the spine FIELD clean but still draws fold
 * lines it was told not to draw. Those lines are a few pixels wide on flat
 * colour, so the honest repair is the smallest one: bridge each row between the
 * untouched pixel on either side.
 *
 * Rebuilding a wide band instead is what produced visible smearing — 188 of 1024
 * rows had no clean source window near the sneaker and fell back to extending an
 * edge column, which reads as horizontal streaking. Touching 12px cannot streak.
 */
export function removeVerticalLine(
  data: Buffer, w: number, h: number, ch: number, x0: number, x1: number,
): void {
  const left = x0 - 1;
  const right = x1 + 1;
  if (left < 0 || right >= w) throw new Error('line to remove touches the image edge');
  const span = right - left;
  for (let y = 0; y < h; y++) {
    const li = (y * w + left) * ch;
    const ri = (y * w + right) * ch;
    for (let x = x0; x <= x1; x++) {
      const t = (x - left) / span;
      const di = (y * w + x) * ch;
      for (let c = 0; c < ch; c++) {
        data[di + c] = Math.round(data[li + c]! * (1 - t) + data[ri + c]! * t);
      }
    }
  }
}

/** Mean colour of a rectangle, for lifting a known-good ink colour. */
function meanColour(
  data: Buffer, w: number, ch: number,
  x0: number, y0: number, x1: number, y1: number,
  predicate: (r: number, g: number, b: number) => boolean,
): Rgb | null {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * ch;
      const R = data[i]!, G = data[i + 1]!, B = data[i + 2]!;
      if (predicate(R, G, B)) { r += R; g += G; b += B; n++; }
    }
  }
  return n > 60 ? { r: r / n, g: g / n, b: b / n } : null;
}

/**
 * Rebuild the spine's own background from its longest run of strictly-clean rows.
 *
 * Same reasoning as the existing spine typesetter: replace EVERY row, because a
 * row carrying a thin slice of a letter passes a per-row "is this inky" test and
 * then gets copied elsewhere, smearing the old lettering. Tiles are flipped on
 * alternate repeats so the repeat has no visible period.
 */
function rebuildSpineBackground(
  data: Buffer,
  w: number,
  h: number,
  ch: number,
  x0: number,
  width: number,
): { cleanRun: number; bgLuma: number } {
  const all: number[] = [];
  for (let y = 0; y < h; y++) for (let x = x0; x < x0 + width; x++) all.push(lumaOf(data, w, ch, x, y));
  const sorted = [...all].sort((a, b) => a - b);
  const bgLuma = sorted[Math.floor(sorted.length / 2)]!;
  const spread = Math.max(18, (sorted[Math.floor(sorted.length * 0.98)]! - bgLuma) * 0.35);

  const isClean: boolean[] = [];
  for (let y = 0; y < h; y++) {
    let maxDev = 0;
    for (let x = x0; x < x0 + width; x++) {
      const dev = Math.abs(lumaOf(data, w, ch, x, y) - bgLuma);
      if (dev > maxDev) maxDev = dev;
    }
    isClean.push(maxDev <= spread * 0.6);
  }

  let bestStart = -1, bestLen = 0, cur = -1;
  for (let y = 0; y <= h; y++) {
    const clean = y < h && isClean[y];
    if (clean && cur < 0) cur = y;
    if (!clean && cur >= 0) {
      if (y - cur > bestLen) { bestLen = y - cur; bestStart = cur; }
      cur = -1;
    }
  }
  if (bestLen < 4) throw new Error('spine has no clean run of rows to rebuild its background from');

  // Snapshot the clean run before overwriting, or tiles start sourcing rows this
  // very loop has already replaced.
  const run: Buffer[] = [];
  for (let i = 0; i < bestLen; i++) {
    const y = bestStart + i;
    const row = Buffer.alloc(width * ch);
    for (let k = 0; k < width; k++) {
      const si = (y * w + x0 + k) * ch;
      for (let c = 0; c < ch; c++) row[k * ch + c] = data[si + c]!;
    }
    run.push(row);
  }

  for (let y = 0; y < h; y++) {
    const cycle = Math.floor(y / bestLen);
    const off = y % bestLen;
    const row = run[cycle % 2 === 0 ? off : bestLen - 1 - off]!;
    for (let k = 0; k < width; k++) {
      const di = (y * w + x0 + k) * ch;
      for (let c = 0; c < ch; c++) data[di + c] = row[k * ch + c]!;
    }
  }
  return { cleanRun: bestLen, bgLuma };
}

/** Mean colour of pixels that read as ink within a column range. */
function inkColour(
  data: Buffer, w: number, h: number, ch: number,
  x0: number, width: number, bgLuma: number, yFrom: number, yTo: number,
): Rgb | null {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = yFrom; y < yTo; y++) {
    for (let x = x0; x < x0 + width; x++) {
      const i = (y * w + x) * ch;
      if (Math.abs(lumaOf(data, w, ch, x, y) - bgLuma) > 30) {
        r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; n++;
      }
    }
  }
  return n > 40 ? { r: r / n, g: g / n, b: b / n } : null;
}

/** Spine type, rotated to read top-to-bottom as every book spine does. */
function spineTypeSvg(o: {
  widthPx: number; heightPx: number; title: string; author: string;
  titleHex: string; authorHex: string; titlePx: number; authorPx: number; fontFamily: string;
}): string {
  const L = o.heightPx;
  const W = o.widthPx;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Inside the rotated group the spine reads as a long, short canvas: length on
  // x, spine width on y. Title toward the head, author toward the foot.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${L}">
  <g transform="rotate(90) translate(0, -${W})">
    <text x="${Math.round(L * 0.08)}" y="${Math.round(W * 0.5)}"
          font-family="${o.fontFamily}" font-weight="800" font-size="${o.titlePx}"
          fill="${o.titleHex}" letter-spacing="${(o.titlePx * 0.03).toFixed(2)}"
          dominant-baseline="central" text-anchor="start">${esc(o.title)}</text>
    <text x="${Math.round(L * 0.92)}" y="${Math.round(W * 0.5)}"
          font-family="${o.fontFamily}" font-weight="600" font-size="${o.authorPx}"
          fill="${o.authorHex}" letter-spacing="${(o.authorPx * 0.06).toFixed(2)}"
          dominant-baseline="central" text-anchor="end">${esc(o.author)}</text>
  </g>
</svg>`;
}

export async function repairSpineBand(
  input: SpineBandRepairInput,
): Promise<{ png: Buffer; report: SpineBandRepairReport }> {
  const { bandX0, bandX1, spineX0, spineX1 } = input;
  if (!(bandX0 <= spineX0 && spineX1 <= bandX1)) {
    throw new Error('the true spine must sit inside the painted band');
  }

  const src = sharp(input.art).removeAlpha();
  const meta = await src.metadata();
  const w = meta.width!;
  const h = meta.height!;
  const { data, info } = await src.raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;

  const backW = spineX0 - bandX0;
  const frontW = bandX1 - spineX1;
  const spineW = spineX1 - spineX0;

  // Sources sit clear of the band AND clear of the painted fold shadow that
  // bleeds a few pixels outside it. Taking the strip immediately adjacent would
  // copy the very shadow being removed.
  const GAP = 12;
  const backSrcX0 = bandX0 - GAP - backW;
  const frontSrcX0 = bandX1 + GAP;
  if (backSrcX0 < 0 || frontSrcX0 + frontW > w) {
    throw new Error('not enough clean panel either side of the band to source background from');
  }

  // Lift the ink colours from the FRONT COVER, not from the spine.
  //
  // The spine's own lettering is the thing being destroyed, and it is corrupted:
  // averaging it mixed the cream title with the mirrored orange duplicate on top
  // of it and produced a muddy brown that belongs to neither. The front cover
  // carries both inks cleanly, at size, and is untouched by this repair.
  const frontX0 = Math.min(w - 1, bandX1 + 40);
  const cream =
    input.creamSample ??
    meanColour(data, w, ch, frontX0, 0, w, h, (r, g, b) => r > 200 && g > 185 && b > 140 && b < 215);
  const orange =
    input.orangeSample ??
    meanColour(data, w, ch, frontX0, 0, w, h, (r, g, b) => r > 170 && g > 60 && g < 140 && b < 80);

  // The painted fold shadow bleeds a few pixels PAST the band on both sides, so
  // the reference column has to start beyond it. Referencing the pixel right
  // next to the fill made the fallback replicate near-black shadow into a wide
  // stripe: the repair reproducing the defect it was removing.
  const SHADOW_MARGIN = input.shadowMarginPx ?? 14;

  // 1. Back-cover material into the left overhang.
  const backFill = backW > 0
    ? fillFromPanelPerRow(data, w, h, ch, bandX0, backW, -1, backSrcX0, SHADOW_MARGIN)
    : { fallbackRows: 0 };
  // 2. Front-cover material into the right overhang.
  const frontFill = frontW > 0
    ? fillFromPanelPerRow(data, w, h, ch, spineX1, frontW, 1, frontSrcX0, SHADOW_MARGIN)
    : { fallbackRows: 0 };
  // 3. The spine's own field, rebuilt from its clean rows.
  const { cleanRun } = rebuildSpineBackground(data, w, h, ch, spineX0, spineW);

  const rebuilt = await sharp(data, { raw: { width: w, height: h, channels: ch as 3 | 4 } })
    .png()
    .toBuffer();

  // 4. Set the type, sized to the spine rather than to a guess. Cap height is
  //    bounded by the spine WIDTH; length is never the binding constraint here.
  const titlePx = Math.max(9, Math.round(spineW * 0.58));
  const authorPx = Math.max(8, Math.round(spineW * 0.40));
  // v2's own intent, preserved: cream title, orange author.
  const titleHex = hex(cream ?? { r: 235, g: 226, b: 200 });
  const authorHex = hex(orange ?? cream ?? { r: 216, g: 94, b: 38 });

  const typeSvg = spineTypeSvg({
    widthPx: spineW,
    heightPx: h,
    title: input.title,
    author: input.author,
    titleHex,
    authorHex,
    titlePx,
    authorPx,
    fontFamily: input.fontFamily ?? 'Archivo, DejaVu Sans, sans-serif',
  });

  const png = await sharp(rebuilt)
    .composite([{ input: Buffer.from(typeSvg), left: spineX0, top: 0 }])
    .png()
    .toBuffer();

  // 5. Prove nothing outside the band moved. The claim is measured, not asserted.
  const pixelsChangedOutsideBand = await diffOutsideBand(input.art, png, bandX0, bandX1);

  return {
    png,
    report: {
      bandX0, bandX1, spineX0, spineX1,
      backFillPx: backW,
      frontFillPx: frontW,
      backSource: [backSrcX0, backSrcX0 + backW],
      frontSource: [frontSrcX0, frontSrcX0 + frontW],
      spineCleanRunRows: cleanRun,
      backFallbackRows: backFill.fallbackRows,
      frontFallbackRows: frontFill.fallbackRows,
      titleHex, authorHex, titlePx, authorPx,
      pixelsChangedOutsideBand,
    },
  };
}

/** Every pixel left of bandX0 and right of bandX1, compared before vs after. */
export async function diffOutsideBand(
  before: Buffer, after: Buffer, bandX0: number, bandX1: number,
): Promise<number> {
  const meta = await sharp(before).metadata();
  const w = meta.width!;
  const h = meta.height!;
  const regions = [
    { left: 0, width: bandX0 },
    { left: bandX1, width: w - bandX1 },
  ].filter((r) => r.width > 0);

  let differing = 0;
  for (const r of regions) {
    // Normalise both sides to 3 channels first: compositing adds alpha, and a
    // raw 3-vs-4 channel comparison misaligns by a byte per pixel and reports
    // the whole image as changed.
    const [a, b] = await Promise.all([
      sharp(before).extract({ left: r.left, top: 0, width: r.width, height: h }).removeAlpha().raw().toBuffer(),
      sharp(after).extract({ left: r.left, top: 0, width: r.width, height: h }).removeAlpha().raw().toBuffer(),
    ]);
    if (a.equals(b)) continue;
    for (let i = 0; i < a.length; i += 3) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) differing++;
    }
  }
  return differing;
}
