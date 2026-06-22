/* PROOF SHEET — required pre-upload QA. Tiles every page's print-prepped PNG (in
 * physical book/spine order) as a thumbnail with the 7x10 TRIM line (red) and the
 * 0.5in SAFE line (orange) drawn over it, labelled with pageKey + planned folio.
 * Lets the operator scan all 275 pages at once for folio placement, stray corner
 * ovals, bleed, and trim problems that per-page preflight does NOT catch.
 * Read-only (downloads print PNGs; writes sheets to Downloads).
 * Usage: _proofsheet.ts [outDir] [limit] */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const OUT = process.argv[2] ?? 'C:/Users/jovan/Downloads';
const LIMIT = process.argv[3] ? Number(process.argv[3]) : Infinity;
const THUMB_W = 300;
const COLS = 5, ROWS = 7, GAP = 14, LABEL_H = 26;
const thumbH = Math.round((THUMB_W * 10.25) / 7.25);
const cellH = thumbH + LABEL_H;
const sheetW = COLS * THUMB_W + (COLS + 1) * GAP;
const sheetH = ROWS * cellH + (ROWS + 1) * GAP;
const perSheet = COLS * ROWS;

const db = getDb();
const storage = getProjectStorage();
// Physical book order: front matter, then body (by planned page), then back
// matter. spineOrder is set only on FM/back matter; body orders by plannedPageNumber.
const rank = (s?: string | null) => (s === 'FRONT_MATTER' ? 0 : s === 'BACK_MATTER' ? 2 : 1);
const orderKey = (p: any) => rank(p.section) * 1_000_000 + (p.spineOrder ?? p.plannedPageNumber ?? 0);
const allPages = (await db.select().from(pages).where(eq(pages.projectId, P)))
  .sort((a, b) => orderKey(a) - orderKey(b))
  .slice(0, LIMIT);

type Cell = { key: string; folio: string; img: Buffer | null };
const cells: Cell[] = [];
let i = 0;
for (const p of allPages) {
  const r = (await db.select().from(wholePageRenders)
    .where(and(eq(wholePageRenders.pageId, p.id), eq(wholePageRenders.active, true)))
    .orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown> | undefined;
  let img: Buffer | null = null;
  const pngPath = (r?.printPngPath as string) ?? (r?.printPdfPath as string | undefined)?.replace('.print.pdf', '.print.png');
  if (pngPath) {
    try {
      const raw = await storage.readProjectFile(pngPath);
      // Resize to thumbnail FIRST, then draw the (small) trim/safe lines on it —
      // avoids rasterizing a 2175px SVG overlay that overflows the base.
      const thumb = await sharp(raw).resize({ width: THUMB_W }).png().toBuffer();
      const tm = await sharp(thumb).metadata();
      const tw = tm.width!, th = tm.height!;
      const tx = (tw * 0.125) / 7.25, ty = (th * 0.125) / 10.25, sx = (tw * 0.625) / 7.25, sy = (th * 0.625) / 10.25;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${th}">` +
        `<rect x="${tx}" y="${ty}" width="${tw - 2 * tx}" height="${th - 2 * ty}" fill="none" stroke="#cc2222" stroke-width="2" stroke-dasharray="6 4"/>` +
        `<rect x="${sx}" y="${sy}" width="${tw - 2 * sx}" height="${th - 2 * sy}" fill="none" stroke="#e8902e" stroke-width="1.5" stroke-dasharray="5 3"/></svg>`;
      const overlay = await sharp(Buffer.from(svg)).resize(tw, th).png().toBuffer();
      img = await sharp(thumb).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
    } catch (e) { img = null; console.log('  ERR', p.pageKey, e instanceof Error ? e.message : String(e)); }
  }
  cells.push({ key: p.pageKey, folio: p.plannedPageNumber != null ? String(p.plannedPageNumber) : '', img });
  if (++i % 40 === 0) console.log(`  loaded ${i}/${allPages.length}`);
}

const sheets = Math.ceil(cells.length / perSheet);
for (let s = 0; s < sheets; s++) {
  const slice = cells.slice(s * perSheet, (s + 1) * perSheet);
  const comps: sharp.OverlayOptions[] = [];
  let labels = '';
  slice.forEach((c, k) => {
    const col = k % COLS, row = Math.floor(k / COLS);
    const x = GAP + col * (THUMB_W + GAP), y = GAP + row * (cellH + GAP);
    if (c.img) comps.push({ input: c.img, left: x, top: y });
    else labels += `<rect x="${x}" y="${y}" width="${THUMB_W}" height="${thumbH}" fill="#eeeeee" stroke="#999999"/><text x="${x + THUMB_W / 2}" y="${y + thumbH / 2}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#aa0000">NO PRINT PNG</text>`;
    labels += `<text x="${x + THUMB_W / 2}" y="${y + thumbH + 18}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#222222">${c.key}${c.folio ? '  &#183;  p' + c.folio : '  &#183;  (no folio)'}</text>`;
  });
  const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}">${labels}</svg>`;
  const sheet = await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#ffffff' } })
    .composite([...comps, { input: await sharp(Buffer.from(labelSvg)).png().toBuffer(), top: 0, left: 0 }]).png().toBuffer();
  const name = `_proof_${String(s + 1).padStart(2, '0')}.png`;
  writeFileSync(`${OUT}/${name}`, sheet);
  console.log(`sheet ${s + 1}/${sheets} → ${name} (${slice.length} pages)`);
}
console.log(`DONE — ${cells.length} pages across ${sheets} sheet(s). red=7x10 trim, orange=0.5in safe.`);
process.exit(0);
