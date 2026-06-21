/* Read-only: print the latest render's status + errorMessage for given page keys. */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';

import { P } from './_project.js';
const db = getDb();
for (const KEY of process.argv.slice(2)) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
  if (!row) { console.log(KEY, '— not found'); continue; }
  const rs = await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, row.id)).orderBy(desc(wholePageRenders.createdAt)).limit(3);
  console.log(`\n=== ${KEY} (last ${rs.length}) ===`);
  for (const r of rs) {
    console.log(`v${r.version} ${r.status} active=${r.active} ${new Date(r.createdAt as any).toISOString()}`);
    if (r.errorMessage) console.log('   err:', String(r.errorMessage).slice(0, 400));
  }
}
process.exit(0);
