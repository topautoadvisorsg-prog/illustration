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
const dpi = W / 7.25;
const cw = Math.round(2.3 * dpi), ch = Math.round(1.1 * dpi);
const top = H - ch;
const leftBox = await sharp(raw).extract({ left: 0, top, width: cw, height: ch }).resize({ width: 460 }).png().toBuffer();
const rightBox = await sharp(raw).extract({ left: W - cw, top, width: cw, height: ch }).resize({ width: 460 }).png().toBuffer();
const bh = (await sharp(leftBox).metadata()).height!;
const gap = 18, labelH = 30;
const sheetW = 460 * 2 + gap * 3, sheetH = bh + labelH + gap;
const labels = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}">` +
  `<text x="${gap + 230}" y="22" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#333">bottom-LEFT corner</text>` +
  `<text x="${gap * 2 + 460 + 230}" y="22" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#333">bottom-RIGHT corner</text></svg>`;
const out = await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#ffffff' } })
  .composite([
    { input: leftBox, left: gap, top: labelH },
    { input: rightBox, left: gap * 2 + 460, top: labelH },
    { input: await sharp(Buffer.from(labels)).png().toBuffer(), left: 0, top: 0 },
  ]).png().toBuffer();
writeFileSync('C:/Users/jovan/Downloads/_folioz.png', out);
console.log(`${KEY}: → _folioz.png (both bottom corners)`);
process.exit(0);
