/* List a chapter's pages with current layout + active render version + whether it
 * was re-rendered on the new standards (FRESH = today). Lets me flag pages the
 * operator may have missed. Read-only. Usage: _chlist.ts <CHxx> */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';

const CH = (process.argv[2] ?? 'CH03').toUpperCase();
const FRESH = new Date('2026-06-21T00:00:00Z'); // re-rendered on the new standards today
const db = getDb();
const all = (await db.select().from(pages).where(eq(pages.projectId, P)))
  .filter((p) => p.pageKey.startsWith(CH + '_'))
  .sort((a, b) => (a.plannedPageNumber ?? 0) - (b.plannedPageNumber ?? 0));
for (const p of all) {
  const r = (
    await db.select().from(wholePageRenders)
      .where(and(eq(wholePageRenders.pageId, p.id), eq(wholePageRenders.active, true)))
      .orderBy(desc(wholePageRenders.version)).limit(1)
  )[0];
  const fresh = r?.createdAt ? new Date(r.createdAt as unknown as string) >= FRESH : false;
  console.log(p.pageKey.padEnd(18), (p.layoutTemplate ?? '(default)').padEnd(26), ('v' + (r?.version ?? '-')).padEnd(5), fresh ? 'FRESH (new std)' : 'old');
}
process.exit(0);
