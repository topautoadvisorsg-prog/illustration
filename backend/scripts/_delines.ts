/* Detect + remove the baked-in ORANGE vertical guide lines from a render, without
 * re-rendering. Finds columns with a high density of saturated guide-orange pixels
 * (the dashed lines), then bridges each band horizontally from its neighbours so the
 * illustration/parchment reconstructs smoothly. Writes before/after. Read-only test.
 * Usage: _delines.ts <pageKey> */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const KEY = process.argv[2] ?? 'CH02_P004_c2';
const db = getDb();
const storage = getProjectStorage();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0]!;
const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown>;
const pngPath = (r.printPngPath as string) ?? (r.printPdfPath as string).replace('.print.pdf', '.print.png');
const src = await storage.readProjectFile(pngPath);

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const idx = (x: number, y: number) => (y * W + x) * C;
// saturated guide-orange (≈ #B5500A): high R, low B, clearly redder/oranger than parchment.
function isGuide(x: number, y: number): boolean {
  const i = idx(x, y); const R = data[i], G = data[i + 1], B = data[i + 2];
  return R > 120 && G > 35 && G < 135 && B < 85 && R - B > 75 && R - G > 38;
}
// A guide line is a THIN column with guide-orange spread across the FULL height
// (a dashed line runs top→bottom). Illustration oranges (a pinecone, foliage) are
// localised to one region → they fail the "present in all 3 thirds" test.
const third = Math.floor(H / 3);
const colCount = new Array(W).fill(0);
const colThirds: number[][] = Array.from({ length: W }, () => [0, 0, 0]);
for (let x = 0; x < W; x++) {
  for (let y = 0; y < H; y++) if (isGuide(x, y)) { colCount[x]++; colThirds[x][Math.min(2, Math.floor(y / third))]++; }
}
const isGuideCol = (x: number) => colCount[x] >= H * 0.18 && colThirds[x].filter((c) => c >= third * 0.06).length >= 2;
const raw: Array<[number, number]> = [];
let s = -1;
for (let x = 0; x < W; x++) { if (isGuideCol(x)) { if (s < 0) s = x; } else if (s >= 0) { raw.push([s, x - 1]); s = -1; } }
if (s >= 0) raw.push([s, W - 1]);
const bands = raw.filter(([a, b]) => b - a <= 5); // guide lines are thin (≤6px); reject wide illustration edges
console.log(`${KEY}: line bands (x0..x1, /${(W / 7.25).toFixed(0)}dpi):`, bands.map(([a, b]) => `${a}-${b} (~${(a / (W / 7.25)).toFixed(2)}in)`).join(', ') || 'NONE');

// bridge each band horizontally (pad ±2px), interpolating from the immediate neighbours
const out = Buffer.from(data);
for (let [x0, x1] of bands) {
  x0 = Math.max(1, x0 - 2); x1 = Math.min(W - 2, x1 + 2);
  const span = x1 - x0 + 2;
  for (let y = 0; y < H; y++) {
    const li = idx(x0 - 1, y), ri = idx(x1 + 1, y);
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0 + 1) / span;
      const oi = idx(x, y);
      for (let k = 0; k < 3; k++) out[oi + k] = Math.round(data[li + k] * (1 - t) + data[ri + k] * t);
    }
  }
}
const cleaned = await sharp(out, { raw: { width: W, height: H, channels: C } }).png().toBuffer();
const before = await sharp(src).resize({ width: 360 }).png().toBuffer();
const after = await sharp(cleaned).resize({ width: 360 }).png().toBuffer();
const bh = (await sharp(before).metadata()).height!;
const labels = `<svg xmlns="http://www.w3.org/2000/svg" width="${360 * 2 + 36}" height="${bh + 30}"><text x="180" y="20" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#a00">BEFORE (lines)</text><text x="${360 + 36 + 180}" y="20" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#0a7a2a">AFTER (removed)</text></svg>`;
const cmp = await sharp({ create: { width: 360 * 2 + 36, height: bh + 30, channels: 3, background: '#fff' } })
  .composite([{ input: before, left: 12, top: 30 }, { input: after, left: 360 + 24, top: 30 }, { input: await sharp(Buffer.from(labels)).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
writeFileSync('C:/Users/jovan/Downloads/_delines_cmp.png', cmp);
// high-res zoom around the right guide band so the line removal is judgeable
const rb = bands.find(([a]) => a > W * 0.6) ?? bands[bands.length - 1];
if (rb) {
  const cropOpt = { left: Math.max(0, rb[0] - 110), top: 900, width: 240, height: 700 };
  const zb = await sharp(src).extract(cropOpt).resize({ width: 360 }).png().toBuffer();
  const za = await sharp(cleaned).extract(cropOpt).resize({ width: 360 }).png().toBuffer();
  const zh = (await sharp(zb).metadata()).height!;
  const zl = `<svg xmlns="http://www.w3.org/2000/svg" width="${360 * 2 + 36}" height="${zh + 30}"><text x="180" y="20" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#a00">BEFORE</text><text x="${360 + 36 + 180}" y="20" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#0a7a2a">AFTER</text></svg>`;
  const zcmp = await sharp({ create: { width: 360 * 2 + 36, height: zh + 30, channels: 3, background: '#fff' } })
    .composite([{ input: zb, left: 12, top: 30 }, { input: za, left: 360 + 24, top: 30 }, { input: await sharp(Buffer.from(zl)).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
  writeFileSync('C:/Users/jovan/Downloads/_delines_zoom.png', zcmp);
}
console.log('→ _delines_cmp.png + _delines_zoom.png');
process.exit(0);
