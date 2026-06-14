/* RENDER HEALTH CHECK — operator tool.
 *
 * Surfaces DROPPED renders so a silent image-generation failure can never hide:
 *   - DROPPED  = FAILED, or stuck in RENDERING longer than STUCK_MIN minutes
 *   - NOT-STARTED = no render attempt yet (expected for chapters not yet run)
 *   - DONE     = RENDERED or APPROVED
 *
 * Reports per chapter/section, lists every dropped page with its error, and
 * prints a ready-to-run re-render command for the dropped pages.
 *
 * Usage (via railway run, prod env):
 *   node <tsx> scripts/render-health.ts <projectId>
 */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { getProjectRenderSummary } from '../src/db/repositories/whole-page-render.repo.js';

const PROJECT = process.argv[2] ?? process.env.PROJECT_ID;
if (!PROJECT) { console.error('usage: render-health.ts <projectId>'); process.exit(1); }
const STUCK_MIN = 10;

const isDone = (s: string) => s === 'RENDERED' || s === 'APPROVED';
const pages = await listPaginatedPagesForProject(PROJECT);
const summary = await getProjectRenderSummary(PROJECT);

// Best render row per page (a finished render wins over any failed/stale one).
const byPage = new Map<string, { status: string; errorMessage?: string | null; updatedAt?: Date | string }>();
for (const r of summary.rows as Array<{ pageId: string; status: string; errorMessage?: string | null; updatedAt?: Date | string }>) {
  const cur = byPage.get(r.pageId);
  if (!cur || (isDone(r.status) && !isDone(cur.status))) byPage.set(r.pageId, r);
}

// A RENDERING page is NOT done — it has no finished image yet. It's either
// actively in-progress (a batch is running) or stuck (dropped). It must never be
// counted as done, or a "complete" report can hide a render that never finished.
type Bucket = 'done' | 'inprogress' | 'dropped' | 'notstarted';
function bucketOf(id: string): { b: Bucket; status?: string; err?: string | null } {
  const r = byPage.get(id);
  if (!r) return { b: 'notstarted' };
  if (isDone(r.status)) return { b: 'done', status: r.status };
  if (r.status === 'FAILED') return { b: 'dropped', status: r.status, err: r.errorMessage };
  if (r.status === 'RENDERING') {
    const ageMin = (Date.now() - new Date(r.updatedAt ?? Date.now()).getTime()) / 60000;
    return ageMin > STUCK_MIN
      ? { b: 'dropped', status: `RENDERING stuck ${Math.round(ageMin)}m`, err: r.errorMessage }
      : { b: 'inprogress', status: `RENDERING ${Math.round(ageMin)}m` };
  }
  return { b: 'notstarted', status: r.status };
}

const sectionOf = (k: string) => (k.startsWith('CH') ? k.slice(0, 4) : k.startsWith('FM_') ? 'FRONT' : 'BACK');
const counts = new Map<string, { done: number; inprogress: number; dropped: number; notstarted: number }>();
const dropped: Array<{ key: string; status?: string; err?: string | null }> = [];
for (const p of pages) {
  const { b, status, err } = bucketOf(p.id);
  const sec = sectionOf(p.pageKey);
  const c = counts.get(sec) ?? { done: 0, inprogress: 0, dropped: 0, notstarted: 0 };
  c[b]++; counts.set(sec, c);
  if (b === 'dropped') dropped.push({ key: p.pageKey, status, err });
}

console.log(`RENDER HEALTH — project ${PROJECT}`);
for (const [sec, c] of [...counts.entries()].sort()) {
  console.log(`  ${sec.padEnd(7)} done ${String(c.done).padStart(3)}  in-progress ${c.inprogress}  dropped ${c.dropped}  not-started ${c.notstarted}`);
}
console.log(`\n⚠ DROPPED BALLS (FAILED or stuck >${STUCK_MIN}m): ${dropped.length}`);
for (const d of dropped) console.log(`   ${d.key} [${d.status}] ${d.err ?? ''}`);
if (dropped.length) console.log(`\nRe-render them:\n   scripts/render-batch.ts ${PROJECT} ${dropped.map((d) => d.key).join(' ')}`);
else console.log('   none — no dropped renders.');
process.exit(0);
