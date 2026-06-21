/* EXPORT the book's render images + a manifest to a LOCAL folder — step 1 of
 * "archive locally, then purge Supabase" (the artwork is permanent, the project is
 * temporary). No paid generation. Reads through the local cache, so a re-export is
 * ~free; the first export downloads each image once (well within Pro's egress).
 *
 * Output:  <outDir>/THE_WILDLANDS_NEW_ENGLAND/
 *            images/<folio>_<pageKey>_v<ver>.png   (one per page, in book order)
 *            manifest.json                         (full inventory + sha256 + bytes)
 *
 * Usage: _export.ts [outDir]   (default: C:/Users/jovan/Downloads/wildlands-archive)
 * The matching purge step (_purge.ts) refuses to delete anything from Supabase
 * unless THIS export's manifest is present and every file verifies by sha256.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

import { P } from './_project.js';
const BOOK = 'THE_WILDLANDS_NEW_ENGLAND';
const OUT = process.argv[2] ?? 'C:/Users/jovan/Downloads/wildlands-archive';
const db = getDb();
const storage = getProjectStorage();

const dir = path.join(OUT, BOOK);
const imgDir = path.join(dir, 'images');
await mkdir(imgDir, { recursive: true });

const all = (await db.select().from(pages).where(eq(pages.projectId, P))).sort(
  (a, b) => (a.plannedPageNumber ?? 0) - (b.plannedPageNumber ?? 0),
);

type Entry = {
  folio: string;
  pageKey: string;
  version?: number;
  file?: string;
  bytes?: number;
  sha256?: string;
  imagePath?: string;
  status: 'OK' | 'MISSING' | 'READ_FAILED';
  error?: string;
};
const files: Entry[] = [];
let saved = 0;
let missing = 0;
let totalBytes = 0;

for (const pg of all) {
  const folio = String(pg.plannedPageNumber ?? 0).padStart(3, '0');
  const r = (
    await db
      .select()
      .from(wholePageRenders)
      .where(and(eq(wholePageRenders.pageId, pg.id), eq(wholePageRenders.active, true)))
      .orderBy(desc(wholePageRenders.version))
      .limit(1)
  )[0];
  if (!r?.imagePath) {
    missing++;
    files.push({ folio, pageKey: pg.pageKey, status: 'MISSING' });
    console.log('MISSING ', pg.pageKey);
    continue;
  }
  let img: Buffer;
  try {
    img = await storage.readProjectFile(r.imagePath);
  } catch (e) {
    missing++;
    files.push({ folio, pageKey: pg.pageKey, status: 'READ_FAILED', error: (e as Error).message, imagePath: r.imagePath });
    console.log('READFAIL', pg.pageKey, (e as Error).message.slice(0, 80));
    continue;
  }
  const fname = `${folio}_${pg.pageKey}_v${r.version}.png`;
  await writeFile(path.join(imgDir, fname), img);
  files.push({
    folio,
    pageKey: pg.pageKey,
    version: r.version,
    file: `images/${fname}`,
    bytes: img.byteLength,
    sha256: createHash('sha256').update(img).digest('hex'),
    imagePath: r.imagePath,
    status: 'OK',
  });
  saved++;
  totalBytes += img.byteLength;
  console.log('saved   ', fname, `${(img.byteLength / 1024).toFixed(0)}KB`);
}

await writeFile(
  path.join(dir, 'manifest.json'),
  JSON.stringify(
    { book: BOOK, projectId: P, exportedAt: new Date().toISOString(), totalPages: all.length, saved, missing, totalBytes, files },
    null,
    2,
  ),
);

console.log(`\nEXPORT → ${dir}`);
console.log(`${saved}/${all.length} images saved · ${missing} missing/failed · ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
console.log('manifest.json written.');
if (missing > 0) console.log('NOTE: missing/failed pages above are NOT safe to purge — re-render or fix before archiving.');
console.log('\nNext: drop the final interior + cover PDFs into this folder, then _purge.ts to free Supabase (it verifies this manifest first).');
process.exit(0);
