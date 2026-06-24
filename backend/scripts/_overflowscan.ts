/* NO-RENDER overflow scan: tiles the BOTTOM strip of the active render for every page
 * currently on LAYOUT_D_PURE_TEXT, so we can spot text running to the bottom guideline
 * across the whole set at once. Reads existing active images only.
 * Usage: _overflowscan.ts [outName=overflow] [bottomFrac=0.16] */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const OUT = process.argv[2] ?? 'overflow';
const FRAC = Number(process.argv[3] ?? 0.16);
const db = getDb();
const storage = getProjectStorage();
const ordered = await listPaginatedPagesForProject(P);
const folioOf = new Map(ordered.map((p) => [p.pageKey, p.plannedPageNumber ?? '?']));
const rows = await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.layoutTemplate, 'LAYOUT_D_PURE_TEXT')));
rows.sort((a, b) => ((folioOf.get(a.pageKey) as number) ?? 0) - ((folioOf.get(b.pageKey) as number) ?? 0));
console.log(`LAYOUT_D_PURE_TEXT pages: ${rows.length}`);

const COLW = 300, COLS = 4, LBL = 20;
const cells: Buffer[] = [];
for (const pg of rows) {
  const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, pg.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown> | undefined;
  if (!r?.imagePath) continue;
  // Only pages RE-RENDERED after the assembler drift (these are the overflow risk).
  if (new Date(r.createdAt as string).getTime() < new Date('2026-06-22T00:00:00Z').getTime()) continue;
  const img = await storage.readProjectFile(r.imagePath as string);
  const m = await sharp(img).metadata(); const w = m.width!, h = m.height!;
  const sH = Math.round(h * FRAC);
  const strip = await sharp(img).extract({ left: 0, top: h - sH, width: w, height: sH }).resize({ width: COLW }).toBuffer();
  const tH = (await sharp(strip).metadata()).height!;
  const lab = `<svg xmlns="http://www.w3.org/2000/svg" width="${COLW}" height="${LBL}"><rect width="100%" height="100%" fill="#1f150a"/><text x="5" y="15" font-family="sans-serif" font-size="12" fill="#fff">f${folioOf.get(pg.pageKey)}  ${pg.pageKey}  v${r.version}</text></svg>`;
  const labPng = await sharp(Buffer.from(lab)).png().toBuffer();
  cells.push(await sharp({ create: { width: COLW, height: LBL + tH, channels: 3, background: '#bbbbbb' } }).composite([{ input: labPng, top: 0, left: 0 }, { input: strip, top: LBL, left: 0 }]).png().toBuffer());
}
const cH = (await sharp(cells[0]!).metadata()).height!;
const rowH = cH + 6, nRows = Math.ceil(cells.length / COLS);
const comps: sharp.OverlayOptions[] = [];
cells.forEach((c, i) => comps.push({ input: c, left: 6 + (i % COLS) * (COLW + 6), top: 6 + Math.floor(i / COLS) * rowH }));
const sheet = await sharp({ create: { width: COLS * (COLW + 6) + 6, height: nRows * rowH + 6, channels: 3, background: '#ffffff' } }).composite(comps).png().toBuffer();
const out = `C:/Users/jovan/Downloads/_${OUT}.png`;
writeFileSync(out, sheet);
console.log(`bottom-strip sheet -> ${out} (${cells.length} pages)`);
process.exit(0);
