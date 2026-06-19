/* Make the latest render for a page the ACTIVE one (so it shows in the console
 * Render & Review), deactivating older versions. Does NOT mark book-approved. */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';

const P = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';
const KEYS = process.argv.slice(2);
const db = getDb();
for (const KEY of KEYS) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
  if (!row) { console.log('page not found', KEY); continue; }
  const latest = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.status, 'RENDERED'))).orderBy(desc(wholePageRenders.version)).limit(1))[0];
  if (!latest) { console.log('no rendered version', KEY); continue; }
  await db.update(wholePageRenders).set({ active: false }).where(eq(wholePageRenders.pageId, row.id));
  await db.update(wholePageRenders).set({ active: true }).where(eq(wholePageRenders.id, latest.id));
  console.log('activated', KEY, 'v' + latest.version);
}
process.exit(0);
