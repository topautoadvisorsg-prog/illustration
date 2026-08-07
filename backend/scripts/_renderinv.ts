/* Render inventory: reconcile the paginate guard's count vs. what a BODY
 * re-paginate would actually orphan. Read-only. Usage: _renderinv.ts */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';

const db = getDb();
const allRenders = await db.select().from(wholePageRenders).where(eq(wholePageRenders.projectId, P));
const pageRows = await db.select().from(pages).where(eq(pages.projectId, P));
const idToPage = new Map(pageRows.map((r) => [r.id, r]));

const byStatus: Record<string, number> = {};
for (const r of allRenders) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
console.log('ALL render rows by status:', byStatus, ' total:', allRenders.length);

const active = allRenders.filter((r) => r.active);
const paidActive = active.filter((r) => r.status === 'RENDERED' || r.status === 'APPROVED');
console.log('\nACTIVE + paid (RENDERED/APPROVED):', paidActive.length);
for (const r of paidActive) {
  const pg = idToPage.get(r.pageId);
  console.log(`  ${pg?.pageKey ?? '???'}  section=${pg?.section}  status=${r.status}`);
}
const bodyPaidActive = paidActive.filter((r) => idToPage.get(r.pageId)?.section === 'BODY');
console.log('\n>>> ACTIVE paid renders ON BODY pages (orphaned by re-paginate):', bodyPaidActive.length);
console.log('>>> FM/BM paid renders (SURVIVE re-paginate):', paidActive.length - bodyPaidActive.length);
process.exit(0);
