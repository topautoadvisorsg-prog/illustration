/* Close-up of a print-prepped page's BOTTOM, with the 7x10 TRIM (red) and 0.5in
 * SAFE (orange) lines drawn, so the folio's position is unmistakable. Read-only.
 * Usage: _folioview.ts <pageKey> */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const KEY = process.argv[2] ?? 'CH02_P005';
const db = getDb();
const storage = getProjectStorage();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
if (!row) { console.log('no page', KEY); process.exit(1); }
const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown>;
const pngPath = (r?.printPngPath as string) ?? (r?.printPdfPath as string | undefined)?.replace('.print.pdf', '.print.png');
if (!pngPath) { console.log('no print PNG path'); process.exit(1); }
const raw = await storage.readProjectFile(pngPath);
const m = await sharp(raw).metadata();
const W = m.width!, H = m.height!;

// Zoom tight into the CENTER-BOTTOM (where the centred folio lives), then draw the
// bottom TRIM + SAFE lines so the page number's position is unmistakable.
const cropL = Math.round(W * 0.22), cropW = Math.round(W * 0.56);
const cropTop = Math.round(H * 0.85), cropH = H - cropTop;
const OUTW = 1000;
const scale = OUTW / cropW;
const cm = await sharp(raw).extract({ left: cropL, top: cropTop, width: cropW, height: cropH }).resize({ width: OUTW }).png().toBuffer();
const cmeta = await sharp(cm).metadata();
const ow = cmeta.width!, oh = cmeta.height!;
const yTrimB = (H - (H * 0.125 / 10.25) - cropTop) * scale;
const ySafeB = (H - (H * 0.625 / 10.25) - cropTop) * scale;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ow}" height="${oh}">` +
  `<line x1="0" y1="${yTrimB}" x2="${ow}" y2="${yTrimB}" stroke="#cc2222" stroke-width="3" stroke-dasharray="11 7"/>` +
  `<text x="6" y="${yTrimB - 6}" font-family="sans-serif" font-size="18" fill="#cc2222">TRIM (cut)</text>` +
  `<line x1="0" y1="${ySafeB}" x2="${ow}" y2="${ySafeB}" stroke="#e08a2e" stroke-width="2" stroke-dasharray="9 6"/>` +
  `<text x="6" y="${ySafeB - 6}" font-family="sans-serif" font-size="16" fill="#c9781f">SAFE</text></svg>`;
const overlay = await sharp(Buffer.from(svg)).resize(ow, oh).png().toBuffer();
const out = await sharp(cm).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
writeFileSync('C:/Users/jovan/Downloads/_folioview_bottom.png', out);
console.log(`${KEY}: folio=${row.plannedPageNumber ?? '(none)'} → _folioview_bottom.png (red=7x10 trim, orange=0.5in safe)`);
process.exit(0);
