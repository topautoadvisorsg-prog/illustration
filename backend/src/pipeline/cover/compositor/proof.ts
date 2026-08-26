/**
 * PROOF RENDERING — the version a human looks at before anything ships.
 *
 * The production cover carries no guides. This one carries every line an
 * operator needs to approve a wrap without measuring it by hand: the panels, the
 * trim, the folds and hinges, the safe zones, the spine-text strip, and the
 * rectangle KDP may drop a barcode into.
 *
 * The barcode rectangle is the reason this exists. Back-cover copy invading that
 * region is invisible in a PDF viewer and obvious on a printed book, which is
 * exactly the wrong order to find out.
 */
import sharp from 'sharp';
import type { CoverGeometry, Rect } from './geometry.js';
import type { Check } from './validate.js';

export interface ProofOptions {
  /** DPI of the composed raster being annotated. */
  dpi: number;
  /** Proof output DPI. Lower keeps the file openable; guides stay legible. */
  proofDpi?: number;
  checks?: Check[];
}

const COLOURS = {
  trim: '#00a0c8',
  safe: '#c8a000',
  fold: '#d000a0',
  hinge: '#7a2fd0',
  barcode: '#a32d20',
  spine: '#8a5a10',
  frame: '#101418',
};

export async function renderProof(composed: Buffer, g: CoverGeometry, opts: ProofOptions): Promise<Buffer> {
  const proofDpi = opts.proofDpi ?? 150;
  const W = Math.round(g.fullWidthIn * proofDpi);
  const H = Math.round(g.fullHeightIn * proofDpi);
  const px = (i: number) => Math.round(i * proofDpi);

  const base = await sharp(composed).resize({ width: W, height: H, fit: 'fill', kernel: 'lanczos3' }).toBuffer();

  const box = (r: Rect, stroke: string, dash: string, label?: string, dy = 15) =>
    `<rect x="${px(r.xIn)}" y="${px(r.yIn)}" width="${px(r.widthIn)}" height="${px(r.heightIn)}" ` +
    `fill="none" stroke="${stroke}" stroke-width="2" stroke-dasharray="${dash}"/>` +
    (label
      ? `<text x="${px(r.xIn) + 6}" y="${px(r.yIn) + dy}" font-family="monospace" font-size="12" ` +
        `fill="${stroke}" stroke="#ffffff" stroke-width="0.6" paint-order="stroke">${label}</text>`
      : '');

  const vline = (xIn: number, stroke: string, label: string) =>
    `<line x1="${px(xIn)}" y1="0" x2="${px(xIn)}" y2="${H}" stroke="${stroke}" stroke-width="2"/>` +
    `<text x="${px(xIn) + 4}" y="${H - 8}" font-family="monospace" font-size="12" fill="${stroke}" ` +
    `stroke="#ffffff" stroke-width="0.6" paint-order="stroke">${label}</text>`;

  const parts: string[] = [];

  // full cover bounds
  parts.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${COLOURS.frame}" stroke-width="2"/>`);

  // panels, trim (or board on a hardcover)
  const panelLabel = g.panelIsBoard ? 'BOARD' : 'TRIM';
  parts.push(box(g.backPanel, COLOURS.trim, '10 6', `BACK ${panelLabel}`));
  parts.push(box(g.frontPanel, COLOURS.trim, '10 6', `FRONT ${panelLabel}`));

  // safe zones
  parts.push(box(g.backSafe, COLOURS.safe, '6 5', `safe ${g.safeInsetIn}in`));
  parts.push(box(g.frontSafe, COLOURS.safe, '6 5', `safe ${g.safeInsetIn}in`));

  // spine and its text strip
  parts.push(
    `<rect x="${px(g.spinePanel.xIn)}" y="0" width="${px(g.spineIn)}" height="${H}" ` +
      `fill="#000000" fill-opacity="0.05"/>`,
  );
  parts.push(box(g.spineSafe, COLOURS.spine, '4 4', 'SPINE TEXT'));

  // folds
  parts.push(vline(g.foldLeftIn, COLOURS.fold, `fold ${g.foldLeftIn.toFixed(3)}`));
  parts.push(vline(g.foldRightIn, COLOURS.fold, `fold ${g.foldRightIn.toFixed(3)}`));

  // hinges, hardcover only
  if (g.hingeIn !== null) {
    parts.push(vline(g.foldLeftIn - g.hingeIn, COLOURS.hinge, `hinge ${g.hingeIn}`));
    parts.push(vline(g.foldRightIn + g.hingeIn, COLOURS.hinge, `hinge ${g.hingeIn}`));
  }

  // barcode reserve, drawn solid because it is the one region content must not enter
  parts.push(
    `<rect x="${px(g.barcodeSafe.xIn)}" y="${px(g.barcodeSafe.yIn)}" width="${px(g.barcodeSafe.widthIn)}" ` +
      `height="${px(g.barcodeSafe.heightIn)}" fill="${COLOURS.barcode}" fill-opacity="0.18" ` +
      `stroke="${COLOURS.barcode}" stroke-width="2"/>` +
      `<text x="${px(g.barcodeSafe.xIn) + 6}" y="${px(g.barcodeSafe.yIn) + 16}" font-family="monospace" ` +
      `font-size="12" fill="${COLOURS.barcode}" stroke="#ffffff" stroke-width="0.6" paint-order="stroke">BARCODE RESERVE</text>`,
  );

  // caption
  const caption =
    `${g.binding} ${g.ink} ${g.paper} ${g.trim}in ${g.pageCount}pp — ` +
    `spine ${g.spineIn.toFixed(4)}in — wrap ${g.fullWidthIn.toFixed(3)} x ${g.fullHeightIn.toFixed(3)}in — ` +
    `${g.spineAuthority}`;
  parts.push(
    `<rect x="0" y="0" width="${W}" height="26" fill="#ffffff" fill-opacity="0.82"/>` +
      `<text x="8" y="18" font-family="monospace" font-size="13" fill="#14181c">${escapeXml(caption)}</text>`,
  );

  const failed = (opts.checks ?? []).filter((c) => c.status === 'FAIL');
  if (failed.length) {
    parts.push(
      `<rect x="0" y="${H - 30}" width="${W}" height="30" fill="${COLOURS.barcode}" fill-opacity="0.9"/>` +
        `<text x="8" y="${H - 10}" font-family="monospace" font-size="14" fill="#ffffff">` +
        `${escapeXml(`BLOCKED — ${failed.map((f) => f.label).join('; ')}`)}</text>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;
  return sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer();
}

function escapeXml(s: string): string {
  return s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
}
