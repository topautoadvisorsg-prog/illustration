/**
 * PROOF SHEETS — make it fast for a person to look at the right pages.
 *
 * A 170-page book is not reviewable by opening a PDF and scrolling. Two outputs
 * solve two different problems:
 *
 *   CONTACT SHEET   the whole book in order, small but legible enough to see
 *                   shape, so a broken page is visible in a sweep.
 *   FLAGGED PROOF   one page large enough to judge, with its neighbours for
 *                   context, and the finding written BESIDE it.
 *
 * ANNOTATION NEVER TOUCHES THE PAGE. Every label sits on a margin outside the
 * page image. Drawing over production content makes a proof that cannot be
 * trusted as a picture of what will print, and someone always ends up looking at
 * the annotated version wondering whether the box is real.
 */
import sharp from 'sharp';

export interface SheetPage {
  n: number;
  png: Buffer;
}

export interface ContactSheetOptions {
  /** Pages across. 6 keeps a 5.5x8.5 page legible at thumbnail width. */
  cols?: number;
  /** Rows per sheet before starting another. */
  rows?: number;
  /** Thumbnail width in pixels. */
  thumbWidthPx?: number;
}

const INK = '#14181c';
const PAPER = '#e9ebed';
const FLAG = '#a32d20';

/**
 * The whole book, in order, across as many sheets as it takes.
 *
 * Paginated rather than one enormous bitmap: a single 170-page image is either
 * too large to open or too small to read, and neither is a review tool.
 */
export async function contactSheets(
  pages: SheetPage[],
  opts: ContactSheetOptions & { flagged?: Set<number> } = {},
): Promise<Buffer[]> {
  const cols = opts.cols ?? 6;
  const rows = opts.rows ?? 5;
  const thumbW = opts.thumbWidthPx ?? 240;
  const perSheet = cols * rows;
  const flagged = opts.flagged ?? new Set<number>();

  const first = await sharp(pages[0]!.png).metadata();
  const aspect = (first.height ?? 1224) / (first.width ?? 792);
  const thumbH = Math.round(thumbW * aspect);

  const capH = 26;
  const cellW = thumbW + 16;
  const cellH = thumbH + capH + 16;

  const out: Buffer[] = [];
  for (let start = 0; start < pages.length; start += perSheet) {
    const slice = pages.slice(start, start + perSheet);
    const sheetW = cols * cellW + 16;
    const sheetH = Math.ceil(slice.length / cols) * cellH + 56;

    const composites: sharp.OverlayOptions[] = [];
    const labels: string[] = [];

    for (let i = 0; i < slice.length; i += 1) {
      const p = slice[i]!;
      const cx = 16 + (i % cols) * cellW;
      const cy = 44 + Math.floor(i / cols) * cellH;
      composites.push({
        input: await sharp(p.png).resize({ width: thumbW, height: thumbH, fit: 'fill' }).png().toBuffer(),
        left: cx,
        top: cy,
      });
      const isFlagged = flagged.has(p.n);
      labels.push(
        `<rect x="${cx - 2}" y="${cy - 2}" width="${thumbW + 4}" height="${thumbH + 4}" fill="none" ` +
          `stroke="${isFlagged ? FLAG : '#9aa3ab'}" stroke-width="${isFlagged ? 3 : 1}"/>` +
          `<text x="${cx}" y="${cy + thumbH + 18}" font-family="monospace" font-size="15" ` +
          `fill="${isFlagged ? FLAG : INK}" font-weight="${isFlagged ? 'bold' : 'normal'}">` +
          `p${p.n}${isFlagged ? '  ●' : ''}</text>`,
      );
    }

    const header =
      `<text x="16" y="28" font-family="monospace" font-size="17" fill="${INK}">` +
      `CONTACT SHEET — pages ${slice[0]!.n} to ${slice[slice.length - 1]!.n} of ${pages.length}` +
      `${flagged.size ? `   ● = flagged` : ''}</text>`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}">${header}${labels.join('')}</svg>`;

    out.push(
      await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: PAPER } })
        .composite([...composites, { input: Buffer.from(svg), left: 0, top: 0 }])
        .png()
        .toBuffer(),
    );
  }
  return out;
}

export interface FlaggedProofInput {
  page: SheetPage;
  before?: SheetPage;
  after?: SheetPage;
  role: string;
  findings: Array<{ code: string; severity: string; detail: string }>;
}

/**
 * One flagged page, large, with its neighbours and the finding beside it.
 *
 * Neighbours matter: composition often only makes sense as a spread. A page that
 * looks short in isolation frequently reads correctly once the page it faces is
 * visible.
 */
export async function flaggedProof(input: FlaggedProofInput): Promise<Buffer> {
  const mainW = 620;
  const sideW = 300;
  const meta = await sharp(input.page.png).metadata();
  const aspect = (meta.height ?? 1224) / (meta.width ?? 792);
  const mainH = Math.round(mainW * aspect);
  const sideH = Math.round(sideW * aspect);

  const panelW = 460;
  const gap = 20;
  const width = gap + sideW + gap + mainW + gap + panelW + gap;
  const height = Math.max(mainH, sideH * 2 + gap) + 92;

  const composites: sharp.OverlayOptions[] = [];
  const marks: string[] = [];

  const sideX = gap;
  if (input.before) {
    composites.push({
      input: await sharp(input.before.png).resize({ width: sideW, height: sideH, fit: 'fill' }).png().toBuffer(),
      left: sideX,
      top: 72,
    });
    marks.push(label(sideX, 72 + sideH + 18, `p${input.before.n} — preceding`, '#5a646e'));
  }
  if (input.after) {
    const y = 72 + sideH + gap + 12;
    composites.push({
      input: await sharp(input.after.png).resize({ width: sideW, height: sideH, fit: 'fill' }).png().toBuffer(),
      left: sideX,
      top: y,
    });
    marks.push(label(sideX, y + sideH + 18, `p${input.after.n} — following`, '#5a646e'));
  }

  const mainX = gap + sideW + gap;
  composites.push({
    input: await sharp(input.page.png).resize({ width: mainW, height: mainH, fit: 'fill' }).png().toBuffer(),
    left: mainX,
    top: 72,
  });
  marks.push(
    `<rect x="${mainX - 3}" y="${69}" width="${mainW + 6}" height="${mainH + 6}" fill="none" stroke="${FLAG}" stroke-width="3"/>`,
  );

  // The panel: everything the machine measured, written OUTSIDE the page.
  const px = mainX + mainW + gap;
  let py = 84;
  marks.push(label(px, py, `PAGE ${input.page.n}`, INK, 22, 'bold'));
  py += 30;
  marks.push(label(px, py, `role: ${input.role}`, '#5a646e', 15));
  py += 34;
  for (const f of input.findings) {
    marks.push(label(px, py, `${f.severity}  ${f.code}`, FLAG, 16, 'bold'));
    py += 22;
    for (const chunk of wrap(f.detail, 52)) {
      marks.push(label(px, py, chunk, INK, 14));
      py += 19;
    }
    py += 14;
  }
  marks.push(label(px, height - 24, 'annotation is outside the page; the page itself is unmodified', '#5a646e', 13));

  const header = label(gap, 34, `FLAGGED PAGE PROOF — p${input.page.n}`, INK, 19, 'bold');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${header}${marks.join('')}</svg>`;

  return sharp({ create: { width, height, channels: 3, background: PAPER } })
    .composite([...composites, { input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toBuffer();
}

/**
 * A focused crop around a region of interest.
 *
 * Never a replacement for the full page: a crop shows the detail and destroys
 * the context that decides whether the detail matters.
 */
export async function regionCrop(
  png: Buffer,
  region: { topFraction: number; heightFraction: number },
  caption: string,
): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const w = meta.width ?? 792;
  const h = meta.height ?? 1224;
  const top = Math.max(0, Math.round(h * region.topFraction));
  const height = Math.min(h - top, Math.max(80, Math.round(h * region.heightFraction)));

  const crop = await sharp(png).extract({ left: 0, top, width: w, height }).png().toBuffer();
  const capH = 34;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${height + capH}">` +
    label(10, 23, caption, INK, 15, 'bold') +
    `</svg>`;

  return sharp({ create: { width: w, height: height + capH, channels: 3, background: PAPER } })
    .composite([{ input: crop, left: 0, top: capH }, { input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toBuffer();
}

function label(x: number, y: number, text: string, fill: string, size = 15, weight = 'normal'): string {
  return (
    `<text x="${x}" y="${y}" font-family="monospace" font-size="${size}" fill="${fill}" ` +
    `font-weight="${weight}">${escapeXml(text)}</text>`
  );
}

function wrap(s: string, n: number): string[] {
  const words = s.split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > n) {
      if (line) out.push(line.trim());
      line = w;
    } else line += ` ${w}`;
  }
  if (line.trim()) out.push(line.trim());
  return out.slice(0, 8);
}

const escapeXml = (s: string): string =>
  s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
