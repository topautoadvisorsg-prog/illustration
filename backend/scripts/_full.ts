/* View whole active render(s) scaled to a readable width, stacked. Usage: _full.ts <key...> */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

import { P } from './_project.js';
const W = 460;
const db = getDb();
const storage = getProjectStorage();
const imgs: Buffer[] = [];
for (const KEY of process.argv.slice(2)) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
  if (!row) continue;
  const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0];
  if (!r?.imagePath) continue;
  const img = await storage.readProjectFile(r.imagePath);
  const scaled = await sharp(img).resize({ width: W }).toBuffer();
  const h = (await sharp(scaled).metadata()).height!;
  const lbl = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="18"><rect width="100%" height="100%" fill="#2b1d10"/><text x="6" y="13" font-family="sans-serif" font-size="12" fill="#fff">${KEY}</text></svg>`)).png().toBuffer();
  imgs.push(await sharp({ create: { width: W, height: h + 18, channels: 3, background: '#fff' } }).composite([{ input: lbl, top: 0, left: 0 }, { input: scaled, top: 18, left: 0 }]).png().toBuffer());
}
const metas = await Promise.all(imgs.map((b) => sharp(b).metadata()));
const totalH = metas.reduce((s, m) => s + m.height! + 6, 6);
let y = 6; const comps: sharp.OverlayOptions[] = [];
for (let i = 0; i < imgs.length; i++) { comps.push({ input: imgs[i], top: y, left: 0 }); y += metas[i].height! + 6; }
writeFileSync('C:/Users/jovan/Downloads/_full.png', await sharp({ create: { width: W, height: totalH, channels: 3, background: '#ddd' } }).composite(comps).png().toBuffer());
console.log('→ _full.png', imgs.length, 'pages');
process.exit(0);
