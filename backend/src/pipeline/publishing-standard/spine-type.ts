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
  /** Fraction of the fold-safe width the title's cap height should fill. */
  capFill?: number;
  letterSpacing?: number;
}

export interface SpineTypePlan {
  svg: string;
  titlePx: number;
  authorPx: number;
  titleCapPx: number;
  /** Clearance between the title's cap height and each spine fold, in pixels. */
  clearPerSidePx: number;
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

  const titleRef = await inkLengthAtRef(req.title, 600, letterSpacing);
  const authorRef = await inkLengthAtRef(req.author, 400, letterSpacing);

  /** The size the fold-safe strip width allows, before any length constraint. */
  const widthLimitedPx = Math.floor((req.foldSafeWidthPx / GEORGIA_CAP_RATIO) * capFill);
  const authorSizeRatio = 0.72;

  const lengthAt = (px: number): number =>
    Math.round((titleRef * px) / REF_PX) +
    req.gapPx +
    Math.round((authorRef * Math.floor(px * authorSizeRatio)) / REF_PX);

  let titlePx = widthLimitedPx;
  while (titlePx > 8 && lengthAt(titlePx) > req.safeLengthPx) titlePx -= 1;
  if (lengthAt(titlePx) > req.safeLengthPx) {
    throw new Error(
      `spine type does not fit: "${req.title}" needs ${lengthAt(titlePx)}px of ` +
        `${req.safeLengthPx}px safe length even at the minimum size`,
    );
  }

  const authorPx = Math.floor(titlePx * authorSizeRatio);
  const titleLengthPx = Math.round((titleRef * titlePx) / REF_PX);
  const authorLengthPx = Math.round((authorRef * authorPx) / REF_PX);
  const titleCapPx = Math.round(titlePx * GEORGIA_CAP_RATIO);
  const clearPerSidePx = Math.round((req.spineWidthPx - titleCapPx) / 2);

  /**
   * Coordinates are in the rotated frame, where x runs down the spine from the
   * top and 0 is the middle of the wrap.
   */
  const safeTopX = -req.safeLengthPx / 2;
  const safeBotX = req.safeLengthPx / 2;
  const authorCentreX = safeBotX - authorLengthPx / 2;
  const titleCentreX = (safeTopX + (authorCentreX - authorLengthPx / 2 - req.gapPx)) / 2;

  const haloTitle = Math.max(3, Math.round(titlePx * 0.14));
  const haloAuthor = Math.max(2, Math.round(authorPx * 0.14));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${req.spineWidthPx}" height="${req.wrapHeightPx}">
  <g transform="translate(${req.spineWidthPx / 2}, ${req.wrapHeightPx / 2}) rotate(90)">
    <text x="${titleCentreX}" y="0" text-anchor="middle" dominant-baseline="middle"
          font-family="${SPINE_FONT}" font-size="${titlePx}" font-weight="600"
          fill="${SPINE_CREAM}" stroke="${SPINE_HALO}" stroke-width="${haloTitle}" stroke-opacity="0.85"
          paint-order="stroke fill" stroke-linejoin="round"
          letter-spacing="${letterSpacing}">${escapeXml(req.title)}</text>
    <text x="${authorCentreX}" y="0" text-anchor="middle" dominant-baseline="middle"
          font-family="${SPINE_FONT}" font-size="${authorPx}" font-weight="400"
          fill="${SPINE_CREAM}" stroke="${SPINE_HALO}" stroke-width="${haloAuthor}" stroke-opacity="0.85"
          paint-order="stroke fill" stroke-linejoin="round"
          letter-spacing="${letterSpacing}">${escapeXml(req.author)}</text>
  </g>
</svg>`;

  return {
    svg,
    titlePx,
    authorPx,
    titleCapPx,
    clearPerSidePx,
    titleLengthPx,
    authorLengthPx,
    totalLengthPx: titleLengthPx + req.gapPx + authorLengthPx,
    reducedToFit: titlePx < widthLimitedPx,
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
