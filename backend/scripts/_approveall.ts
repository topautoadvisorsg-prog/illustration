/* Approve EVERY page's active render for the book (status=APPROVED,
 * approvedForBook=true) so print-prep + assembly will include it. The operator
 * reviewed all pages. Read+write, no spend. Usage: _approveall.ts */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';

const db = getDb();
const allPages = await db.select().from(pages).where(eq(pages.projectId, P));
let approved = 0;
let noActive = 0;
for (const p of allPages) {
  const active = (
    await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, p.id), eq(wholePageRenders.active, true)))
  )[0];
  if (!active) { noActive++; console.log('  NO ACTIVE RENDER:', p.pageKey); continue; }
  await db.update(wholePageRenders).set({ status: 'APPROVED', approvedForBook: true }).where(eq(wholePageRenders.id, active.id));
  approved++;
}
console.log(`approved ${approved} active renders for book; ${noActive} pages had no active render.`);
process.exit(0);
