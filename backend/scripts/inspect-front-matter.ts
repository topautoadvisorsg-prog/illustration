/* Read-only: list FRONT_MATTER pages (spine order) with render + text status,
 * and dump any illustration-only opener image to disk for visual review.
 *   node ../node_modules/tsx/dist/cli.mjs scripts/inspect-front-matter.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const db = getDb();
const OUT = 'C:/Users/jovan/Downloads';

const fm = await db
  .select({
    id: pages.id,
    pageKey: pages.pageKey,
    spineOrder: pages.spineOrder,
    plannedPageNumber: pages.plannedPageNumber,
    section: pages.section,
    frontMatterType: pages.frontMatterType,
    pageRole: pages.pageRole,
    text: pages.readingFieldText,
  })
  .from(pages)
  .where(and(eq(pages.projectId, P), eq(pages.section, 'FRONT_MATTER')))
  .orderBy(asc(pages.spineOrder), asc(pages.plannedPageNumber));

console.log(`\n=== FRONT_MATTER pages (${fm.length}) ===`);
const storage = getProjectStorage();
for (const p of fm) {
  const r = await db
    .select({ imagePath: wholePageRenders.imagePath, active: wholePageRenders.active })
    .from(wholePageRenders)
    .where(and(eq(wholePageRenders.pageId, p.id), eq(wholePageRenders.active, true)))
    .limit(1);
  const img = r[0]?.imagePath ?? '(no active render)';
  const txtLen = (p.text ?? '').trim().length;
  console.log(
    `spine ${String(p.spineOrder ?? '–').padStart(3)} | p${String(p.plannedPageNumber ?? '–').padStart(3)} | ${String(p.frontMatterType ?? '–').padEnd(18)} | role:${p.pageRole} | textChars:${String(txtLen).padStart(5)} | ${p.pageKey}`,
  );
  console.log(`           img: ${img}`);
  // Dump the first few front-matter render images so we can eyeball the opener.
  if (r[0]?.imagePath) {
    try {
      const bytes = await storage.readProjectFile(r[0].imagePath);
      const fname = `FM_${String(p.spineOrder ?? 0).padStart(3, '0')}_${p.frontMatterType ?? 'page'}.png`.replace(/[^A-Za-z0-9_.]/g, '_');
      writeFileSync(join(OUT, fname), bytes);
      console.log(`           -> saved ${fname} (${(bytes.length / 1024).toFixed(0)} KB)`);
    } catch (e) {
      console.log(`           -> could not read image: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
process.exit(0);
