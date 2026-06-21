/* Human-readable LAYOUT DIAGRAM for each page: a scaled page with the illustration
 * zone(s) and text zone(s) drawn and LABELED, plus the focal-illustration %, the
 * trim line and the safe line. Shows where the art is and how big — no page render,
 * no spend. Usage: _layoutpreview.ts <out> <key...> */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { prepareRender } from '../src/pipeline/whole-page-render/render-whole-page.js';

import { P } from './_project.js';
const OUT = process.argv[2] ?? 'lp';
const KEYS = process.argv.slice(3);
const db = getDb();
const PW = 200, PH = Math.round(PW * (10.25 / 7.25)), LBL = 30, COLS = 4, GAP = 8;

function rect(x: number, y: number, w: number, h: number, fill: string, stroke: string, label: string, lcolor = '#222') {
  const px = (x / 100) * PW, py = (y / 100) * PH, pw = (w / 100) * PW, ph = (h / 100) * PH;
  return `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`
    + (label ? `<text x="${(px + pw / 2).toFixed(1)}" y="${(py + ph / 2).toFixed(1)}" font-family="sans-serif" font-size="9" fill="${lcolor}" text-anchor="middle" dominant-baseline="middle">${label}</text>` : '');
}

const cells: Buffer[] = [];
for (const KEY of KEYS) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
  if (!row) continue;
  const prep = await prepareRender(row.id);
  const a = prep.allocation;
  const focal = a.imagePriorityZones.filter((z) => z.role === 'primary-art' || z.role === 'supporting-art');
  const illoPct = Math.round(focal.reduce((s, z) => s + (z.widthPct * z.heightPct) / 100, 0));
  const parts: string[] = [`<rect x="0" y="0" width="${PW}" height="${PH}" fill="#efe7d2"/>`];
  // background field (subtle wash)
  if (a.imagePriorityZones.some((z) => z.role === 'background-art')) parts.push(rect(0, 0, 100, 100, '#e3ecdf', 'none', ''));
  // focal illustration zones
  for (const z of focal) parts.push(rect(z.xPct, z.yPct, z.widthPct, z.heightPct, 'rgba(74,140,90,0.55)', '#2f6b3f', 'ILLUSTRATION'));
  // text zones
  for (const z of a.textSafeZones.filter((z) => z.role === 'body')) parts.push(rect(z.xPct, z.yPct, z.widthPct, z.heightPct, 'rgba(210,190,140,0.55)', '#9a7b30', 'TEXT'));
  for (const z of a.typographyZones) parts.push(rect(z.xPct, z.yPct, z.widthPct, z.heightPct, 'rgba(192,57,43,0.35)', '#c0392b', 'TITLE', '#7a2018'));
  // trim (red) + safe (orange) guides
  parts.push(`<rect x="${(1.72 / 100 * PW).toFixed(1)}" y="${(1.22 / 100 * PH).toFixed(1)}" width="${(96.56 / 100 * PW).toFixed(1)}" height="${(97.56 / 100 * PH).toFixed(1)}" fill="none" stroke="#cc2222" stroke-width="1" stroke-dasharray="3 2"/>`);
  parts.push(`<rect x="${(8.62 / 100 * PW).toFixed(1)}" y="${(6.10 / 100 * PH).toFixed(1)}" width="${(82.76 / 100 * PW).toFixed(1)}" height="${(87.80 / 100 * PH).toFixed(1)}" fill="none" stroke="#e08a2e" stroke-width="1" stroke-dasharray="3 2"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}">${parts.join('')}</svg>`;
  const diagram = await sharp(Buffer.from(svg)).png().toBuffer();
  const lbl = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${LBL}"><rect width="100%" height="100%" fill="#2b1d10"/><text x="4" y="13" font-family="sans-serif" font-size="11" fill="#fff">${KEY.replace('_INTRODUCTION', '').replace('_GLOSSARY', '_GLOS').replace('_INDEX', '_IDX')}</text><text x="4" y="26" font-family="sans-serif" font-size="11" fill="#7fdca0">illustration ≈ ${illoPct}% of page</text></svg>`)).png().toBuffer();
  cells.push(await sharp({ create: { width: PW, height: PH + LBL, channels: 3, background: '#fff' } }).composite([{ input: lbl, top: 0, left: 0 }, { input: diagram, top: LBL, left: 0 }]).png().toBuffer());
}
const rowH = PH + LBL + GAP;
const rows = Math.ceil(cells.length / COLS);
const W = COLS * (PW + GAP) + GAP, H = rows * rowH + GAP;
const comps: sharp.OverlayOptions[] = [];
cells.forEach((c, i) => comps.push({ input: c, left: GAP + (i % COLS) * (PW + GAP), top: GAP + Math.floor(i / COLS) * rowH }));
writeFileSync(`C:/Users/jovan/Downloads/_${OUT}.png`, await sharp({ create: { width: W, height: H, channels: 3, background: '#cfc8b8' } }).composite(comps).png().toBuffer());
console.log(`→ _${OUT}.png  (${cells.length} layout diagrams)`);
process.exit(0);
