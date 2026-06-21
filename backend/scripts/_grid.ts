/* Thumbnail GRID of active renders for review at a glance. Usage: _grid.ts <out> <key...> */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

import { P } from './_project.js';
const OUT = process.argv[2] ?? 'grid';
const KEYS = process.argv.slice(3);
const COLS = 5, TW = 150, LBL = 16, GAP = 4;
const db = getDb();
const storage = getProjectStorage();

const cells: Buffer[] = [];
for (const KEY of KEYS) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
  if (!row) continue;
  const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0];
  if (!r?.imagePath) continue;
  const img = await storage.readProjectFile(r.imagePath);
  const thumb = await sharp(img).resize({ width: TW }).toBuffer();
  const th = (await sharp(thumb).metadata()).height!;
  const lbl = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${LBL}"><rect width="100%" height="100%" fill="#2b1d10"/><text x="3" y="12" font-family="sans-serif" font-size="10" fill="#fff">${KEY.replace(/^CH0?/, 'C').replace('_INTRODUCTION', '')} · ${(r.layoutTemplate || 'role').replace('LAYOUT_', '').replace('_TOP_RIGHT', '').slice(0, 14)}</text></svg>`)).png().toBuffer();
  cells.push(await sharp({ create: { width: TW, height: th + LBL, channels: 3, background: '#fff' } }).composite([{ input: lbl, top: 0, left: 0 }, { input: thumb, top: LBL, left: 0 }]).png().toBuffer());
}
const metas = await Promise.all(cells.map((b) => sharp(b).metadata()));
const rowH = Math.max(...metas.map((m) => m.height!)) + GAP;
const rows = Math.ceil(cells.length / COLS);
const W = COLS * (TW + GAP) + GAP, H = rows * rowH + GAP;
const comps: sharp.OverlayOptions[] = [];
cells.forEach((c, i) => { comps.push({ input: c, left: GAP + (i % COLS) * (TW + GAP), top: GAP + Math.floor(i / COLS) * rowH }); });
writeFileSync(`C:/Users/jovan/Downloads/_${OUT}.png`, await sharp({ create: { width: W, height: H, channels: 3, background: '#cfc8b8' } }).composite(comps).png().toBuffer());
console.log(`→ _${OUT}.png  (${cells.length} pages, ${COLS}-wide grid)`);
process.exit(0);
