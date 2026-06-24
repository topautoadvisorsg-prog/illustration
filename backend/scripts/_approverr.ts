/* Approve the ACTIVE renders that were RE-RENDERED this session (createdAt >= cutoff)
 * for book + print-prep: set status=APPROVED, approvedForBook=true. Prints the keys.
 * Usage: _approverr.ts [cutoffISO=2026-06-22] */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { P } from './_project.js';
const CUTOFF = new Date(process.argv[2] ?? '2026-06-22T00:00:00Z').getTime();
const db = getDb();
const ordered = await listPaginatedPagesForProject(P);
const folioOf = new Map(ordered.map((p) => [p.pageKey, p.plannedPageNumber ?? '?']));
const all = await db.select().from(pages).where(eq(pages.projectId, P));
const keys: string[] = [];
let already = 0;
for (const pg of all) {
  const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, pg.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown> | undefined;
  if (!r) continue;
  if (new Date(r.createdAt as string).getTime() < CUTOFF) continue;
  if (r.approvedForBook === true) already++;
  await db.update(wholePageRenders).set({ status: 'APPROVED', approvedForBook: true }).where(eq(wholePageRenders.id, r.id as string));
  keys.push(pg.pageKey);
}
keys.sort((a, b) => ((folioOf.get(a) as number) ?? 0) - ((folioOf.get(b) as number) ?? 0));
console.log(`re-rendered + approved: ${keys.length} pages (${already} were already approved)`);
console.log(keys.join(','));
process.exit(0);
