/* Read-only: list whole_page_renders for a given chapter's pages (best version
 * per page — prefer approvedForBook, else latest RENDERED), pull each render's
 * image to a local scratch path, and dump ground-truth reading_field_text for
 * side-by-side QA comparison.
 *   node ../node_modules/tsx/dist/cli.mjs scripts/_review_chapter.ts CH02
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { and, eq, like } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const CH = process.argv[2];
if (!CH) { console.error('usage: _review_chapter.ts <CHnn>'); process.exit(2); }

const SCRATCH = 'C:/Users/jovan/AppData/Local/Temp/claude/C--Users-jovan-Downloads-claudio-set-up/dc4723cc-c2d2-47e6-acdb-80e27d335beb/scratchpad';
const OUT = `${SCRATCH}/${CH.toLowerCase()}`;
mkdirSync(OUT, { recursive: true });

const db = getDb();
const storage = getProjectStorage();

const chPages = await db.select().from(pages).where(and(eq(pages.projectId, P), like(pages.pageKey, `${CH}_%`)));
chPages.sort((a, b) => (a.plannedPageNumber ?? 0) - (b.plannedPageNumber ?? 0));

const textOut: string[] = [];
for (const pg of chPages) {
  textOut.push(`\n===== ${pg.pageKey} (planned #${pg.plannedPageNumber}) =====\n${pg.readingFieldText ?? '(no text)'}`);
  const renders = await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, pg.id));
  if (renders.length === 0) { console.log(`${pg.pageKey}: no renders`); continue; }
  renders.sort((a, b) => (a.approvedForBook === b.approvedForBook ? b.version - a.version : a.approvedForBook ? -1 : 1));
  const best = renders[0];
  if (!best.imagePath) { console.log(`${pg.pageKey}: render v${best.version} has no imagePath (status=${best.status})`); continue; }
  const buf = await storage.readProjectFile(best.imagePath);
  const localPath = `${OUT}/${pg.pageKey}.png`;
  writeFileSync(localPath, buf);
  console.log(`${pg.pageKey}: v${best.version} status=${best.status} approvedForBook=${best.approvedForBook} -> ${localPath}`);
}
writeFileSync(`${OUT}/_ground_truth.txt`, textOut.join('\n'));
console.log(`\nground truth text -> ${OUT}/_ground_truth.txt`);
process.exit(0);
