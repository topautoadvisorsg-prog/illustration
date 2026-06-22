/* Side-by-side BEFORE (cloud copy = old corner-oval folio) vs AFTER (local cache =
 * fixed centred folio) for one page, with the folio location ringed. Read-only.
 * Usage: _beforeafter.ts <pageKey> */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage, SupabaseStorageService } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const KEY = process.argv[2] ?? 'CH02_P004_c2';
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0]!;
const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown>;
const pngPath = (r.printPngPath as string) ?? (r.printPdfPath as string).replace('.print.pdf', '.print.png');

const after = await getProjectStorage().readProjectFile(pngPath);          // local cache = fixed
const before = await new SupabaseStorageService().readProjectFile(pngPath); // cloud = old

// Zoom the BOTTOM band (where the folio lives) of each so the number is big.
const OUTW = 820;
const strip = async (buf: Buffer) => {
  const m0 = await sharp(buf).metadata();
  const W0 = m0.width!, H0 = m0.height!;
  const top = Math.round(H0 * 0.86);
  return sharp(buf).extract({ left: 0, top, width: W0, height: H0 - top }).resize({ width: OUTW }).png().toBuffer();
};
const bStrip = await strip(before);
const aStrip = await strip(after);
const bh = (await sharp(bStrip).metadata()).height!;
const ah = (await sharp(aStrip).metadata()).height!;
const gap = 16, labelH = 34;
const sheetH = labelH + bh + labelH + ah + gap * 2;
const labels = `<svg xmlns="http://www.w3.org/2000/svg" width="${OUTW}" height="${sheetH}">` +
  `<text x="12" y="24" font-family="sans-serif" font-size="22" fill="#a00000">BEFORE  (cloud copy) — "33" in bottom-RIGHT oval</text>` +
  `<text x="12" y="${labelH + bh + gap + 24}" font-family="sans-serif" font-size="22" fill="#0a7a2a">AFTER  (fixed) — "33" CENTRED, no oval</text></svg>`;
const out = await sharp({ create: { width: OUTW, height: sheetH, channels: 3, background: '#ffffff' } })
  .composite([
    { input: bStrip, left: 0, top: labelH },
    { input: aStrip, left: 0, top: labelH + bh + gap + labelH },
    { input: await sharp(Buffer.from(labels)).png().toBuffer(), left: 0, top: 0 },
  ]).png().toBuffer();
writeFileSync('C:/Users/jovan/Downloads/_beforeafter.png', out);
console.log(`${KEY}: → _beforeafter.png (left=cloud/old, right=fixed)`);
process.exit(0);
