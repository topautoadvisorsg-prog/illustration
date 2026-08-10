/**
 * COVER PRODUCTION CANVAS — the full wrap, at print resolution, with guides.
 *
 * Produces two files from one geometry:
 *   cover-canvas.png    the bare wrap, exactly the size KDP expects
 *   cover-guides.png    the same wrap with review overlays drawn on top
 *
 * The guides live ONLY in the review file. They are drawn as a separate
 * composite over a copy, never into the canvas itself, because a trim mark that
 * survives into an uploaded cover prints on the book.
 *
 *   yarn workspace @wildlands/backend cover:canvas -- --pages 154 --paper white
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { computeWrapGeometry, type PaperStock, type Rect } from '../src/pipeline/cover/kdp-geometry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const OUT = path.join(ROOT, 'qa-shots', 'cover');

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const pageCount = Number(arg('pages') ?? '154');
const paper = (arg('paper') ?? 'white') as PaperStock;
const dpi = Number(arg('dpi') ?? '300');
/** Review render is downscaled so the PNG is viewable; print export is not. */
const previewScale = Number(arg('preview-scale') ?? '0.25');

if (paper !== 'white' && paper !== 'cream') {
  console.error(`paper must be "white" or "cream"; got "${paper}"`);
  process.exit(1);
}

const g = computeWrapGeometry({ trimWidthIn: 5.5, trimHeightIn: 8.5, pageCount, paper, dpi });

const f3 = (n: number): string => n.toFixed(3);
console.log('KDP PAPERBACK WRAP — computed from Amazon published figures');
console.log(`  trim              5.500 x 8.500 in`);
console.log(`  interior pages    ${g.pageCount}`);
console.log(`  paper             ${g.paper}  (${g.paper === 'white' ? '0.002252' : '0.0025'} in/page)`);
console.log(`  SPINE WIDTH       ${f3(g.spineWidthIn)} in`);
console.log(`  WRAP SIZE         ${f3(g.wrapWidthIn)} x ${f3(g.wrapHeightIn)} in`);
console.log(`  at ${g.dpi} dpi       ${g.wrapWidthPx} x ${g.wrapHeightPx} px`);
console.log('');
const show = (label: string, r: Rect): void =>
  console.log(`  ${label.padEnd(18)} x ${f3(r.xIn)}  y ${f3(r.yIn)}  ${f3(r.widthIn)} x ${f3(r.heightIn)} in`);
show('back panel', g.back);
show('spine panel', g.spine);
show('front panel', g.front);
show('back safe area', g.backSafe);
show('front safe area', g.frontSafe);
show('spine text safe', g.spineTextSafe);
show('barcode keep-out', g.barcode);
console.log('');
for (const n of g.notes) console.log(`  - ${n}`);

// ── The canvas ─────────────────────────────────────────────────────────────
await mkdir(OUT, { recursive: true });

const bare = await sharp({
  create: { width: g.wrapWidthPx, height: g.wrapHeightPx, channels: 3, background: '#ffffff' },
})
  .png()
  .toBuffer();
await writeFile(path.join(OUT, 'cover-canvas.png'), bare);

// ── The guides, drawn only onto the review copy ────────────────────────────
const S = previewScale;
const W = Math.round(g.wrapWidthPx * S);
const H = Math.round(g.wrapHeightPx * S);
const toPx = (inches: number): number => inches * g.dpi * S;
const box = (r: Rect, stroke: string, dash: string, label: string, labelAt: 'top' | 'bottom' = 'top'): string =>
  `<rect x="${toPx(r.xIn)}" y="${toPx(r.yIn)}" width="${toPx(r.widthIn)}" height="${toPx(r.heightIn)}" ` +
  `fill="none" stroke="${stroke}" stroke-width="2" stroke-dasharray="${dash}"/>` +
  `<text x="${toPx(r.xIn) + 6}" y="${labelAt === 'top' ? toPx(r.yIn) + 18 : toPx(r.yIn + r.heightIn) - 8}" ` +
  `font-family="sans-serif" font-size="13" font-weight="700" fill="${stroke}">${label}</text>`;

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#999" stroke-width="2"/>
  <text x="6" y="16" font-family="sans-serif" font-size="13" font-weight="700" fill="#999">BLEED EDGE ${f3(g.wrapWidthIn)} x ${f3(g.wrapHeightIn)} in</text>
  ${box(g.trim, '#c1121f', '0', 'TRIM')}
  ${box(g.back, '#1d3557', '6 4', 'BACK')}
  ${box(g.spine, '#6a4c93', '6 4', '')}
  ${box(g.front, '#1d3557', '6 4', 'FRONT')}
  ${box(g.backSafe, '#2a9d8f', '3 3', 'safe', 'bottom')}
  ${box(g.frontSafe, '#2a9d8f', '3 3', 'safe', 'bottom')}
  ${box(g.spineTextSafe, '#6a4c93', '2 2', '')}
  ${box(g.barcode, '#e76f51', '4 3', 'BARCODE KEEP-OUT', 'bottom')}
  <text x="${toPx(g.spine.xIn + g.spine.widthIn / 2)}" y="${toPx(g.spine.yIn) + 34}"
        font-family="sans-serif" font-size="12" font-weight="700" fill="#6a4c93"
        transform="rotate(90 ${toPx(g.spine.xIn + g.spine.widthIn / 2)} ${toPx(g.spine.yIn) + 34})">SPINE ${f3(g.spineWidthIn)}in</text>
</svg>`;

const guided = await sharp(bare)
  .resize(W, H)
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png()
  .toBuffer();
await writeFile(path.join(OUT, 'cover-guides.png'), guided);

await writeFile(path.join(OUT, 'cover-geometry.json'), `${JSON.stringify(g, null, 2)}\n`);

console.log(`\nwrote cover-canvas.png   ${g.wrapWidthPx}x${g.wrapHeightPx}px  (print, no guides)`);
console.log(`wrote cover-guides.png   ${W}x${H}px  (review only — these guides never reach an export)`);
console.log(`wrote cover-geometry.json`);
process.exit(0);
