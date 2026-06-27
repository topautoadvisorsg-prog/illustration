/* LOCAL paperback cover-wrap PREVIEW with KDP guidelines (bleed / trim / safe /
 * spine / barcode). Computes the PAPERBACK wrap dimensions (7x10, 276pp, Premium
 * Color) and draws the dotted-line template over the existing cover art so the
 * operator can see how it fits. No spend; read-only. Writes a PNG to Downloads.
 *   node ../node_modules/tsx/dist/cli.mjs scripts/paperback-cover-preview.ts
 */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

// ── KDP paperback wrap math (7x10, Premium Color) ──
const TRIM_W = 7, TRIM_H = 10, BLEED = 0.125;
const PAGES = 276;                  // 275 interior, rounded up to even (KDP)
const PREMIUM_COLOR_PER_PAGE = 0.002347;
const SPINE = +(PAGES * PREMIUM_COLOR_PER_PAGE).toFixed(3); // ~0.648"
const SAFE = 0.25;                  // text-safe inset from trim
const FULL_W = TRIM_W * 2 + SPINE + BLEED * 2;   // ~14.898"
const FULL_H = TRIM_H + BLEED * 2;               // 10.25"
const DPI = 110;
const px = (inch: number) => Math.round(inch * DPI);
const W = px(FULL_W), H = px(FULL_H);

// Panel x-boundaries (inches): [bleed | back 7 | spine | front 7 | bleed]
const xTrimL = BLEED;
const xSpineL = BLEED + TRIM_W;
const xSpineR = xSpineL + SPINE;
const xTrimR = xSpineR + TRIM_W;
const yTrimT = BLEED, yTrimB = BLEED + TRIM_H;

const dash = 'stroke-dasharray="14,9"';
function vline(xIn: number, color: string) { return `<line x1="${px(xIn)}" y1="0" x2="${px(xIn)}" y2="${H}" stroke="${color}" stroke-width="4" ${dash}/>`; }
function rect(xi: number, yi: number, wi: number, hi: number, color: string, w = 4) { return `<rect x="${px(xi)}" y="${px(yi)}" width="${px(wi)}" height="${px(hi)}" fill="none" stroke="${color}" stroke-width="${w}" ${dash}/>`; }
function chip(xIn: number, yIn: number, t: string, color: string, size = 24) {
  const w = t.length * size * 0.62 + 16, h = size + 12;
  return `<rect x="${px(xIn) - 4}" y="${px(yIn) - size}" width="${w}" height="${h}" rx="5" fill="#ffffff" opacity="0.9"/>` +
    `<text x="${px(xIn) + 4}" y="${px(yIn)}" font-family="sans-serif" font-size="${size}" font-weight="800" fill="${color}">${t}</text>`;
}

const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" opacity="0.34"/>                                   <!-- scrim so lines pop -->
  <rect x="2" y="2" width="${W - 4}" height="${H - 4}" fill="none" stroke="#E0218A" stroke-width="6"/>           <!-- BLEED edge -->
  ${rect(xTrimL, yTrimT, xTrimR - xTrimL, yTrimB - yTrimT, '#00B7C2', 2)}                                          <!-- TRIM -->
  ${rect(xTrimL + SAFE, yTrimT + SAFE, (xTrimR - xTrimL) - 2 * SAFE, (yTrimB - yTrimT) - 2 * SAFE, '#2Fb344', 2)}   <!-- SAFE -->
  ${vline(xSpineL, '#F08A24')} ${vline(xSpineR, '#F08A24')}                                                        <!-- SPINE -->
  ${rect(xSpineL + 0.4, yTrimB - SAFE - 1.2, 2, 1.2, '#D7263D', 2)}                                                <!-- BARCODE (front lower-left example) -->
  ${rect(BLEED + 0.4, yTrimB - SAFE - 1.2, 2, 1.2, '#D7263D', 2)}                                                  <!-- BARCODE on back, lower-left -->
  ${chip(BLEED + 0.3, 0.55, 'BACK COVER', '#222')}
  ${chip(xSpineL + 0.04, 1.2, 'SPINE', '#F08A24', 16)}
  ${chip(xSpineR + 0.3, 0.55, 'FRONT COVER', '#222')}
  ${chip(0.15, FULL_H - 0.18, 'magenta = bleed edge  ·  cyan = trim (cut)  ·  green = safe  ·  orange = spine  ·  red = barcode zone', '#444', 18)}
  ${chip(BLEED + 0.5, yTrimB - SAFE - 1.3, 'BARCODE', '#D7263D', 16)}
</svg>`;

const project = await getProject(P);
if (!project) { console.error('no project'); process.exit(1); }
const coverPath = ProjectConfigSchema.parse(project.config).publishing.coverAssetPath;
console.log('paperback wrap:', `${FULL_W.toFixed(3)}in x ${FULL_H.toFixed(2)}in @ ${DPI}dpi = ${W}x${H}px | spine ${SPINE}in (${PAGES}pp Premium Color)`);

let base: Buffer;
if (coverPath) {
  const art = await getProjectStorage().readProjectFile(coverPath);
  base = await sharp(art).resize(W, H, { fit: 'cover', position: 'centre' }).modulate({ brightness: 1.04 }).toBuffer();
  console.log('cover art (current wrap, for context):', coverPath);
} else {
  base = await sharp({ create: { width: W, height: H, channels: 3, background: '#E0C8A0' } }).png().toBuffer();
}
const out = await sharp(base).composite([{ input: Buffer.from(overlay), top: 0, left: 0 }]).png().toBuffer();
const file = 'C:/Users/jovan/Downloads/PAPERBACK_COVER_PREVIEW.png';
writeFileSync(file, out);
console.log('saved →', file);
process.exit(0);
