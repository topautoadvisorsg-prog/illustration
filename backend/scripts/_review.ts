/* Read-only: build a contact sheet (top + bottom strip of each page) for the
 * pages of a chapter that have ALREADY rendered, so we can catch a systematic
 * issue mid-batch before it carries through the rest. */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

const P = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';
const CH = process.argv[2] ?? 'CH02';
const MINS = Number(process.argv[3] ?? '60');
const cutoff = new Date(Date.now() - MINS * 60_000);
const db = getDb();
const storage = getProjectStorage();
const all = await listPaginatedPagesForProject(P);
const chap = all.filter((p) => new RegExp('^' + CH + '_').test(p.pageKey || '')).sort((a, b) => (a.plannedPageNumber ?? 0) - (b.plannedPageNumber ?? 0));
const W = 540, LBL = 22;
const rows: { buf: Buffer; h: number }[] = [];
let done = 0;
for (const pg of chap) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, pg.pageKey))))[0];
  const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0];
  if (!r?.imagePath || !(new Date(r.createdAt as any) > cutoff)) continue;
  done++;
  const img = await storage.readProjectFile(r.imagePath);
  const m = await sharp(img).metadata(); const h = m.height!, w = m.width!;
  const top = await sharp(img).extract({ left: 0, top: 0, width: w, height: Math.round(h * 0.15) }).resize({ width: W }).toBuffer();
  const bt = Math.round(h * 0.85);
  const bot = await sharp(img).extract({ left: 0, top: bt, width: w, height: h - bt }).resize({ width: W }).toBuffer();
  const tH = (await sharp(top).metadata()).height!, bH = (await sharp(bot).metadata()).height!;
  const lbl = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LBL}"><rect width="100%" height="100%" fill="#2b1d10"/><text x="6" y="16" font-family="sans-serif" font-size="13" fill="#fff">folio ${pg.plannedPageNumber} · ${pg.pageKey} · TOP / BOTTOM</text></svg>`)).png().toBuffer();
  const rowH = LBL + tH + 5 + bH + 10;
  rows.push({ buf: await sharp({ create: { width: W, height: rowH, channels: 3, background: '#ddd' } }).composite([{ input: lbl, top: 0, left: 0 }, { input: top, top: LBL, left: 0 }, { input: bot, top: LBL + tH + 5, left: 0 }]).png().toBuffer(), h: rowH });
}
const totalH = rows.reduce((s, r) => s + r.h + 6, 6);
let y = 6; const comps: sharp.OverlayOptions[] = [];
for (const r of rows) { comps.push({ input: r.buf, top: y, left: 0 }); y += r.h + 6; }
writeFileSync(`C:/Users/jovan/Downloads/_review_${CH}.png`, await sharp({ create: { width: W, height: totalH, channels: 3, background: '#fff' } }).composite(comps).png().toBuffer());
console.log(`reviewed ${done} done ${CH} pages → _review_${CH}.png`);
process.exit(0);
