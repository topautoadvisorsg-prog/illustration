/**
 * SETTING TYPE ON A SPINE, MEASURED RATHER THAN GUESSED.
 *
 * A spine is the least forgiving surface on a book. It is a fraction of an inch
 * wide, it folds at both edges, and the type has to read against whatever the
 * artwork happens to be doing behind it. Three separate defects reached finished
 * covers on this platform before this module existed, and every one of them came
 * from placing type without measuring it:
 *
 *   1. TYPE THAT COLLIDED. The title was centred at a fixed -6% of the wrap
 *      height and the author at +20%, with nothing anywhere asking how long
 *      either string actually rendered. A forty-four character title on a 10.4in
 *      hardcover spine ran straight through the author block and the two printed
 *      on top of each other.
 *
 *   2. TYPE THAT DISAPPEARED. Cream lettering was painted straight onto a
 *      continuous illustration. Where the illustration was dark canyon it read
 *      perfectly; where it crossed sunlit sky the first six characters of the
 *      title vanished into the background.
 *
 *   3. TYPE THAT WOULD HAVE OVERRUN. Nothing checked the total length against
 *      the spine's safe height, so a longer title or a thinner spine would
 *      simply have run off both ends.
 *
 * So this module does three things and nothing else: it measures the real ink
 * length of each string, it lays the two blocks out from those measurements with
 * a guaranteed gap, and it draws them on a dark halo so they read over any
 * background without a painted strip breaking the illustration.
 *
 * WHY A HALO AND NOT A STRIP. Painting a solid band behind spine type is the
 * obvious fix and it is the wrong one: it puts back exactly the artificial strip
 * that a continuous wrap illustration exists to remove. Stroking each glyph with
 * a soft dark outline underneath the fill (`paint-order: stroke`) gives the same
 * legibility and leaves the artwork unbroken. It is the same device the front
 * cover title already uses against the photograph.
 *
 * WHY GEORGIA. sharp rasterises SVG through librsvg, which resolves families
 * through fontconfig and cannot see the TTFs vendored for the interior — Archivo,
 * Lora and EB Garamond all render byte-identical, every one of them silently
 * falling back to DejaVu Sans. Georgia is verifiably resolvable and is the face
 * the shipped covers are set in.
 */
import sharp from 'sharp';

export const SPINE_FONT = 'Georgia, serif';
export const SPINE_CREAM = '#F2E8D5';
export const SPINE_HALO = '#101a14';

/**
 * SPINE TYPE IS SOLID BLACK, AT FULL OPACITY, WITH NO HALO.
 *
 * The spine was set in SPINE_CREAM with a 0.85-opacity dark halo, and against
 * this book's cream spine ground that is cream-on-cream: the owner reported it
 * as faint and hard to read, and the proof confirms it. Owner direction is
 * solid black, 100% opacity, no transparency and no grey.
 *
 * The halo goes with it rather than being restated in black. Its whole purpose
 * was to hold light type against a varying illustration; black on this ground
 * does not need it, and a translucent stroke is exactly what was ruled out.
 * Dropping it also shrinks the measured typography footprint, so fold clearance
 * can only improve -- it is measured on alpha, halo included, further down.
 *
 * SPINE_CREAM and SPINE_HALO are deliberately left alone: back-cover-copy.ts
 * sets the back cover with them, and the back cover is not changing.
 */
export const SPINE_INK = '#000000';

/** Georgia's caps are ~0.69em; the cap height is what has to fit the fold-safe strip. */
export const GEORGIA_CAP_RATIO = 0.69;

/**
 * The reference size every measurement is taken at.
 *
 * A string's ink length scales linearly with font size, so one rasterisation
 * answers every size. Large enough that hinting and rounding are noise.
 */
const REF_PX = 200;

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * How long this string actually renders, in pixels, at `REF_PX`.
 *
 * The text is drawn alone on a transparent canvas and the empty margin trimmed
 * away; what is left is the true extent, kerning, letter-spacing, accents and
 * descenders included. No character-count estimate can do this — the same
 * forty-four characters are a different length in every face and weight.
 */
async function inkLengthAtRef(text: string, weight: number, letterSpacing: number): Promise<number> {
  const canvasW = REF_PX * Math.max(text.length, 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${REF_PX * 3}">
    <text x="${canvasW / 2}" y="${REF_PX * 1.5}" text-anchor="middle" dominant-baseline="middle"
          font-family="${SPINE_FONT}" font-size="${REF_PX}" font-weight="${weight}"
          fill="#fff" letter-spacing="${letterSpacing}">${escapeXml(text)}</text>
  </svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
  return info.width;
}

/**
 * Where the ink's CENTRE sits relative to the baseline, in pixels at `REF_PX`.
 * Negative, because glyphs sit above their baseline.
 *
 * ─── WHY THIS EXISTS: `dominant-baseline` IS A NO-OP HERE ────────────────────
 * sharp rasterises SVG through librsvg, and librsvg does not implement
 * `dominant-baseline`. Not partially — at all. Rendering the same string with
 * `dominant-baseline="middle"` and with no attribute produces BYTE-IDENTICAL
 * output; the ink centre lands 0.355 x font-size above the anchor in both cases,
 * exactly where a plain baseline puts it.
 *
 * On a spine that is not a cosmetic difference. The type is drawn inside a
 * `rotate(90)` group, so the cross-spine axis IS the baseline axis, and an
 * ignored `dominant-baseline` slides the whole line half a cap height toward the
 * front fold. On the 0.450in hardcover spine that put the title's ink 0.000in
 * from the fold against KDP's 0.0625in variance — it crossed it — while the plan
 * reported a comfortable 0.1233in, because the number was computed from
 * GEORGIA_CAP_RATIO and nothing ever looked at the ink.
 *
 * So the offset is measured, the same way the length already is, and applied as
 * an explicit `y`. This is the same class of bug as the silent font fallback
 * documented at the top of this file: the SVG asked for something and librsvg
 * quietly did something else.
 */
async function inkCentreAtRef(text: string, weight: number, letterSpacing: number): Promise<number> {
  const canvasW = REF_PX * Math.max(text.length, 1);
  const canvasH = REF_PX * 3;
  const baseline = REF_PX * 1.5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">
    <text x="${canvasW / 2}" y="${baseline}" text-anchor="middle"
          font-family="${SPINE_FONT}" font-size="${REF_PX}" font-weight="${weight}"
          fill="#fff" letter-spacing="${letterSpacing}">${escapeXml(text)}</text>
  </svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let top = info.height;
  let bot = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3]! > 24) {
        if (y < top) top = y;
        if (y > bot) bot = y;
        break;
      }
    }
  }
  return bot < 0 ? 0 : (top + bot) / 2 - baseline;
}

export interface SpineTypeRequest {
  title: string;
  author: string;
  /** Full wrap height in pixels — the canvas the spine strip is drawn on. */
  wrapHeightPx: number;
  /** Spine width in pixels. */
  spineWidthPx: number;
  /** The strip that survives fold wander on both sides, in pixels. */
  foldSafeWidthPx: number;
  /** How much of the spine's length type may occupy, in pixels. */
  safeLengthPx: number;
  /** Clear space between the end of the title and the start of the author block. */
  gapPx: number;
  /**
   * Ink for the spine type. Defaults to SPINE_INK (solid black).
   *
   * A REQUEST FIELD, NOT A CONSTANT, because the book now carries two approved
   * cover versions that differ only here. Hard-coding the colour would make one
   * of them unbuildable without editing the library.
   */
  inkHex?: string;
  /**
   * How far to lift the author's name off the foot of the safe zone.
   *
   * Defaults to 0, which pins the author flush to the bottom end exactly as
   * before — so an existing build reproduces byte for byte. A positive value
   * moves it up toward the title, and is subtracted from the length available
   * to the type so the fit still converges honestly.
   */
  authorFootInsetPx?: number;
  /** Fraction of the fold-safe width the title's cap height should fill. */
  capFill?: number;
  letterSpacing?: number;
  /**
   * INTERNAL production target for fold clearance, in pixels, measured with the
   * halo included. The title is sized down until the drawn typography clears
   * both folds by at least this much.
   *
   * This is a house safety margin, NOT a KDP requirement — KDP's fold variance
   * is 0.0625in and that is the hard floor. Sizing to the floor leaves nothing
   * for press wander: the first halo-aware measurement of these covers came out
   * at 0.0633in, eight ten-thousandths of an inch clear, which is a pass on
   * paper and no tolerance at all in a bindery.
   *
   * Omit it and no width-driven reduction happens — the caller's own gate is
   * then the only thing standing between the type and the fold.
   */
  targetClearPx?: number;
}

export interface SpineTypePlan {
  svg: string;
  titlePx: number;
  authorPx: number;
  titleCapPx: number;
  /** Clearance between the title's cap height and each spine fold, in pixels. COMPUTED from the cap ratio. */
  clearPerSidePx: number;
  /**
   * The same clearance MEASURED off the drawn SVG — halo included — as the
   * smaller of the two sides. This is the number to gate on.
   *
   * Both exist on purpose. `clearPerSidePx` said 0.1233in on the hardcover while
   * the ink was touching the fold, because a formula cannot see what librsvg
   * actually drew. Anything that reports or checks fold safety must use this.
   */
  measuredClearPerSidePx: number;
  /** Across-spine imbalance in the drawn ink, in pixels. */
  measuredImbalancePx: number;
  /** Halo-aware clearance of the WHOLE strip, per side. */
  measuredLeftClearPx: number;
  measuredRightClearPx: number;
  /** Halo-aware clearance of the title line alone, per side. */
  titleClearLeftPx: number;
  titleClearRightPx: number;
  /** Halo-aware clearance of the author line alone, per side. */
  authorClearLeftPx: number;
  authorClearRightPx: number;
  /** True when the size came down to meet `targetClearPx` rather than to fit the length. */
  reducedForClearance: boolean;
  titleLengthPx: number;
  authorLengthPx: number;
  /** title + gap + author. */
  totalLengthPx: number;
  /** True when the size had to come down to fit the spine's length. */
  reducedToFit: boolean;
}

/**
 * Lay out and draw the spine.
 *
 * The author is pinned to the foot of the safe area and the title centred in
 * what remains above it — both positioned from their measured lengths, so
 * neither can run off an end or into the other. If the type cannot fit at the
 * size the strip width allows, the size comes down until it does, and if it
 * cannot fit at any readable size this THROWS rather than shipping a spine with
 * words missing.
 */
export async function planSpineType(req: SpineTypeRequest): Promise<SpineTypePlan> {
  const capFill = req.capFill ?? 0.62;
  const letterSpacing = req.letterSpacing ?? 1;
  const targetClearPx = req.targetClearPx ?? 0;

  const titleRef = await inkLengthAtRef(req.title, 600, letterSpacing);
  const authorRef = await inkLengthAtRef(req.author, 400, letterSpacing);
  const titleCentreRef = await inkCentreAtRef(req.title, 600, letterSpacing);
  const authorCentreRef = await inkCentreAtRef(req.author, 400, letterSpacing);

  /** The size the fold-safe strip width allows, before any other constraint. */
  const widthLimitedPx = Math.floor((req.foldSafeWidthPx / GEORGIA_CAP_RATIO) * capFill);
  const authorSizeRatio = 0.72;

  const footInset = req.authorFootInsetPx ?? 0;
  const ink = req.inkHex ?? SPINE_INK;

  const lengthAt = (px: number): number =>
    Math.round((titleRef * px) / REF_PX) +
    req.gapPx +
    Math.round((authorRef * Math.floor(px * authorSizeRatio)) / REF_PX) +
    footInset;

  /* Everything below is a function of the title size, so that the size can be
     chosen by MEASURING candidates rather than by trusting a ratio. */
  const geometryFor = (px: number) => {
    const authorPx = Math.floor(px * authorSizeRatio);
    const titleLengthPx = Math.round((titleRef * px) / REF_PX);
    const authorLengthPx = Math.round((authorRef * authorPx) / REF_PX);
    const safeTopX = -req.safeLengthPx / 2;
    const safeBotX = req.safeLengthPx / 2;
    const authorCentreX = safeBotX - footInset - authorLengthPx / 2;
    const titleCentreX = (safeTopX + (authorCentreX - authorLengthPx / 2 - req.gapPx)) / 2;
    return {
      authorPx,
      titleLengthPx,
      authorLengthPx,
      titleCentreX,
      authorCentreX,
      haloTitle: Math.max(3, Math.round(px * 0.14)),
      haloAuthor: Math.max(2, Math.round(authorPx * 0.14)),
      /* The measured cross-axis correction, scaled from REF_PX to the real size.
         Negating it moves the ink's centre onto the group's origin — which,
         inside the rotate(90), is the middle of the spine. `dominant-baseline`
         was supposed to do this and silently did nothing. */
      titleDy: -Math.round((titleCentreRef * px) / REF_PX),
      authorDy: -Math.round((authorCentreRef * authorPx) / REF_PX),
    };
  };

  /** One line, or both, as an SVG the size of the spine strip. */
  const buildSvg = (px: number, which: 'both' | 'title' | 'author'): string => {
    const g = geometryFor(px);
    const title =
      `<text x="${g.titleCentreX}" y="${g.titleDy}" text-anchor="middle" ` +
      `font-family="${SPINE_FONT}" font-size="${px}" font-weight="600" ` +
      `fill="${ink}" fill-opacity="1" stroke="none" ` +
      `letter-spacing="${letterSpacing}">${escapeXml(req.title)}</text>`;
    const author =
      `<text x="${g.authorCentreX}" y="${g.authorDy}" text-anchor="middle" ` +
      `font-family="${SPINE_FONT}" font-size="${g.authorPx}" font-weight="400" ` +
      `fill="${ink}" fill-opacity="1" stroke="none" ` +
      `letter-spacing="${letterSpacing}">${escapeXml(req.author)}</text>`;
    const inner = which === 'title' ? title : which === 'author' ? author : `${title}${'\n'}    ${author}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${req.spineWidthPx}" height="${req.wrapHeightPx}">
  <g transform="translate(${req.spineWidthPx / 2}, ${req.wrapHeightPx / 2}) rotate(90)">
    ${inner}
  </g>
</svg>`;
  };

  /**
   * THE COMPLETE TYPOGRAPHY FOOTPRINT, measured on ALPHA over transparency.
   *
   * Not the cap box, not the glyph outline — everything that survives into the
   * composited spine: fill, halo stroke, and the antialiased edge of both. Alpha
   * over transparency is the strictest available reading and, crucially, cannot
   * be contaminated by the artwork, because there is no artwork in the render.
   *
   * The previous version measured against a flat grey field with a colour-delta
   * threshold of 18/255. That did include the halo, but a threshold can only
   * ever flatter: the faint outer edge of a soft stroke falls under it and is
   * scored as clear space. On a spine that difference is the whole margin.
   */
  const acrossBounds = async (svg: string): Promise<{ left: number; right: number } | null> => {
    const { data, info } = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let l = info.width;
    let r = -1;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        if (data[(y * info.width + x) * info.channels + 3]! > 0) {
          if (x < l) l = x;
          if (x > r) r = x;
        }
      }
    }
    return r < 0 ? null : { left: l, right: info.width - 1 - r };
  };

  /**
   * Choose the size by measurement, not by ratio.
   *
   * Two constraints, either able to force a reduction: the type must fit the
   * spine's LENGTH, and its complete footprint must clear both folds by
   * `targetClearPx`. Clearance grows monotonically as the size falls, so a
   * decrement converges; the seed below jumps most of the way first so it takes
   * a handful of rasterisations rather than eighty.
   */
  const footprintRatio = GEORGIA_CAP_RATIO + 0.14; // cap height plus the halo either side
  const seed = targetClearPx
    ? Math.min(widthLimitedPx, Math.floor((req.spineWidthPx - 2 * targetClearPx) / footprintRatio))
    : widthLimitedPx;

  let titlePx = Math.max(seed, 8);
  let reducedForClearance = false;
  for (let guard = 0; ; guard += 1) {
    if (guard > 400) throw new Error('spine type sizing failed to converge');
    if (titlePx <= 8) {
      throw new Error(
        `spine type does not fit: "${req.title}" cannot clear ${targetClearPx}px of fold ` +
          `and ${req.safeLengthPx}px of safe length at any readable size`,
      );
    }
    if (lengthAt(titlePx) > req.safeLengthPx) {
      titlePx -= 1;
      continue;
    }
    if (targetClearPx > 0) {
      const b = await acrossBounds(buildSvg(titlePx, 'both'));
      if (b && Math.min(b.left, b.right) < targetClearPx) {
        titlePx -= 1;
        reducedForClearance = true;
        continue;
      }
    }
    break;
  }

  const g = geometryFor(titlePx);
  const authorPx = g.authorPx;
  const titleLengthPx = g.titleLengthPx;
  const authorLengthPx = g.authorLengthPx;
  const titleCapPx = Math.round(titlePx * GEORGIA_CAP_RATIO);
  const clearPerSidePx = Math.round((req.spineWidthPx - titleCapPx) / 2);

  const svg = buildSvg(titlePx, 'both');
  const both = await acrossBounds(svg);
  const titleOnly = await acrossBounds(buildSvg(titlePx, 'title'));
  const authorOnly = await acrossBounds(buildSvg(titlePx, 'author'));
  const leftClearPx = both?.left ?? 0;
  const rightClearPx = both?.right ?? 0;

  return {
    svg,
    titlePx,
    authorPx,
    titleCapPx,
    clearPerSidePx,
    measuredClearPerSidePx: Math.min(leftClearPx, rightClearPx),
    measuredImbalancePx: Math.abs(leftClearPx - rightClearPx),
    measuredLeftClearPx: leftClearPx,
    measuredRightClearPx: rightClearPx,
    titleClearLeftPx: titleOnly?.left ?? 0,
    titleClearRightPx: titleOnly?.right ?? 0,
    authorClearLeftPx: authorOnly?.left ?? 0,
    authorClearRightPx: authorOnly?.right ?? 0,
    titleLengthPx,
    authorLengthPx,
    totalLengthPx: titleLengthPx + req.gapPx + authorLengthPx,
    reducedToFit: titlePx < widthLimitedPx,
    reducedForClearance,
  };
}

/**
 * Extend a wrap upward into sky by stretching a TALL band gently.
 *
 * The first version of this stretched the top forty rows to fill whatever height
 * was missing — a several-hundred-per-cent stretch of a thin strip, which smears
 * whatever texture those particular rows happened to contain into vertical
 * streaks. Sky is a smooth gradient, so stretching half the image by a few per
 * cent is invisible; stretching a sliver of it by a lot is not.
 *
 * The bottom is never stretched: it holds the horizon, the figure and the author
 * panel, and smearing a recognisable object is worse than any margin gained.
 */
export async function extendSkyUpward(
  body: Buffer,
  widthPx: number,
  bodyHeightPx: number,
  targetHeightPx: number,
  bandFraction = 0.5,
): Promise<Buffer> {
  const stretch = targetHeightPx - bodyHeightPx;
  if (stretch <= 0) return body;
  const band = Math.round(bodyHeightPx * bandFraction);
  return sharp({ create: { width: widthPx, height: targetHeightPx, channels: 3, background: '#000' } })
    .composite([
      {
        input: await sharp(body)
          .extract({ left: 0, top: 0, width: widthPx, height: band })
          .resize(widthPx, band + stretch, { fit: 'fill', kernel: 'lanczos3' })
          .toBuffer(),
        left: 0,
        top: 0,
      },
      {
        input: await sharp(body)
          .extract({ left: 0, top: band, width: widthPx, height: bodyHeightPx - band })
          .toBuffer(),
        left: 0,
        top: band + stretch,
      },
    ])
    .png()
    .toBuffer();
}
