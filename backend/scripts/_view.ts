/* Save a page's print render (full + a zoom) so we can SEE an artifact. Read-only.
 * Usage: _view.ts <pageKey> [leftFrac topFrac wFrac hFrac] */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';
const KEY = process.argv[2]!;
const lf = Number(process.argv[3] ?? 0.4), tf = Number(process.argv[4] ?? 0.05), wf = Number(process.argv[5] ?? 0.4), hf = Number(process.argv[6] ?? 0.5);
const db = getDb(); const st = getProjectStorage();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0]!;
const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown>;
const path = (r.printPngPath as string) ?? (r.imagePath as string); // fall back to the raw render (fresh, not yet print-prepped)
const raw = await st.readProjectFile(path);
const m = await sharp(raw).metadata(); const W = m.width!, H = m.height!;
writeFileSync('C:/Users/jovan/Downloads/_view.png', await sharp(raw).resize({ width: 820 }).png().toBuffer());
writeFileSync('C:/Users/jovan/Downloads/_view_zoom.png', await sharp(raw).extract({ left: Math.round(W * lf), top: Math.round(H * tf), width: Math.round(W * wf), height: Math.round(H * hf) }).resize({ width: 820 }).png().toBuffer());
console.log(`${KEY}: ${W}x${H} → _view.png + _view_zoom.png`);
process.exit(0);
