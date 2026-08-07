import { and, eq, like } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';

const CH = process.argv[2];
const db = getDb();
const chPages = await db.select().from(pages).where(and(eq(pages.projectId, P), like(pages.pageKey, `${CH}_%`)));
chPages.sort((a, b) => (a.plannedPageNumber ?? 0) - (b.plannedPageNumber ?? 0));
for (const pg of chPages) {
  const renders = await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, pg.id));
  const failed = renders.filter((r) => r.status === 'FAILED');
  if (failed.length === 0) continue;
  for (const f of failed.sort((a, b) => a.version - b.version)) {
    console.log(`${pg.pageKey} v${f.version}: attempts=${f.attempts} error="${f.errorMessage}"`);
  }
}
process.exit(0);
