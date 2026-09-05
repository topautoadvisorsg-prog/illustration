/**
 * TRAIN THE DOG YOU'VE GOT — front-panel and spine typography.
 *
 * Everything here is MEASURED off drawn ink. Nothing is computed from a cap
 * ratio, a character count or a font-size guess. That is not a preference; it
 * is the lesson the platform's own spine module was written to record, where a
 * formula reported 0.1233in of fold clearance while the ink was touching the
 * fold.
 *
 * ─── WHY THIS IS NOT IN THE SHARED COMPOSITOR ────────────────────────────────
 * `build-cover.ts` states its own contract in its first paragraph: "Nothing
 * about any particular book belongs in this file." A stacked three-word title,
 * optically balanced against one illustration, in one book's palette, is that
 * book's design. The shared compositor keeps the MATHS; this file keeps the
 * DESIGN. No shared file is modified by this build.
 *
 * ─── THE FONT TRAP, AND WHY assertFontResolves EXISTS ────────────────────────
 * sharp rasterises SVG through librsvg, which resolves families through
 * fontconfig. When a family cannot be resolved librsvg does not fail — it
 * silently substitutes DejaVu Sans and returns a perfectly good-looking image
 * in the wrong typeface. The platform's spine module carries a comment saying
 * Archivo, Lora and EB Garamond all rendered byte-identical for exactly this
 * reason, and concluded that only Georgia was safe.
 *
 * That conclusion is machine-specific. On this Windows host Segoe UI, Cambria,
 * Arial Black and Franklin Gothic Heavy each resolve distinctly. But a cover
 * silently set in the wrong face because it was built somewhere else is a
 * catastrophic and completely invisible failure — a proof looks fine — so every
 * family this cover uses is proved before a single glyph is placed.
 *
 * The proof is two checks, because one is not enough: the family must be
 * REGISTERED on the host, and it must also render differently from families
 * that do not exist. See `assertFontResolves` for why the render comparison
 * alone lets absent fonts through.
 */
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

export const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Reference size for measurement. Ink extent scales linearly with font size. */
const REF_PX = 300;

/**
 * Families that CANNOT EXIST. Whatever these render as is this host's fallback,
 * and any requested family that renders identically was never resolved.
 *
 * Three of them, not one, because a single probe produced a FALSE PASS in
 * testing: "Nunito", which is not installed here, measured differently from one
 * impossible family at weight 800 and was waved through, while at weight 700
 * the same absent font was correctly caught.
 *
 * EVERY MEMBER MUST BE A NAME THAT DOES NOT EXIST. An earlier version listed
 * "DejaVu Sans" here on the assumption it was the fallback face. It is not —
 * it is genuinely installed on this host, and it has no 600 or 900 weight, so
 * fontconfig answers those requests by substituting Segoe UI Semibold and Segoe
 * UI Black: the exact faces this cover uses. The guard then "caught" the title
 * face as a fallback and refused to build a cover that was entirely correct.
 * A probe must be an absent NAME, never a real font with gaps in its weights.
 */
const FALLBACK_PROBES = [
  'ZzQq No Such Family 8817',
  'AlsoDefinitelyNotAFont 5521',
  'Qxvv Absent Typeface 3094',
];

export interface TextStyle {
  family: string;
  weight: number;
  italic?: boolean;
  /** Extra tracking, in em, applied at any size. */
  trackingEm?: number;
}

const styleAttrs = (s: TextStyle, sizePx: number) =>
  `font-family="${escapeXml(s.family)}" font-size="${sizePx}" font-weight="${s.weight}"` +
  `${s.italic ? ' font-style="italic"' : ''}` +
  `${s.trackingEm ? ` letter-spacing="${(s.trackingEm * sizePx).toFixed(3)}"` : ''}`;

/** The real ink box of one string at `REF_PX`, in pixels. */
async function inkAtRef(text: string, style: TextStyle): Promise<{ w: number; h: number }> {
  const canvasW = Math.max(REF_PX * 2, REF_PX * text.length);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${REF_PX * 3}">` +
    `<text x="${canvasW / 2}" y="${REF_PX * 2}" text-anchor="middle" ${styleAttrs(style, REF_PX)} ` +
    `fill="#fff">${escapeXml(text)}</text></svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height };
}

const cache = new Map<string, { w: number; h: number }>();
export async function measure(text: string, style: TextStyle): Promise<{ w: number; h: number }> {
  const key = `${style.family}|${style.weight}|${style.italic ? 'i' : ''}|${style.trackingEm ?? 0}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = await inkAtRef(text, style);
  cache.set(key, m);
  return m;
}

/**
 * Prove a family actually resolves rather than silently falling back.
 *
 * Uses a pangram-ish string with ascenders, descenders and a numeral, so two
 * genuinely different faces cannot coincide by accident.
 */
export async function assertFontResolves(family: string, weight = 400): Promise<void> {
  // ── 1 · is the family actually installed on this host? ────────────────────
  const installed = installedFamilies();
  if (installed && !installed.has(normaliseFamily(family))) {
    throw new Error(
      `FONT NOT INSTALLED: "${family}" is not registered on this host, so librsvg will silently substitute its ` +
        'fallback and the cover will be set in a typeface nobody chose — which looks completely normal on a proof. ' +
        'Install the font, or choose a family that is present. Refusing to build.',
    );
  }

  // ── 2 · and does librsvg agree, rather than quietly falling back? ─────────
  const probe = 'Hamburgefonstiv 8-12 Wg';
  const real = await inkAtRef(probe, { family, weight });
  for (const p of FALLBACK_PROBES) {
    const fb = await inkAtRef(probe, { family: p, weight });
    if (real.w === fb.w && real.h === fb.h) {
      throw new Error(
        `FONT NOT RESOLVED: "${family}" at weight ${weight} renders identically to "${p}", a family that does not ` +
          'exist, so librsvg substituted its fallback. Refusing to build.',
      );
    }
  }
}

/**
 * The families Windows has registered, or null if the registry cannot be read.
 *
 * ─── WHY THE REGISTRY AND NOT A RENDER COMPARISON ────────────────────────────
 * The obvious guard — "render it, render a family that cannot exist, and
 * compare" — is not sound, and this was established by testing rather than
 * assumed. Nunito at weight 800, Montserrat at 400 and Comic Neue at 400 are
 * none of them installed here, and all three measured DIFFERENTLY from the
 * impossible families and passed. fontconfig's substitution depends on the
 * requested family NAME as well as the weight, so two absent names do not
 * necessarily land on the same substitute.
 *
 * Asking what is installed answers the real question directly. `reg` is used
 * rather than PowerShell because it is a plain executable with a stable output
 * format and no execution policy in the way.
 *
 * If the registry cannot be read the check degrades to the render comparison
 * alone, which is weaker but not nothing — the caller is not told a font is
 * fine when the check could not run.
 */
let familyCache: Set<string> | null | undefined;
function installedFamilies(): Set<string> | null {
  if (familyCache !== undefined) return familyCache;
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
    'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
  ];
  const found = new Set<string>();
  let anyRead = false;
  for (const key of keys) {
    let out: string;
    try {
      out = execFileSync('reg', ['query', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      continue;
    }
    anyRead = true;
    for (const line of out.split(/\r?\n/)) {
      /** "    Segoe UI Black (TrueType)    REG_SZ    seguibl.ttf" */
      const m = /^\s{4}(.+?)\s{4,}REG_SZ\s{4,}/.exec(line);
      if (!m) continue;
      const display = m[1]!.replace(/\s*\((TrueType|OpenType|VGA res|All res)\)\s*$/i, '');
      /** One value can list several faces: "Arial Bold,Arial Bold Italic". */
      for (const part of display.split(',')) {
        const name = part.trim();
        if (!name) continue;
        found.add(normaliseFamily(name));
        /** Also register the family without its style words, so "Arial" matches "Arial Bold Italic". */
        const stem = name.replace(/\s+(Bold|Italic|Oblique|Regular|Light|Semilight|Semibold|Black|Heavy|Condensed)\b/gi, '').trim();
        if (stem) found.add(normaliseFamily(stem));
      }
    }
  }
  familyCache = anyRead ? found : null;
  return familyCache;
}

const normaliseFamily = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The largest uniform size at which every line fits `maxWidthPx`.
 *
 * Uniform, not per-line: sizing each line to fill the measure makes the SHORTEST
 * line the biggest, which puts the emphasis on whichever words happen to be
 * fewest rather than on the ones that matter.
 */
export async function fitUniform(
  lines: string[],
  style: TextStyle,
  maxWidthPx: number,
  maxCapPx: number,
): Promise<{ sizePx: number; capPx: number; widestPx: number }> {
  const refs = await Promise.all(lines.map((l) => measure(l, style)));
  const widestRef = Math.max(...refs.map((r) => r.w));
  /** Ink width scales linearly, so the fitting size is solved, not searched. */
  let sizePx = Math.floor((maxWidthPx / widestRef) * REF_PX);

  /** A cap ceiling as well, so a short title cannot grow absurdly tall. */
  const capRef = Math.max(...(await Promise.all(lines.map((l) => measure(l.toUpperCase(), style))))
    .map((r) => r.h));
  const capAtSize = (px: number) => (capRef / REF_PX) * px;
  if (capAtSize(sizePx) > maxCapPx) sizePx = Math.floor((maxCapPx / capRef) * REF_PX);

  /** Verify by re-measuring at the chosen size; linear scaling is exact but rounding is not. */
  for (let guard = 0; guard < 40; guard += 1) {
    const got = await Promise.all(lines.map((l) => measure(l, style)));
    const widest = Math.max(...got.map((r) => (r.w / REF_PX) * sizePx));
    if (widest <= maxWidthPx) return { sizePx, capPx: capAtSize(sizePx), widestPx: widest };
    sizePx -= 1;
  }
  throw new Error(`fitUniform: could not fit ${lines.length} line(s) into ${maxWidthPx}px`);
}

export interface StackedBlock {
  svg: string;
  sizePx: number;
  capPx: number;
  widestPx: number;
  /** Ink box of the whole block, in pixels on the wrap canvas. */
  ink: { left: number; right: number; top: number; bottom: number };
  lineCount: number;
}

/**
 * Set centred lines, then MEASURE where the ink actually landed on the wrap.
 *
 * The returned ink box is what safe-area clearance is judged from. A box
 * computed from font metrics would not include the halo stroke, and the halo is
 * ink that prints.
 */
export async function setStack(opts: {
  lines: string[];
  style: TextStyle;
  centreXPx: number;
  /** Baseline of the FIRST line. */
  firstBaselinePx: number;
  sizePx: number;
  leadingEm: number;
  fill: string;
  halo?: string;
  haloEm?: number;
  wrapWidthPx: number;
  wrapHeightPx: number;
  /** Narrow the ink search to the band this block was placed in. Speed only. */
  scanRegion?: { left: number; top: number; width: number; height: number };
}): Promise<StackedBlock> {
  const { lines, style, sizePx } = opts;
  const leadPx = sizePx * opts.leadingEm;
  const strokePx = opts.halo ? sizePx * (opts.haloEm ?? 0.1) : 0;
  const body = lines
    .map((line, i) => {
      const y = opts.firstBaselinePx + leadPx * i;
      const stroke = opts.halo
        ? ` stroke="${opts.halo}" stroke-width="${strokePx.toFixed(2)}" stroke-linejoin="round" paint-order="stroke"`
        : '';
      return (
        `<text x="${opts.centreXPx.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" ` +
        `${styleAttrs(style, sizePx)} fill="${opts.fill}"${stroke}>${escapeXml(line)}</text>`
      );
    })
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.wrapWidthPx}" height="${opts.wrapHeightPx}">` +
    `${body}</svg>`;
  const ink = await inkBox(svg, opts.wrapWidthPx, opts.wrapHeightPx, opts.scanRegion);
  if (!ink) throw new Error('setStack: rendered no ink');
  const measured = await Promise.all(lines.map((l) => measure(l, style)));
  const widest = Math.max(...measured.map((r) => (r.w / REF_PX) * sizePx));
  const capPx = ((await measure(lines[0]!.toUpperCase(), style)).h / REF_PX) * sizePx;
  return { svg, sizePx, capPx, widestPx: widest, ink, lineCount: lines.length };
}

/**
 * Real ink extent of a rendered overlay, alpha-tested.
 *
 * `sharp().trim()` cannot be used for this: it reports a size, not a position on
 * the canvas, and position is the whole question when the thing being checked is
 * distance to a trim line.
 */
export async function inkBox(
  svg: string,
  widthPx: number,
  heightPx: number,
  /**
   * Scan only this window of the canvas, in canvas pixels. Coordinates come
   * back in CANVAS space either way — the offset is added back — so a caller
   * can narrow the search without having to think about it.
   *
   * Purely a speed valve: a full 3801x2775 wrap is ten million pixels to walk
   * in JavaScript, and it is walked several times per build.
   */
  region?: { left: number; top: number; width: number; height: number },
): Promise<{ left: number; right: number; top: number; bottom: number } | null> {
  let pipe = sharp(Buffer.from(svg), { density: 96 }).resize(widthPx, heightPx, { fit: 'fill' });
  const ox = region ? Math.max(0, Math.floor(region.left)) : 0;
  const oy = region ? Math.max(0, Math.floor(region.top)) : 0;
  if (region) {
    pipe = pipe.extract({
      left: ox,
      top: oy,
      width: Math.min(Math.ceil(region.width), widthPx - ox),
      height: Math.min(Math.ceil(region.height), heightPx - oy),
    });
  }
  const { data, info } = await pipe.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let left = info.width;
  let right = -1;
  let top = info.height;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    const row = y * info.width;
    for (let x = 0; x < info.width; x += 1) {
      if (data[(row + x) * ch + (ch - 1)]! > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { left: left + ox, right: right + ox, top: top + oy, bottom: bottom + oy };
}

export interface SpinePlan {
  svg: string;
  titleSizePx: number;
  authorSizePx: number;
  /** Halo-aware clearance from each fold, MEASURED off the drawn strip. */
  measuredClearPerSidePx: number;
  measuredLeftClearPx: number;
  measuredRightClearPx: number;
  titleLengthPx: number;
  authorLengthPx: number;
  reducedForClearance: boolean;
}

/**
 * Set the spine, reading top-to-bottom, and measure what was drawn.
 *
 * Sized down until the drawn ink — halo included — clears BOTH folds by
 * `targetClearPx`. The loop measures rather than predicting, because the halo
 * stroke is drawn outside the glyph and no cap-height calculation sees it.
 *
 * Throws rather than shipping type that is too close to a fold or too small to
 * read. A refusal here is the correct outcome; a spine with the title creeping
 * onto the front cover is not.
 */
export async function planSpine(opts: {
  title: string;
  author: string;
  titleStyle: TextStyle;
  authorStyle: TextStyle;
  spineWidthPx: number;
  wrapHeightPx: number;
  /** The length of spine the type may occupy, centred on the wrap height. */
  safeLengthPx: number;
  gapPx: number;
  targetClearPx: number;
  fill: string;
  halo: string;
  haloEm: number;
  minSizePx: number;
}): Promise<SpinePlan> {
  const capBudgetPx = opts.spineWidthPx - 2 * opts.targetClearPx;
  if (capBudgetPx <= 0) {
    throw new Error(
      `Spine is ${opts.spineWidthPx}px wide and ${opts.targetClearPx}px of clearance is required on each side, ` +
        'leaving nothing for type. Refusing.',
    );
  }

  /** Start from the cap budget, then come down until the DRAWN ink clears. */
  const titleRef = await measure(opts.title, opts.titleStyle);
  const titleCapRef = (await measure(opts.title.toUpperCase(), opts.titleStyle)).h;
  let titleSizePx = Math.floor((capBudgetPx / titleCapRef) * REF_PX);
  let reduced = false;

  for (let guard = 0; guard < 200; guard += 1) {
    if (titleSizePx < opts.minSizePx) {
      throw new Error(
        `Spine type fell to ${titleSizePx}px before it cleared both folds by ${opts.targetClearPx}px. ` +
          'Shorten the spine title or accept less clearance deliberately. Refusing to shave the fold.',
      );
    }
    const authorSizePx = Math.max(opts.minSizePx, Math.round(titleSizePx * 0.72));
    const svg = await spineSvg({ ...opts, titleSizePx, authorSizePx });
    const ink = await inkBox(svg, opts.spineWidthPx, opts.wrapHeightPx);
    if (!ink) throw new Error('spine: rendered no ink');

    const leftClear = ink.left;
    const rightClear = opts.spineWidthPx - 1 - ink.right;
    const lengthOk = ink.bottom - ink.top <= opts.safeLengthPx;
    if (leftClear >= opts.targetClearPx && rightClear >= opts.targetClearPx && lengthOk) {
      return {
        svg,
        titleSizePx,
        authorSizePx,
        measuredClearPerSidePx: Math.min(leftClear, rightClear),
        measuredLeftClearPx: leftClear,
        measuredRightClearPx: rightClear,
        titleLengthPx: (titleRef.w / REF_PX) * titleSizePx,
        authorLengthPx: 0,
        reducedForClearance: reduced,
      };
    }
    titleSizePx -= 1;
    reduced = true;
  }
  throw new Error('spine: did not converge');
}

/**
 * Draw the spine strip: title above, author below, both rotated to read
 * top-to-bottom, which is the convention for English-language spines.
 */
async function spineSvg(o: {
  title: string;
  author: string;
  titleStyle: TextStyle;
  authorStyle: TextStyle;
  titleSizePx: number;
  authorSizePx: number;
  spineWidthPx: number;
  wrapHeightPx: number;
  gapPx: number;
  fill: string;
  halo: string;
  haloEm: number;
}): Promise<string> {
  const titleLen = ((await measure(o.title, o.titleStyle)).w / REF_PX) * o.titleSizePx;
  const authorLen = ((await measure(o.author, o.authorStyle)).w / REF_PX) * o.authorSizePx;
  const total = titleLen + o.gapPx + authorLen;
  const startY = (o.wrapHeightPx - total) / 2;
  const cx = o.spineWidthPx / 2;

  /**
   * `dominant-baseline` is a no-op in librsvg, so the across-spine centring is
   * done by nudging the baseline half the ink height.
   *
   * Half the INK height of the actual string, not half a cap height. "Drew
   * Corley" has both an ascender and a descender in y, so its drawn column is
   * taller than its caps; centring on the cap height would push the whole name
   * off-centre toward one fold, which on a 0.419in spine is most of the
   * clearance budget.
   */
  const titleCap = ((await measure(o.title, o.titleStyle)).h / REF_PX) * o.titleSizePx;
  const authorCap = ((await measure(o.author, o.authorStyle)).h / REF_PX) * o.authorSizePx;

  const line = (text: string, style: TextStyle, sizePx: number, yStart: number, capPx: number) => {
    const strokePx = sizePx * o.haloEm;
    return (
      `<text transform="rotate(90 ${cx.toFixed(1)} ${yStart.toFixed(1)})" ` +
      `x="${cx.toFixed(1)}" y="${(yStart + capPx / 2).toFixed(1)}" ` +
      `${styleAttrs(style, sizePx)} fill="${o.fill}" stroke="${o.halo}" ` +
      `stroke-width="${strokePx.toFixed(2)}" stroke-linejoin="round" paint-order="stroke">` +
      `${escapeXml(text)}</text>`
    );
  };

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${o.spineWidthPx}" height="${o.wrapHeightPx}">` +
    line(o.title, o.titleStyle, o.titleSizePx, startY, titleCap) +
    line(o.author, o.authorStyle, o.authorSizePx, startY + titleLen + o.gapPx, authorCap) +
    '</svg>'
  );
}
