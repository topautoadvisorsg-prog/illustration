/* Real render progress from the DB (not the buffered stdout). Counts how many of
 * a chapter's pages have a render created in the last N minutes. */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';

import { P } from './_project.js';
const CH = process.argv[2] ?? 'CH02';
const MINS = Number(process.argv[3] ?? '40');
const cutoff = new Date(Date.now() - MINS * 60_000);
const db = getDb();
const all = await listPaginatedPagesForProject(P);
const chap = all.filter((p) => new RegExp('^' + CH + '_').test(p.pageKey || '')).sort((a, b) => (a.plannedPageNumber ?? 0) - (b.plannedPageNumber ?? 0));
let done = 0; const pending: string[] = [];
let newest = new Date(0);
for (const pg of chap) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, pg.pageKey))))[0];
  const r = (await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, row.id)).orderBy(desc(wholePageRenders.createdAt)).limit(1))[0];
  const ts = r?.createdAt ? new Date(r.createdAt as any) : new Date(0);
  // Status-aware: a row stuck in RENDERING (e.g. a crashed batch) is NOT done.
  if (ts > cutoff && r?.status === 'RENDERED') { done++; if (ts > newest) newest = ts; } else pending.push(pg.pageKey);
}
console.log(`${CH}: ${done} / ${chap.length} rendered in the last ${MINS} min`);
console.log('newest render at:', newest.toISOString(), `(${Math.round((Date.now() - newest.getTime()) / 1000)}s ago)`);
console.log('pending:', pending.length ? pending.join(' ') : '(none)');
process.exit(0);
