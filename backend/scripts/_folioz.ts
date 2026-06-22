/* Blow up the EXACT centred-folio box (where print-prep stamps it) so we can see
 * whether the page number is present and legible. Read-only. Usage: _folioz.ts <pageKey> */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const KEY = process.argv[2] ?? 'CH02_P004_c2';
const db = getDb();
const storage = getProjectStorage();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row!.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown>;
const pngPath = (r.printPngPath as string) ?? (r.printPdfPath as string).replace('.print.pdf', '.print.png');
const raw = await storage.readProjectFile(pngPath);
const m = await sharp(raw).metadata();
const W = m.width!, H = m.height!;
// centred folio box (print-prep.ts): w=1.4in, h=0.3in, left=(W-w)/2, top=H-bleed-0.4in-h
const dpi = W / 7.25;
const fw = Math.round(1.4 * dpi), fh = Math.round(0.3 * dpi);
const fleft = Math.round((W - fw) / 2), ftop = Math.round(H - 0.125 * dpi - 0.4 * dpi - fh);
const padX = Math.round(0.4 * dpi), padY = Math.round(0.25 * dpi);
const ex = {
  left: Math.max(0, fleft - padX), top: Math.max(0, ftop - padY),
  width: Math.min(W, fw + 2 * padX), height: Math.min(H - (ftop - padY), fh + 2 * padY),
};
console.log(`${KEY}: folio box expected at left=${fleft} top=${ftop} (${fw}x${fh}); extracting`, JSON.stringify(ex));
const out = await sharp(raw).extract(ex).resize({ width: 900 }).png().toBuffer();
writeFileSync('C:/Users/jovan/Downloads/_folioz.png', out);
console.log('→ _folioz.png');
process.exit(0);
