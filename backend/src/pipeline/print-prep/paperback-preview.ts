/**
 * Paperback cover-wrap PREVIEW with KDP guidelines (bleed / trim / safe / spine /
 * barcode), composited over the cover art so the operator can check fit in the
 * console. Pure image composition (sharp) — no DB, no spend. Used by the
 * paperback-preview route; rendered into Step 7 of the Production Console.
 */
import sharp from 'sharp';

export interface PaperbackPreviewOpts {
  pageCount: number; // interior page count (rounded up to even for KDP)
  trimWidthIn?: number;
  trimHeightIn?: number;
  bleedIn?: number;
  perPageIn?: number; // paper thickness; Premium Color ≈ 0.002347
  dpi?: number;
}

/** Compose the paperback wrap preview PNG (cover art dimmed + dotted KDP guides). */
export async function composePaperbackGuidePreview(coverArtPng: Buffer, o: PaperbackPreviewOpts): Promise<Buffer> {
  const TRIM_W = o.trimWidthIn ?? 7;
  const TRIM_H = o.trimHeightIn ?? 10;
  const BLEED = o.bleedIn ?? 0.125;
  const PER_PAGE = o.perPageIn ?? 0.002347; // Premium Color
  const SAFE = 0.25;
  const pages = o.pageCount % 2 === 0 ? o.pageCount : o.pageCount + 1; // KDP needs even
  const spine = +(pages * PER_PAGE).toFixed(3);
  const fullW = TRIM_W * 2 + spine + BLEED * 2;
  const fullH = TRIM_H + BLEED * 2;
  const dpi = o.dpi ?? 110;
  const px = (inch: number) => Math.round(inch * dpi);
  const W = px(fullW), H = px(fullH);

  const xTrimL = BLEED, xSpineL = BLEED + TRIM_W, xSpineR = xSpineL + spine, xTrimR = xSpineR + TRIM_W;
  const yTrimT = BLEED, yTrimB = BLEED + TRIM_H;
  const dash = 'stroke-dasharray="14,9"';
  const vline = (xi: number, c: string) => `<line x1="${px(xi)}" y1="0" x2="${px(xi)}" y2="${H}" stroke="${c}" stroke-width="4" ${dash}/>`;
  const box = (xi: number, yi: number, wi: number, hi: number, c: string, w = 3) => `<rect x="${px(xi)}" y="${px(yi)}" width="${px(wi)}" height="${px(hi)}" fill="none" stroke="${c}" stroke-width="${w}" ${dash}/>`;
  const chip = (xi: number, yi: number, t: string, c: string, s = 24) => {
    const w = t.length * s * 0.62 + 16;
    return `<rect x="${px(xi) - 4}" y="${px(yi) - s}" width="${w}" height="${s + 12}" rx="5" fill="#ffffff" opacity="0.9"/>` +
      `<text x="${px(xi) + 4}" y="${px(yi)}" font-family="sans-serif" font-size="${s}" font-weight="800" fill="${c}">${t}</text>`;
  };

  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" opacity="0.34"/>
    <rect x="3" y="3" width="${W - 6}" height="${H - 6}" fill="none" stroke="#E0218A" stroke-width="6"/>
    ${box(xTrimL, yTrimT, xTrimR - xTrimL, yTrimB - yTrimT, '#0098A6', 3)}
    ${box(xTrimL + SAFE, yTrimT + SAFE, (xTrimR - xTrimL) - 2 * SAFE, (yTrimB - yTrimT) - 2 * SAFE, '#2Fb344', 3)}
    ${vline(xSpineL, '#F08A24')} ${vline(xSpineR, '#F08A24')}
    ${box(BLEED + 0.4, yTrimB - SAFE - 1.2, 2, 1.2, '#D7263D', 3)}
    ${chip(BLEED + 0.3, 0.55, 'BACK COVER', '#222')}
    ${chip(xSpineL + 0.02, 1.3, 'SPINE', '#F08A24', 15)}
    ${chip(xSpineR + 0.3, 0.55, 'FRONT COVER', '#222')}
    ${chip(BLEED + 0.5, yTrimB - SAFE - 1.3, 'BARCODE', '#D7263D', 15)}
    ${chip(0.15, fullH - 0.16, 'magenta=bleed  ·  teal=trim(cut)  ·  green=safe  ·  orange=spine  ·  red=barcode   —   ' + fullW.toFixed(2) + 'x' + fullH.toFixed(2) + 'in, spine ' + spine + 'in, ' + pages + 'pp', '#333', 17)}
  </svg>`;

  const base = await sharp(coverArtPng).resize(W, H, { fit: 'cover', position: 'centre' }).toBuffer();
  return sharp(base).composite([{ input: Buffer.from(overlay), top: 0, left: 0 }]).png().toBuffer();
}
