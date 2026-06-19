/* Operator tool: revert approved pages to PENDING review WITHOUT changing which
 * image shows. For every render that is approvedForBook=true, set status back to
 * RENDERED and approvedForBook=false, but KEEP active=true — so the console shows
 * the same (correct/newest) image, now with an "Approve for book" button so the
 * publisher can review and approve each page themselves. */
import { getDb } from '../src/db/client.js';
import { wholePageRenders } from '../src/db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';

const PROJECT = process.argv[2]!;
const db = getDb();
const pages = await listPaginatedPagesForProject(PROJECT);
const idToKey = new Map(pages.map((p) => [p.id, p.pageKey]));

const approved = await db
  .select({ id: wholePageRenders.id, pageId: wholePageRenders.pageId, version: wholePageRenders.version })
  .from(wholePageRenders)
  .where(and(eq(wholePageRenders.projectId, PROJECT), eq(wholePageRenders.approvedForBook, true)));

for (const r of approved) {
  await db
    .update(wholePageRenders)
    .set({ status: 'RENDERED', approvedForBook: false, updatedAt: new Date() })
    .where(eq(wholePageRenders.id, r.id));
}
console.log(`Reverted ${approved.length} page(s) to RENDERED / pending review (kept active so the image still shows):`);
console.log(approved.map((r) => idToKey.get(r.pageId) ?? r.pageId).sort().join(' '));
process.exit(0);
