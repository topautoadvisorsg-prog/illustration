/* Read-only: for each pageKey, take the active render and emit a full-width crop of
 * the BOTTOM third with the orange trim-safe rail (93.9% of canvas height) drawn as a
 * solid line, so we can see whether baked text clears the rail. Usage: _railcheck.ts <key...> */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

const P = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';
const KEYS = process.argv.slice(2);
const db = getDb();
const storage = getProjectStorage();
const RAIL = 0.625 / 10.25; // rail bottom inset as fraction of canvas height ≈ 0.061 → line at 1-0.061
const rows: Buffer[] = [];
const W = 760;

for (const KEY of KEYS) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
  if (!row) { console.log('skip', KEY); continue; }
  const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0];
  if (!r?.imagePath) { console.log('no render', KEY); continue; }
  const img = await storage.readProjectFile(r.imagePath);
  const m = await sharp(img).metadata();
  const h = m.height!, w = m.width!;
  const top = Math.round(h * 0.62);
  let crop = await sharp(img).extract({ left: 0, top, width: w, height: h - top }).resize({ width: W }).toBuffer();
  const ch = (await sharp(crop).metadata()).height!;
  // rail line y within the crop: rail at (1-RAIL)*h, crop starts at top → (railY-top) scaled.
  const railY = Math.round(((1 - RAIL) * h - top) * (W / w));
  const botTrimY = Math.round((h - top) * (W / w)); // bottom trim edge ~ canvas bottom (approx)
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${ch}">
    <line x1="0" y1="${railY}" x2="${W}" y2="${railY}" stroke="#E08A2E" stroke-width="3" stroke-dasharray="14 8"/>
    <text x="6" y="${railY - 6}" font-family="sans-serif" font-size="15" fill="#E08A2E">SAFE RAIL — text must stay ABOVE</text>
    <rect x="0" y="0" width="${W}" height="20" fill="#2b1d10"/>
    <text x="6" y="15" font-family="sans-serif" font-size="13" fill="#fff">${KEY}  ·  bottom third  ·  rail at 93.9%</text>
  </svg>`;
  crop = await sharp(crop).composite([{ input: Buffer.from(overlay), top: 0, left: 0 }]).png().toBuffer();
  void botTrimY;
  rows.push(crop);
}
if (rows.length) {
  const metas = await Promise.all(rows.map((b) => sharp(b).metadata()));
  const totalH = metas.reduce((s, m) => s + m.height! + 8, 8);
  let y = 8; const comps: sharp.OverlayOptions[] = [];
  for (let i = 0; i < rows.length; i++) { comps.push({ input: rows[i], top: y, left: 0 }); y += metas[i].height! + 8; }
  const out = 'C:/Users/jovan/Downloads/_railcheck.png';
  writeFileSync(out, await sharp({ create: { width: W, height: totalH, channels: 3, background: '#fff' } }).composite(comps).png().toBuffer());
  console.log('→', out, `(${rows.length} pages)`);
}
process.exit(0);
