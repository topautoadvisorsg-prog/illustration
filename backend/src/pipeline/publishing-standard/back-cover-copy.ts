/**
 * ADDING A LINE OF COPY TO A BACK COVER WHOSE COPY IS PAINTED INTO THE ARTWORK.
 *
 * On this cover lineage the image model paints the whole wrap — blurb, feature
 * list and author note included — and code composites only what a model places
 * badly: the byline panel and the spine. There is no text layer to edit. So a
 * late copy change has exactly two routes:
 *
 *   1. Repaint the artwork with the new copy. That regenerates the picture, and
 *      an approved cover stops being the approved cover.
 *   2. Set the new line in code and composite it into the space the painting
 *      already leaves. The artwork is untouched.
 *
 * This is route 2. It exists because "which seven parks?" is the first question
 * the front cover provokes and the back cover was not answering it.
 *
 * ─── WHY THE BAND IS DETECTED AND NOT HARDCODED ──────────────────────────────
 * The same artwork sits at a different scale and offset on every binding: the
 * paperback crops it, the hardcover pads it, and both make their height up by
 * stretching sky, which is non-linear. A y coordinate measured on one wrap is
 * meaningless on the other. So the band is FOUND on the composed wrap: the
 * painted copy is bright cream on dark art, so the text rows are found by
 * brightness, grouped into blocks, and the gap under the blurb is the target.
 *
 * If no suitable band is found this THROWS. Drawing a line of copy at a guessed
 * coordinate on a cover is how you print type on top of type.
 */
import sharp from 'sharp';
import { SPINE_CREAM, SPINE_FONT, SPINE_HALO } from './spine-type.js';

/** Reference size for width measurement; a string's width scales linearly with it. */
const REF_PX = 200;

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * How wide this string actually renders at `REF_PX`, in pixels.
 *
 * Drawn alone on a transparent canvas and the empty margin trimmed away, so the
 * result is real ink: kerning, italics and punctuation included. Character
 * counts cannot do this — "Great Smoky Mountains" and "Yellowstone · Acadia" are
 * the same length in characters and nowhere near it in inches.
 */
async function inkWidthAtRef(text: string, weight: number, italic: boolean): Promise<number> {
  if (!text) return 0;
  const canvasW = REF_PX * Math.max(text.length, 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${REF_PX * 3}">
    <text x="${canvasW / 2}" y="${REF_PX * 1.5}" text-anchor="middle"
          font-family="${SPINE_FONT}" font-size="${REF_PX}" font-weight="${weight}"
          ${italic ? 'font-style="italic"' : ''}
          fill="#fff">${escapeXml(text)}</text>
  </svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
  return info.width;
}

/** One block of painted copy found on the back panel, in pixels from the top. */
export interface CopyBlock {
  top: number;
  bottom: number;
}

export interface BackPanelScan {
  blocks: CopyBlock[];
  /** Left edge of the painted text column, in pixels. */
  columnLeft: number;
  /** Right edge of the painted text column, in pixels. */
  columnRight: number;
}

/**
 * Find the painted copy on a back panel.
 *
 * `columnRight` is taken from the WIDEST block below the first one — the feature
 * list and author note sit over dark art, so their right edge is real ink. The
 * blurb's own band cannot be used: on this cover a sunlit cliff runs up the
 * right of it and reads as bright as type does.
 */
export async function scanBackPanel(
  wrap: Buffer,
  panelWidthPx: number,
  scanLeftPx: number,
  scanRightPx: number,
  mergeGapPx: number,
  brightness = 225,
): Promise<BackPanelScan> {
  const { data, info } = await sharp(wrap)
    .extract({ left: 0, top: 0, width: panelWidthPx, height: (await sharp(wrap).metadata()).height! })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  /**
   * TYPE IS FOUND BY ITS EDGES, NOT BY ITS BRIGHTNESS.
   *
   * A first version counted bright pixels per row, which works only if the art
   * behind the copy is uniformly dark. It is not: this cover has a sunlit sky
   * across the top of the back panel that is brighter than the type, and three
   * bands of cloud scored as "text blocks" above the blurb — enough to make the
   * blurb the fourth block instead of the first.
   *
   * A row of text crosses from dark to light once per letter stem, dozens of
   * times across a line. A row of sky crosses once or twice, if at all. Counting
   * crossings separates them cleanly and does not care how bright the sky is.
   */
  const minInk = Math.max(4, Math.round((scanRightPx - scanLeftPx) * 0.004));
  const MIN_CROSSINGS = 8;
  const rowInk: number[] = [];
  for (let y = 0; y < info.height; y += 1) {
    let n = 0;
    let crossings = 0;
    let prev = false;
    for (let x = scanLeftPx; x < scanRightPx; x += 1) {
      const on = data[y * info.width + x]! > brightness;
      if (on) n += 1;
      if (on && !prev) crossings += 1;
      prev = on;
    }
    rowInk.push(crossings >= MIN_CROSSINGS ? n : 0);
  }

  const raw: CopyBlock[] = [];
  let start = -1;
  for (let y = 0; y <= rowInk.length; y += 1) {
    const on = y < rowInk.length && rowInk[y]! >= minInk;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      if (y - start >= 8) raw.push({ top: start, bottom: y });
      start = -1;
    }
  }
  /**
   * Lines closer together than a leading are one paragraph, not two blocks.
   *
   * Scaled from the DPI, not from the panel width. Taken from the panel width it
   * came out at 37px against a blurb whose lines sit 42px apart, so every line
   * of every paragraph stayed its own "block" and the blurb was nineteen blocks
   * instead of one.
   */
  const blocks: CopyBlock[] = [];
  for (const b of raw) {
    const last = blocks[blocks.length - 1];
    if (last && b.top - last.bottom < mergeGapPx) last.bottom = b.bottom;
    else blocks.push({ ...b });
  }

  let columnLeft = info.width;
  let columnRight = 0;
  for (const b of blocks.slice(1)) {
    for (let y = b.top; y < b.bottom; y += 1) {
      for (let x = scanLeftPx; x < scanRightPx; x += 1) {
        if (data[y * info.width + x]! > brightness) {
          if (x < columnLeft) columnLeft = x;
          if (x > columnRight) columnRight = x;
        }
      }
    }
  }
  return { blocks, columnLeft, columnRight };
}

export interface BackCoverLineRequest {
  /** Italic lead-in, e.g. "Featured parks:". May be empty. */
  lead: string;
  /**
   * The list ITEMS, not a pre-joined string.
   *
   * Wrapping a joined string breaks on spaces, which puts the separator at the
   * end of a line: "…Yosemite ·" with "Zion ·…" beneath it. A dangling middot is
   * the kind of thing nobody can name but everybody sees. Wrapping on items lets
   * the separator be dropped at every line end, where it is not needed anyway.
   */
  items: string[];
  /** Drawn between items on the same line. Never at a line end. */
  separator: string;
  wrapWidthPx: number;
  wrapHeightPx: number;
  dpi: number;
  /** The clear band the line must sit inside, in pixels from the top. */
  bandTopPx: number;
  bandBottomPx: number;
  /** The painted text column the line must align to, in pixels. */
  columnLeftPx: number;
  columnRightPx: number;
  /** Minimum clear space to leave above and below the block, in pixels. */
  minAirPx: number;
  /**
   * How much of the leftover air goes ABOVE the block, 0 to 1.
   *
   * Not 0.5. Centring the line in the gap spaces it evenly between the blurb it
   * answers and the label it is not part of, and the whole panel then reads as
   * one evenly-leaded column — the deliberate breather the design had before the
   * feature list is simply gone. Biasing the air downward binds the line to the
   * paragraph above it, which is where it belongs, and gives the label its
   * separation back.
   */
  airAboveFraction?: number;
  /** Largest type size to consider, in pixels. */
  maxSizePx: number;
}

export interface BackCoverLinePlan {
  svg: string;
  sizePx: number;
  lines: string[];
  blockTopPx: number;
  blockBottomPx: number;
  airAbovePx: number;
  airBelowPx: number;
  measurePx: number;
  widestLinePx: number;
}

/**
 * Set the line, sized down until it fits the band.
 *
 * Two constraints fight each other: every line must fit the column's measure,
 * and the whole block must fit the band's height with air to spare. Smaller type
 * wins the first and loses the second, because it takes more lines. So the size
 * is walked down from the largest that could work and the first size satisfying
 * BOTH is taken — and if none does, this throws rather than overlapping the
 * copy that is already painted there.
 */
export async function planBackCoverLine(req: BackCoverLineRequest): Promise<BackCoverLinePlan> {
  const measurePx = req.columnRightPx - req.columnLeftPx;
  const bandPx = req.bandBottomPx - req.bandTopPx;

  const leadRef = await inkWidthAtRef(req.lead, 400, true);
  const sepRef = await inkWidthAtRef(` ${req.separator} `, 400, false);
  const itemRefs: number[] = [];
  for (const it of req.items) itemRefs.push(await inkWidthAtRef(it, 400, false));
  const spaceRef = (await inkWidthAtRef('n n', 400, false)) - 2 * (await inkWidthAtRef('n', 400, false));

  const at = (ref: number, size: number): number => (ref * size) / REF_PX;
  /** Width of a rendered line, measured from its parts rather than re-rasterised. */
  const lineWidth = (idxs: number[], size: number, withLead: boolean): number => {
    let w = withLead && req.lead ? at(leadRef, size) + at(spaceRef, size) : 0;
    for (const [i, idx] of idxs.entries()) {
      w += at(itemRefs[idx]!, size);
      if (i < idxs.length - 1) w += at(sepRef, size);
    }
    return w;
  };

  /** Georgia's cap height and a comfortable leading for a supporting line. */
  const CAP = 0.7;
  const LEADING = 1.32;

  for (let size = req.maxSizePx; size >= 8; size -= 1) {
    const leadW = req.lead ? at(leadRef, size) + at(spaceRef, size) : 0;

    /**
     * Greedy wrap on ITEMS. A line takes park names until the next one will not
     * fit; the separator that would have followed the last name is simply not
     * drawn, so no line ever ends on a middot.
     */
    const rows: number[][] = [];
    let cur: number[] = [];
    for (let i = 0; i < req.items.length; i += 1) {
      const trial = [...cur, i];
      if (cur.length && lineWidth(trial, size, rows.length === 0) > measurePx) {
        rows.push(cur);
        cur = [i];
      } else {
        cur = trial;
      }
    }
    if (cur.length) rows.push(cur);

    const lines = rows.map((r) => r.map((i) => req.items[i]!).join(` ${req.separator} `));

    const blockH = (rows.length - 1) * LEADING * size + CAP * size;
    if (blockH + 2 * req.minAirPx > bandPx) continue;

    const widest = Math.max(...rows.map((r, i) => lineWidth(r, size, i === 0)));
    if (widest > measurePx) continue;

    const slack = bandPx - blockH;
    const airAbove = slack * (req.airAboveFraction ?? 0.5);
    const airBelow = slack - airAbove;
    if (airAbove < req.minAirPx * 0.6 || airBelow < req.minAirPx) continue;
    const blockTop = req.bandTopPx + airAbove;
    const firstBaseline = blockTop + CAP * size;

    const halo = Math.max(2, Math.round(size * 0.11));
    const common =
      `font-family="${SPINE_FONT}" fill="${SPINE_CREAM}" stroke="${SPINE_HALO}" ` +
      `stroke-width="${halo}" stroke-opacity="0.85" paint-order="stroke fill" stroke-linejoin="round"`;

    const parts: string[] = [];
    for (const [i, line] of lines.entries()) {
      const y = firstBaseline + i * LEADING * size;
      let x = req.columnLeftPx;
      if (i === 0 && req.lead) {
        parts.push(
          `<text x="${x}" y="${y.toFixed(1)}" font-size="${size}" font-style="italic" ${common}>${escapeXml(req.lead)}</text>`,
        );
        x += leadW;
      }
      parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" ${common}>${escapeXml(line)}</text>`);
    }

    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${req.wrapWidthPx}" height="${req.wrapHeightPx}">\n${parts.join('\n')}\n</svg>`,
      sizePx: size,
      lines,
      blockTopPx: blockTop,
      blockBottomPx: blockTop + blockH,
      airAbovePx: airAbove,
      airBelowPx: airBelow,
      measurePx,
      widestLinePx: widest,
    };
  }

  throw new Error(
    `back-cover line does not fit: band ${(bandPx / req.dpi).toFixed(3)}in, ` +
      `measure ${(measurePx / req.dpi).toFixed(3)}in, even at 8px`,
  );
}

export interface ParkListOverlayRequest {
  /** The composed wrap, before any code-set type. */
  wrap: Buffer;
  wrapWidthPx: number;
  wrapHeightPx: number;
  dpi: number;
  /** Right edge of the back panel (bleed + trim width), in inches. */
  backPanelRightIn: number;
  lead: string;
  items: string[];
  separator: string;
}

export interface ParkListOverlay extends BackCoverLinePlan {
  /** Every painted block found on the back panel, in inches from the top. */
  blocksIn: Array<[number, number]>;
  columnLeftIn: number;
  columnRightIn: number;
  bandTopIn: number;
  bandBottomIn: number;
}

/**
 * Place the park list in the gap the painting already leaves under the blurb.
 *
 * THE BLURB IS THE FIRST BLOCK AND THE TALLEST. That is asserted, not assumed:
 * if the tallest block on the panel is not the first one, the layout is not the
 * one this was written for and the guess would be unsafe, so it throws. The
 * target is the gap directly beneath it — which is where the answer belongs,
 * because the blurb's last sentence is the question. It ends "...the seven parks
 * most Americans actually visit", and the reader has been given no way to learn
 * which seven.
 */
export async function planParkListOverlay(req: ParkListOverlayRequest): Promise<ParkListOverlay> {
  const dpi = req.dpi;
  const panelW = Math.round(req.backPanelRightIn * dpi);
  /** Scan inside the live margin, and short of the sunlit cliff on the right. */
  const scanL = Math.round(0.4 * dpi);
  const scanR = Math.round((req.backPanelRightIn - 1.2) * dpi);

  const scan = await scanBackPanel(req.wrap, panelW, scanL, scanR, Math.round(0.2 * dpi));
  const shape = (): string =>
    scan.blocks.map((b, i) => `${i}:${(b.top / dpi).toFixed(2)}-${(b.bottom / dpi).toFixed(2)}`).join(' ');
  if (scan.blocks.length < 3) {
    throw new Error(`back panel scan found only ${scan.blocks.length} copy blocks — layout not recognised: ${shape()}`);
  }

  const heights = scan.blocks.map((b) => b.bottom - b.top);
  const tallest = heights.indexOf(Math.max(...heights));
  const blurb = scan.blocks[0]!;
  if (tallest !== 0 && heights[0]! < heights[tallest]! * 0.6) {
    throw new Error(
      `expected the blurb to be the first and largest block; block ${tallest} is taller ` +
        `(${heights[tallest]}px vs ${heights[0]}px) — layout not recognised: ${shape()}`,
    );
  }

  const next = scan.blocks[1]!;
  const bandTop = blurb.bottom;
  const bandBottom = next.top;
  const bandIn = (bandBottom - bandTop) / dpi;
  if (bandIn < 0.3) throw new Error(`gap under the blurb is only ${bandIn.toFixed(3)}in — too tight to set a line in`);

  const plan = await planBackCoverLine({
    lead: req.lead,
    items: req.items,
    separator: req.separator,
    wrapWidthPx: req.wrapWidthPx,
    wrapHeightPx: req.wrapHeightPx,
    dpi,
    bandTopPx: bandTop,
    bandBottomPx: bandBottom,
    columnLeftPx: scan.columnLeft,
    /** The blurb is justified a little wider than the ragged blocks below it. */
    columnRightPx: scan.columnRight + Math.round(0.14 * dpi),
    minAirPx: Math.round(0.1 * dpi),
    maxSizePx: Math.round(0.19 * dpi),
  });

  return {
    ...plan,
    blocksIn: scan.blocks.map((b) => [b.top / dpi, b.bottom / dpi] as [number, number]),
    columnLeftIn: scan.columnLeft / dpi,
    columnRightIn: scan.columnRight / dpi,
    bandTopIn: bandTop / dpi,
    bandBottomIn: bandBottom / dpi,
  };
}
