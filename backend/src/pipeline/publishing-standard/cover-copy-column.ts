/**
 * SET A COLUMN OF BACK-COVER COPY ONTO ARTWORK, INSIDE A MEASURED BOX.
 *
 * The back cover of 7 NATIONAL PARKS had its blurb, feature list and author
 * paragraph PAINTED by the image model. Three things went wrong with that and
 * only one of them was cosmetic:
 *
 *   - The copy ran 0.818in into KDP's barcode reserve. The barcode is printed
 *     over the artwork after press, so the last four lines of the bio would have
 *     had a barcode on top of them.
 *   - The type sat in a solid panel, hiding the photograph it was supposed to
 *     sit on.
 *   - Neither could be fixed by instruction: the prompt already forbade the
 *     panel and the model painted one anyway.
 *
 * So the copy is SET here instead. The box is passed in, the largest size that
 * fits it is found by measurement, and the block cannot leave the box because
 * the box is the constraint the size is solved against. Barcode clearance stops
 * being something to check afterwards and becomes something that cannot fail.
 *
 * ─── WIDTHS ARE MEASURED, NOT COUNTED ────────────────────────────────────────
 * Every word is rendered once at a reference size and its real ink width taken,
 * then scaled. Character counts cannot do this: "Permits, timed entry" and
 * "recreation.gov only" are within a character of each other and nowhere near
 * the same width. Words are cached, so a 200-word column costs 200 small
 * renders once rather than one per size tried.
 *
 * ─── NO PANEL, A HALO ────────────────────────────────────────────────────────
 * Legibility comes from a dark stroke drawn UNDER the letterform via
 * `paint-order: stroke`, the same technique that rescued the spine title from a
 * sunlit sandstone background. A halo keeps the photograph visible where a panel
 * would cover it, which is the whole point of setting the type here.
 */
import sharp from 'sharp';

/** Reference size for width measurement; a string's width scales linearly with it. */
const REF_PX = 200;

export const COPY_FONT = 'Georgia, serif';
export const COPY_CREAM = '#F4ECDD';
export const COPY_HALO = '#0d1310';

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One authored piece of the column. */
export interface CopyBlockSpec {
  kind: 'para' | 'heading' | 'bullet';
  text: string;
  /** Set the whole block bold. Headings are bold by default. */
  bold?: boolean;
  /** Set the whole block italic. */
  italic?: boolean;
}

export interface CopyColumnRequest {
  blocks: CopyBlockSpec[];
  /** The column the copy aligns to, in pixels from the wrap's left edge. */
  columnLeftPx: number;
  columnRightPx: number;
  /** The band the whole block must sit inside, in pixels from the wrap's top. */
  bandTopPx: number;
  bandBottomPx: number;
  wrapWidthPx: number;
  wrapHeightPx: number;
  /** Largest and smallest body sizes to consider, in pixels. */
  maxSizePx: number;
  minSizePx: number;
  fill?: string;
  halo?: string;
  font?: string;
}

export interface CopyColumnPlan {
  svg: string;
  /** The BODY size chosen. Headings and bullets are derived from it. */
  sizePx: number;
  blockTopPx: number;
  blockBottomPx: number;
  measurePx: number;
  /** Measured off the rendered overlay, not computed. */
  widestLinePx: number;
  lineCount: number;
  /** What was left over at the foot of the band, in pixels. */
  slackPx: number;
}

interface LaidLine {
  text: string;
  xPx: number;
  yPx: number;
  sizePx: number;
  bold: boolean;
  italic: boolean;
  letterSpacingPx: number;
}

/**
 * How wide this string actually renders at `REF_PX`.
 *
 * Drawn alone on transparency and the empty margin trimmed away, so the result
 * is real ink: kerning, italics and punctuation included.
 */
async function inkWidthAtRef(text: string, weight: number, italic: boolean, font: string): Promise<number> {
  if (!text) return 0;
  const canvasW = REF_PX * Math.max(text.length, 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${REF_PX * 3}">
    <text x="${canvasW / 2}" y="${REF_PX * 1.5}" text-anchor="middle"
          font-family="${font}" font-size="${REF_PX}" font-weight="${weight}"
          ${italic ? 'font-style="italic"' : ''}
          fill="#fff">${escapeXml(text)}</text>
  </svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
  return info.width;
}

/** Real ink box of a rendered overlay, or null if it drew nothing. */
async function inkBox(
  svg: string,
  widthPx: number,
  heightPx: number,
): Promise<{ left: number; right: number; top: number; bottom: number } | null> {
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(widthPx, heightPx, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let left = info.width;
  let right = -1;
  let top = info.height;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * ch + (ch - 1)]! > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { left, right, top, bottom };
}

/** Metrics derived from the body size, so the column stays proportional at any size. */
const metrics = (bodyPx: number) => ({
  bodyPx,
  bodyLeadPx: bodyPx * 1.34,
  headingPx: bodyPx * 1.02,
  headingLeadPx: bodyPx * 1.34,
  headingTrackPx: bodyPx * 0.1,
  spaceBeforeHeadingPx: bodyPx * 1.05,
  spaceAfterHeadingPx: bodyPx * 0.42,
  spaceBetweenParasPx: bodyPx * 0.62,
  spaceBetweenBulletsPx: bodyPx * 0.5,
  /** Hanging indent: the bullet sits in the margin, the text aligns past it. */
  bulletIndentPx: bodyPx * 0.85,
});

/**
 * Greedy wrap on measured words.
 *
 * Greedy is correct here and balanced is not: this is running prose, where a
 * reader expects full measure lines, unlike a display list of park names where
 * balancing lets the type grow.
 */
function wrapWords(
  words: string[],
  widths: number[],
  spacePx: number,
  measurePx: number,
): string[][] {
  const lines: string[][] = [];
  let cur: string[] = [];
  let curW = 0;
  for (let i = 0; i < words.length; i += 1) {
    const w = widths[i]!;
    const add = cur.length === 0 ? w : spacePx + w;
    if (cur.length > 0 && curW + add > measurePx) {
      lines.push(cur);
      cur = [words[i]!];
      curW = w;
    } else {
      cur.push(words[i]!);
      curW += add;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/**
 * Set the column, sized down until the whole thing fits the band.
 *
 * The search runs from the largest size DOWNWARD and takes the first that fits,
 * so the copy is always as large as the box allows rather than as small as the
 * first guess. It throws rather than returning an overflowing block: a column
 * that does not fit is a layout decision for a person, not something to silently
 * shrink past legibility.
 */
export async function planCopyColumn(req: CopyColumnRequest): Promise<CopyColumnPlan> {
  const font = req.font ?? COPY_FONT;
  const fill = req.fill ?? COPY_CREAM;
  const halo = req.halo ?? COPY_HALO;
  const measurePx = req.columnRightPx - req.columnLeftPx;
  const bandHeightPx = req.bandBottomPx - req.bandTopPx;

  /** Every distinct word measured once, at the reference size, then scaled. */
  const cache = new Map<string, number>();
  const widthAtRef = async (word: string, bold: boolean, italic: boolean): Promise<number> => {
    const key = `${bold ? 'b' : ''}${italic ? 'i' : ''}|${word}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const w = await inkWidthAtRef(word, bold ? 700 : 400, italic, font);
    cache.set(key, w);
    return w;
  };

  const nRef = await inkWidthAtRef('n', 400, false, font);
  const spaceRef = (await inkWidthAtRef('n n', 400, false, font)) - 2 * nRef;

  /** Pre-measure every word of every block, in its own weight and style. */
  const prepared: Array<{ spec: CopyBlockSpec; words: string[]; refWidths: number[] }> = [];
  for (const spec of req.blocks) {
    const bold = spec.bold ?? spec.kind === 'heading';
    const italic = spec.italic ?? false;
    const words = spec.text.split(/\s+/).filter(Boolean);
    const refWidths: number[] = [];
    for (const w of words) refWidths.push(await widthAtRef(w, bold, italic));
    prepared.push({ spec, words, refWidths });
  }

  const layoutAt = (bodyPx: number): { lines: LaidLine[]; heightPx: number } | null => {
    const m = metrics(bodyPx);
    const lines: LaidLine[] = [];
    let y = 0;
    let first = true;

    for (const { spec, words, refWidths } of prepared) {
      const bold = spec.bold ?? spec.kind === 'heading';
      const italic = spec.italic ?? false;
      const isHeading = spec.kind === 'heading';
      const isBullet = spec.kind === 'bullet';
      const sizePx = isHeading ? m.headingPx : m.bodyPx;
      const scale = sizePx / REF_PX;
      const trackPx = isHeading ? m.headingTrackPx : 0;

      const indentPx = isBullet ? m.bulletIndentPx : 0;
      const lineMeasure = measurePx - indentPx;

      const scaled = refWidths.map((w, i) => w * scale + trackPx * words[i]!.length);
      const wrapped = wrapWords(words, scaled, spaceRef * scale + trackPx, lineMeasure);
      if (wrapped.some((ln) => ln.length === 1 && scaled[words.indexOf(ln[0]!)]! > lineMeasure)) return null;

      if (!first) {
        if (isHeading) y += m.spaceBeforeHeadingPx;
        else if (isBullet) y += m.spaceBetweenBulletsPx;
        else y += m.spaceBetweenParasPx;
      }
      first = false;

      wrapped.forEach((ln, i) => {
        const lead = isHeading ? m.headingLeadPx : m.bodyLeadPx;
        y += lead;
        lines.push({
          text: (isBullet && i === 0 ? '• ' : '') + ln.join(' '),
          xPx: req.columnLeftPx + (isBullet && i > 0 ? indentPx : 0),
          yPx: y,
          sizePx,
          bold,
          italic,
          letterSpacingPx: trackPx,
        });
      });
      if (isHeading) y += m.spaceAfterHeadingPx;
    }
    return { lines, heightPx: y };
  };

  let chosen: { lines: LaidLine[]; heightPx: number; bodyPx: number } | null = null;
  for (let bodyPx = Math.round(req.maxSizePx); bodyPx >= Math.round(req.minSizePx); bodyPx -= 1) {
    const laid = layoutAt(bodyPx);
    if (laid && laid.heightPx <= bandHeightPx) {
      chosen = { ...laid, bodyPx };
      break;
    }
  }
  if (!chosen) {
    throw new Error(
      `cover copy will not fit: ${req.blocks.length} block(s) into ` +
        `${(measurePx).toFixed(0)}x${bandHeightPx.toFixed(0)}px even at ${req.minSizePx}px. ` +
        'Shorten the copy or enlarge the band; do not set it smaller than this.',
    );
  }

  const strokePx = Math.max(1, chosen.bodyPx * 0.13);
  const body = chosen.lines
    .map((l) => {
      const ls = l.letterSpacingPx ? ` letter-spacing="${l.letterSpacingPx.toFixed(2)}"` : '';
      const st = l.italic ? ' font-style="italic"' : '';
      return (
        `<text x="${l.xPx.toFixed(1)}" y="${(req.bandTopPx + l.yPx).toFixed(1)}" ` +
        `font-family="${font}" font-size="${l.sizePx.toFixed(1)}" font-weight="${l.bold ? 700 : 400}"${st}${ls} ` +
        `fill="${fill}" stroke="${halo}" stroke-width="${strokePx.toFixed(2)}" stroke-linejoin="round" ` +
        `paint-order="stroke" ` +
        `>${escapeXml(l.text)}</text>`
      );
    })
    .join('\n');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${req.wrapWidthPx}" height="${req.wrapHeightPx}">\n${body}\n</svg>`;

  const box = await inkBox(svg, req.wrapWidthPx, req.wrapHeightPx);
  if (!box) throw new Error('cover copy rendered no ink');

  return {
    svg,
    sizePx: chosen.bodyPx,
    blockTopPx: box.top,
    blockBottomPx: box.bottom,
    measurePx,
    widestLinePx: box.right - box.left,
    lineCount: chosen.lines.length,
    slackPx: bandHeightPx - chosen.heightPx,
  };
}
