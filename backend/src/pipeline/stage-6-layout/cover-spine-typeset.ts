/**
 * DETERMINISTIC SPINE — set the spine text ourselves instead of asking a model.
 *
 * Three attempts to have the image model letter this spine produced: stacked on
 * two lines, stacked on two lines, and finally mirrored and garbled. That is not
 * a prompt problem. The spine is 0.385in of an 11.635in wrap — about 46 pixels
 * on the model's canvas — and at that size it cannot hold orientation, spacing
 * or spelling. No wording fixes it.
 *
 * The spine is also the one part of this cover that is not illustration: it is
 * two lines of type on a flat field. So it gets the treatment the rest of the
 * platform already uses — the model makes art, code sets type.
 *
 * ─── THE HARD PART IS NOT THE TYPE, IT IS THE BACKGROUND ──────────────────────
 *
 * The acceptance standard is that the repair must be invisible: same blue, same
 * brightness, same saturation, same grain, no seam, no rectangle, no halo. A
 * flat fill sampled to an "average colour" fails that immediately, because the
 * artwork has paper grain and subtle variation, and a smooth patch next to a
 * grainy field reads as a patch even when the mean colour matches.
 *
 * So this never invents a colour. Every background pixel in the repaired strip
 * is a REAL pixel taken from the same spine, copied from the nearest row that
 * has no lettering on it. Same generation, same grain, same tone, same fold
 * shading — because they are literally the same pixels, moved a few rows. The
 * only thing that changes is which rows carry ink.
 */
import sharp from 'sharp';

export interface SpineTypesetInput {
  /** The approved artwork. Its spine is the source of the background. */
  art: Buffer;
  /** Spine column in art pixels. */
  xPx: number;
  widthPx: number;
  title: string;
  author: string;
}

export interface SpineTypesetReport {
  /** Rows judged to carry lettering, which are the ones rebuilt. */
  inkRowsRebuilt: number;
  /** Rows with no lettering, used as the background source. */
  cleanRowsAvailable: number;
  /** The ink colour lifted from the existing spine title. */
  titleHex: string;
  /** The ink colour lifted from the existing spine author line. */
  authorHex: string;
  /** Background colour, reported for the audit only — never painted as a fill. */
  backgroundHex: string;
  titlePt: number;
  authorPt: number;
}

interface Rgb { r: number; g: number; b: number }

const hex = (c: Rgb): string =>
  '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * Split the spine's rows into "has lettering" and "clean".
 *
 * Judged against the spine's OWN median luminance rather than a fixed threshold,
 * so this works on a dark spine or a light one without being told which it is.
 */
function classifyRows(
  data: Buffer,
  w: number,
  h: number,
  channels: number,
): { isInk: boolean[]; isClean: boolean[]; bgLuma: number } {
  const lumaAt = (x: number, y: number): number => {
    const i = (y * w + x) * channels;
    return 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
  };
  const all: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) all.push(lumaAt(x, y));
  const sorted = [...all].sort((a, b) => a - b);
  const bgLuma = sorted[Math.floor(sorted.length / 2)]!;
  // Ink is what departs clearly from the field, in either direction.
  const spread = Math.max(18, (sorted[Math.floor(sorted.length * 0.98)]! - bgLuma) * 0.35);

  const isInk: boolean[] = [];
  const isClean: boolean[] = [];
  for (let y = 0; y < h; y++) {
    let departing = 0;
    let maxDeparture = 0;
    for (let x = 0; x < w; x++) {
      const dev = Math.abs(lumaAt(x, y) - bgLuma);
      if (dev > spread) departing++;
      if (dev > maxDeparture) maxDeparture = dev;
    }
    // "Has lettering on it" — used to pick ink COLOURS, so it wants a real run
    // of ink pixels rather than a stray one.
    isInk.push(departing > Math.max(2, w * 0.06));
    // "Safe to copy as background" — a far stricter question, and a separate
    // one. A row with a single faint pixel of an old letter is NOT clean: the
    // first version conflated these two and smeared leftover lettering down the
    // spine. Grain is allowed; anything that reads as ink is not.
    isClean.push(maxDeparture <= spread * 0.6);
  }
  return { isInk, isClean, bgLuma };
}

/** Mean colour of the pixels in a row that ARE ink. Used to match type colour. */
function inkColourOfRows(
  data: Buffer,
  w: number,
  channels: number,
  rows: number[],
  bgLuma: number,
): Rgb {
  let r = 0, g = 0, b = 0, n = 0;
  for (const y of rows) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels;
      const l = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
      if (Math.abs(l - bgLuma) > 30) { r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; n++; }
    }
  }
  return n ? { r: r / n, g: g / n, b: b / n } : { r: 255, g: 255, b: 255 };
}

/**
 * Rebuild the WHOLE spine background from a verified-clean block of real rows.
 *
 * The first version patched only the rows it judged inky, copying each from its
 * nearest clean neighbour. That left ghosts: a row carrying a thin part of a
 * letter fell under the "is this row inky" threshold, counted as clean, kept its
 * leftover ink AND got copied into other rows, smearing the old lettering down
 * the spine. Half-removing old type is worse than not trying.
 *
 * So: every row is replaced, and the source is the longest RUN of consecutive
 * rows in which not a single pixel departs from the field. Tiling a run rather
 * than repeating one row preserves grain in both directions, and the run is
 * flipped on alternate repeats so the tiling itself leaves no rhythm to spot.
 */
function rebuildBackground(
  data: Buffer,
  w: number,
  h: number,
  channels: number,
  isClean: boolean[],
): Buffer {
  // Longest consecutive run of strictly-clean rows.
  let bestStart = -1, bestLen = 0, curStart = -1;
  for (let y = 0; y <= h; y++) {
    const clean = y < h && isClean[y];
    if (clean && curStart < 0) curStart = y;
    if (!clean && curStart >= 0) {
      const len = y - curStart;
      if (len > bestLen) { bestLen = len; bestStart = curStart; }
      curStart = -1;
    }
  }
  if (bestLen < 4) throw new Error('spine has no clean run to rebuild the background from');

  const out = Buffer.alloc(data.length);
  const rowBytes = w * channels;
  for (let y = 0; y < h; y++) {
    const cycle = Math.floor(y / bestLen);
    const offset = y % bestLen;
    // Flip alternate tiles so the repeat has no detectable period.
    const src = bestStart + (cycle % 2 === 0 ? offset : bestLen - 1 - offset);
    data.copy(out, y * rowBytes, src * rowBytes, (src + 1) * rowBytes);
  }
  return out;
}

/**
 * Prove the repair touched nothing else.
 *
 * Compares every pixel outside the spine column between the source artwork and
 * the result. The acceptance standard for this repair is that the front and back
 * are untouched, and "untouched" is a claim that should be measured rather than
 * asserted.
 */
export async function diffOutsideStrip(
  before: Buffer,
  after: Buffer,
  xPx: number,
  widthPx: number,
): Promise<{ pixelsDiffering: number; regionsChecked: string[] }> {
  const meta = await sharp(before).metadata();
  const w = meta.width!;
  const h = meta.height!;
  const regions: { name: string; left: number; width: number }[] = [];
  if (xPx > 0) regions.push({ name: `back+left 0..${xPx - 1}`, left: 0, width: xPx });
  const rightStart = xPx + widthPx;
  if (rightStart < w) regions.push({ name: `front ${rightStart}..${w - 1}`, left: rightStart, width: w - rightStart });

  let differing = 0;
  for (const r of regions) {
    // Normalise to 3 channels on BOTH sides before comparing. Compositing adds
    // an alpha channel, so a raw comparison of a 3-channel source against a
    // 4-channel result comes out misaligned by one byte per pixel and reports
    // the entire image as changed — a false alarm that looks exactly like the
    // real failure it is meant to catch.
    const [a, b] = await Promise.all([
      sharp(before).extract({ left: r.left, top: 0, width: r.width, height: h }).removeAlpha().raw().toBuffer(),
      sharp(after).extract({ left: r.left, top: 0, width: r.width, height: h }).removeAlpha().raw().toBuffer(),
    ]);
    if (a.equals(b)) continue;
    for (let i = 0; i < a.length; i += 3) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) differing++;
  }
  return { pixelsDiffering: differing, regionsChecked: regions.map((r) => r.name) };
}

/** SVG for the spine type, rotated to read top-to-bottom like every book spine. */
function spineSvg(o: {
  widthPx: number;
  heightPx: number;
  title: string;
  author: string;
  titleHex: string;
  authorHex: string;
  titlePx: number;
  authorPx: number;
}): string {
  // The group is rotated 90 degrees, so inside it the spine reads as a wide,
  // short canvas: length along x, spine width along y.
  const L = o.heightPx;
  const W = o.widthPx;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Title near the head of the spine, author near the foot — standard practice.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${L}">
  <g transform="rotate(90) translate(0, -${W})">
    <!-- dy, NOT dominant-baseline. librsvg (which sharp rasterises through)
         does not implement dominant-baseline OR alignment-baseline: "middle",
         "central" and the alignment- form all render byte-identical to no
         attribute at all, leaving the text sitting ON its baseline. Inside this
         rotate(90) the baseline axis IS the across-spine axis, so an ignored
         attribute slides the whole line half a cap height toward one fold. That
         shipped on another book's hardcover with the title touching the fold.
         An explicit dy is honoured; measured, it centres to within half a
         pixel. -->
    <text x="${Math.round(L * 0.06)}" y="${Math.round(W * 0.5)}"
          font-family="Archivo, DejaVu Sans, sans-serif" font-weight="800"
          font-size="${o.titlePx}" fill="${o.titleHex}"
          letter-spacing="${(o.titlePx * 0.02).toFixed(2)}"
          dy="0.35em" text-anchor="start">${esc(o.title)}</text>
    <text x="${Math.round(L * 0.94)}" y="${Math.round(W * 0.5)}"
          font-family="Archivo, DejaVu Sans, sans-serif" font-weight="600"
          font-size="${o.authorPx}" fill="${o.authorHex}"
          letter-spacing="${(o.authorPx * 0.04).toFixed(2)}"
          dy="0.35em" text-anchor="end">${esc(o.author)}</text>
  </g>
</svg>`;
}

/**
 * Rebuild the spine: real background pixels, then deterministic type on top.
 * Returns the full artwork with ONLY the spine column replaced.
 */
export async function typesetSpine(input: SpineTypesetInput): Promise<{
  art: Buffer;
  report: SpineTypesetReport;
}> {
  const meta = await sharp(input.art).metadata();
  const artW = meta.width!;
  const artH = meta.height!;

  const strip = await sharp(input.art)
    .extract({ left: input.xPx, top: 0, width: input.widthPx, height: artH })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = strip;
  const { isInk, isClean, bgLuma } = classifyRows(data, info.width, info.height, info.channels);

  const inkRows = isInk.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const cleanCount = isClean.filter(Boolean).length;

  // Ink colours lifted from the artwork itself: the title sits in the upper part
  // of the spine, the author in the lower. Matching what is already there beats
  // any colour we could name.
  const upper = inkRows.filter((y) => y < artH * 0.6);
  const lower = inkRows.filter((y) => y >= artH * 0.6);
  const titleCol = inkColourOfRows(data, info.width, info.channels, upper.length ? upper : inkRows, bgLuma);
  const authorCol = inkColourOfRows(data, info.width, info.channels, lower.length ? lower : inkRows, bgLuma);

  // Background colour is measured for the report only. It is NEVER painted.
  const bgSample = inkRows.length
    ? (() => {
        const y = isClean.findIndex(Boolean);
        const i = (Math.max(0, y) * info.width + Math.floor(info.width / 2)) * info.channels;
        return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! };
      })()
    : { r: 0, g: 0, b: 0 };

  const cleaned = rebuildBackground(data, info.width, info.height, info.channels, isClean);
  const cleanedPng = await sharp(cleaned, {
    raw: { width: info.width, height: info.height, channels: info.channels as 4 },
  }).png().toBuffer();

  // Type sized off the spine WIDTH, which is what actually constrains it, with
  // the title dominant and the author subordinate, matching the front cover's
  // hierarchy.
  const titlePx = Math.round(input.widthPx * 0.52);
  const authorPx = Math.round(input.widthPx * 0.30);

  const svg = Buffer.from(
    spineSvg({
      widthPx: info.width,
      heightPx: info.height,
      title: input.title,
      author: input.author,
      titleHex: hex(titleCol),
      authorHex: hex(authorCol),
      titlePx,
      authorPx,
    }),
  );

  const newStrip = await sharp(cleanedPng).composite([{ input: svg, left: 0, top: 0 }]).png().toBuffer();

  const art = await sharp(input.art)
    .composite([{ input: newStrip, left: input.xPx, top: 0 }])
    .png()
    .toBuffer();

  // Convert px back to points at the final print scale, for the audit.
  const pxToPt = (px: number): number => Math.round((px / artW) * 11.635 * 72 * 10) / 10;

  return {
    art,
    report: {
      inkRowsRebuilt: inkRows.length,
      cleanRowsAvailable: cleanCount,
      titleHex: hex(titleCol),
      authorHex: hex(authorCol),
      backgroundHex: hex(bgSample),
      titlePt: pxToPt(titlePx),
      authorPt: pxToPt(authorPx),
    },
  };
}

/**
 * FREE. Rebuild this project's cover spine deterministically.
 *
 * Sources the artwork from the BACKUP taken before the model edit, when there is
 * one. That backup is the cover the operator approved; the current file's spine
 * came from a different generation, so its blue is not guaranteed to be the same
 * blue. Rebuilding from foreign pixels is how you bake in the seam you are
 * trying to avoid.
 */
export async function typesetCoverSpineForProject(projectId: string): Promise<{
  imagePath: string;
  sourceUsed: string;
  strip: { xPx: number; widthPx: number };
  report: SpineTypesetReport;
  outsideStrip: { pixelsDiffering: number; regionsChecked: string[] };
}> {
  const { getProject } = await import('../../db/repositories/projects.repo.js');
  const { getProjectStorage } = await import('../../services/storage/project-storage.js');
  const { ProjectConfigSchema } = await import('@wildlands/shared');
  const { renderCoverGeometry } = await import('./render-chapter.js');
  const { spineStripInArt } = await import('./cover-spine-repair.js');

  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found.');
  const config = ProjectConfigSchema.parse(project.config);
  const current = config.publishing.coverAssetPath;
  if (!current) throw new Error('No cover artwork. Generate the cover first.');

  const storage = getProjectStorage();
  const files = await storage.listProjectFiles(projectId, 'cover');
  const backups = files.filter((f) => f.startsWith('cover-wrap-art.before-spine-repair.')).sort();
  const chosen = backups.length ? `${projectId}/cover/${backups[backups.length - 1]}` : current;
  const source = await storage.readProjectFile(chosen);

  const meta = await sharp(source).metadata();
  const { pageCount } = await renderCoverGeometry(projectId, config);
  const strip = spineStripInArt(config, pageCount, meta.width!, meta.height!);

  const title = (config.publishing.title ?? config.title).toUpperCase();
  const author = (config.publishing.authors?.length
    ? config.publishing.authors.join(', ')
    : config.authorName
  ).toUpperCase();

  const { art, report } = await typesetSpine({
    art: source,
    xPx: strip.xPx,
    widthPx: strip.widthPx,
    title,
    author,
  });

  const outsideStrip = await diffOutsideStrip(source, art, strip.xPx, strip.widthPx);
  if (outsideStrip.pixelsDiffering > 0) {
    throw new Error(
      `Spine repair altered ${outsideStrip.pixelsDiffering} pixels outside the spine. Refusing to save.`,
    );
  }

  const stored = await storage.writeProjectFile(projectId, ['cover', 'cover-wrap-art.png'], art);
  return {
    imagePath: stored.relativePath,
    sourceUsed: chosen,
    strip: { xPx: strip.xPx, widthPx: strip.widthPx },
    report,
    outsideStrip,
  };
}
