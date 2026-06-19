/* Watchdog: polls the DB every 3 min for a chapter's render progress and EXITS
 * when the chapter is fully rendered OR has stalled (no new render for 8 min).
 * Run in the background so completion/stall surfaces a notification reliably —
 * independent of the render batch's buffered stdout. */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';

const P = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';
const CH = process.argv[2] ?? 'CH02';
const STALL_MS = 8 * 60_000;
const cutoff = new Date(Date.now() - 90 * 60_000); // batch renders are recent
const db = getDb();
const all = await listPaginatedPagesForProject(P);
const chap = all.filter((p) => new RegExp('^' + CH + '_').test(p.pageKey || ''));
const ids = await Promise.all(chap.map(async (pg) => (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, pg.pageKey))))[0]?.id));

async function snapshot() {
  let done = 0; let newest = new Date(0);
  for (const id of ids) {
    if (!id) continue;
    const r = (await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, id)).orderBy(desc(wholePageRenders.createdAt)).limit(1))[0];
    const ts = r?.createdAt ? new Date(r.createdAt as any) : new Date(0);
    // Status-aware: only a RENDERED row counts as done; a stuck RENDERING row does not.
    if (ts > cutoff && r?.status === 'RENDERED') { done++; if (ts > newest) newest = ts; }
  }
  return { done, newest };
}

const total = chap.length;
// Stall is measured from the last time `done` INCREASED (progress), not from the
// newest render timestamp — otherwise a chapter with 0 RENDERED pages yet (just
// started, all still RENDERING) would false-stall against the epoch-0 baseline.
let lastProgressAt = Date.now();
let prevDone = -1;
for (;;) {
  const { done } = await snapshot();
  if (done > prevDone) { prevDone = done; lastProgressAt = Date.now(); }
  const idleMs = Date.now() - lastProgressAt;
  console.log(`[watch] ${CH} ${done}/${total}, ${Math.round(idleMs / 1000)}s since last completion`);
  if (done >= total) { console.log(`WATCHDOG: ${CH} DONE ${done}/${total}`); process.exit(0); }
  if (idleMs > STALL_MS) { console.log(`WATCHDOG: ${CH} STALLED at ${done}/${total} (no new completion in ${Math.round(idleMs / 60000)} min)`); process.exit(2); }
  await new Promise((r) => setTimeout(r, 180_000));
}
