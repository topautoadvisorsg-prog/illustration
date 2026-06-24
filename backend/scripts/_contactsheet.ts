/* NO-RENDER contact sheet: tiles the TOP HALF of each page's ACTIVE render so we can
 * visually confirm opener composition (text-top = good, illustration-top = flipped)
 * without spending any render budget. Reads existing active images only.
 * Usage: _contactsheet.ts <outName> <pageKey> [pageKey ...] */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const OUT = process.argv[2] ?? 'sheet';
const KEYS = process.argv.slice(3);
const db = getDb();
const storage = getProjectStorage();
const ordered = await listPaginatedPagesForProject(P);
const folioOf = new Map(ordered.map((p) => [p.pageKey, p.plannedPageNumber ?? '?']));
const COLW = Number(process.env.COLW ?? 300), COLS = Number(process.env.COLS ?? 3), LBL = 22;

const cells: { buf: Buffer; h: number }[] = [];
for (const KEY of KEYS) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
  if (!row) continue;
  const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown>;
  if (!r?.imagePath) continue;
  const img = await storage.readProjectFile(r.imagePath as string);
  const m = await sharp(img).metadata();
  const w = m.width!, h = m.height!;
  const FRAC = Number(process.env.FRAC ?? 0.5);
  const stripH = Math.round(h * FRAC);
  const stripTop = process.env.BOTTOM === '1' ? h - stripH : 0;
  const top = await sharp(img).extract({ left: 0, top: stripTop, width: w, height: stripH }).resize({ width: COLW }).toBuffer();
  const tH = (await sharp(top).metadata()).height!;
  const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${COLW}" height="${LBL}"><rect width="100%" height="100%" fill="#1f150a"/><text x="6" y="16" font-family="sans-serif" font-size="13" fill="#fff">f${folioOf.get(KEY)}  ${KEY}  v${r.version}</text></svg>`;
  const labelPng = await sharp(Buffer.from(label)).png().toBuffer();
  const cellH = LBL + tH;
  const cell = await sharp({ create: { width: COLW, height: cellH, channels: 3, background: '#cccccc' } })
    .composite([{ input: labelPng, top: 0, left: 0 }, { input: top, top: LBL, left: 0 }]).png().toBuffer();
  cells.push({ buf: cell, h: cellH });
}
const rowH = Math.max(...cells.map((c) => c.h)) + 8;
const nRows = Math.ceil(cells.length / COLS);
const sheetW = COLS * (COLW + 8) + 8, sheetH = nRows * rowH + 8;
const comps: sharp.OverlayOptions[] = [];
cells.forEach((c, i) => { const col = i % COLS, r = Math.floor(i / COLS); comps.push({ input: c.buf, left: 8 + col * (COLW + 8), top: 8 + r * rowH }); });
const sheet = await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#ffffff' } }).composite(comps).png().toBuffer();
const out = `C:/Users/jovan/Downloads/_${OUT}.png`;
writeFileSync(out, sheet);
console.log(`contact sheet -> ${out} (${cells.length} pages, top-half)`);
process.exit(0);
