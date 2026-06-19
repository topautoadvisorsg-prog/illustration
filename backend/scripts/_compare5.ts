/* Phase 2 validation: render representative pages with the ornament-free
 * architecture as NON-ACTIVE versions (current versions stay active for the
 * book), then build an OLD (with swags) vs NEW (clean) side-by-side sheet. */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { createAndRunRender } from '../src/pipeline/whole-page-render/render-whole-page.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

const P = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';
const KEYS = process.argv.slice(2);
const db = getDb();
const storage = getProjectStorage();
const all = await listPaginatedPagesForProject(P);
const COL = 360, LBL = 24, GAP = 10;
const rows: { buf: Buffer; h: number }[] = [];

for (const KEY of KEYS) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
  if (!row) { console.log('SKIP', KEY); continue; }
  const folio = all.find((p) => p.pageKey === KEY)?.plannedPageNumber ?? '?';
  const oldRend = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0];
  process.stdout.write(`rendering ${KEY} (folio ${folio}) clean … `);
  const res = await createAndRunRender(row.id, {});
  if (res.status !== 'RENDERED' || !res.row.imagePath) { console.log('FAILED', res.status); continue; }
  console.log('ok v' + res.version, '(non-active)');
  const oldImg = oldRend?.imagePath ? await storage.readProjectFile(oldRend.imagePath) : null;
  const newImg = await storage.readProjectFile(res.row.imagePath);
  const o = oldImg ? await sharp(oldImg).resize({ width: COL }).toBuffer() : await sharp({ create: { width: COL, height: Math.round(COL * 1.43), channels: 3, background: '#ccc' } }).png().toBuffer();
  const n = await sharp(newImg).resize({ width: COL }).toBuffer();
  const oH = (await sharp(o).metadata()).height!, nH = (await sharp(n).metadata()).height!;
  const colH = Math.max(oH, nH);
  const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${COL * 2 + GAP}" height="${LBL}"><rect width="100%" height="100%" fill="#2b1d10"/><text x="6" y="17" font-family="sans-serif" font-size="13" fill="#fff">folio ${folio}  ${KEY}     ◄ OLD (swags)            NEW (clean) ►</text></svg>`;
  const label = await sharp(Buffer.from(labelSvg)).png().toBuffer();
  const rowH = LBL + colH + GAP;
  const rowBuf = await sharp({ create: { width: COL * 2 + GAP, height: rowH, channels: 3, background: '#ffffff' } })
    .composite([{ input: label, top: 0, left: 0 }, { input: o, top: LBL, left: 0 }, { input: n, top: LBL, left: COL + GAP }])
    .png().toBuffer();
  rows.push({ buf: rowBuf, h: rowH });
}

if (rows.length) {
  const totalH = rows.reduce((s, r) => s + r.h + GAP, GAP);
  let y = GAP; const comps: sharp.OverlayOptions[] = [];
  for (const r of rows) { comps.push({ input: r.buf, top: y, left: 0 }); y += r.h + GAP; }
  const sheet = await sharp({ create: { width: COL * 2 + GAP, height: totalH, channels: 3, background: '#888888' } }).composite(comps).png().toBuffer();
  writeFileSync('C:/Users/jovan/Downloads/_compare5.png', sheet);
  console.log('comparison → C:/Users/jovan/Downloads/_compare5.png');
}
process.exit(0);
