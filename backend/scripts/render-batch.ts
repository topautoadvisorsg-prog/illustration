/* BATCH RENDER — operator tool. Renders a list of page keys for a project with a
 * per-render timeout so one hung image-API call can never freeze the whole batch.
 *
 * On timeout the script does NOT immediately declare failure: the in-flight render
 * usually keeps running server-side and persists RENDERED a little past the cap. So
 * after a timeout we POLL the DB for a grace window — if the page reaches
 * RENDERED/APPROVED it's reported as recovered (no wasteful re-render); only if it
 * stays unfinished past the grace window is it reported TIMEOUT for a follow-up.
 *
 * Usage (via railway run, prod env):
 *   node <tsx> scripts/render-batch.ts <projectId> <pageKey> [pageKey ...]
 */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { getProjectRenderSummary } from '../src/db/repositories/whole-page-render.repo.js';
import { createAndRunRender } from '../src/pipeline/whole-page-render/render-whole-page.js';

const PROJECT = process.argv[2];
const KEYS = process.argv.slice(3);
if (!PROJECT || KEYS.length === 0) { console.error('usage: render-batch.ts <projectId> <pageKey> [pageKey ...]'); process.exit(1); }

const PER_RENDER_MS = 240000;
const GRACE_MS = 180000; // post-timeout window to let a slow render finish
const POLL_MS = 10000;
const isDone = (s?: string) => s === 'RENDERED' || s === 'APPROVED';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT >${ms}ms on ${label}`)), ms)),
  ]);
}

/** Best render status for a page right now (a finished render wins over a stale one). */
async function pageStatus(pageId: string): Promise<string | undefined> {
  const summary = await getProjectRenderSummary(PROJECT!);
  let best: string | undefined;
  for (const r of summary.rows as Array<{ pageId: string; status: string }>) {
    if (r.pageId !== pageId) continue;
    if (!best || (isDone(r.status) && !isDone(best))) best = r.status;
  }
  return best;
}

const pages = await listPaginatedPagesForProject(PROJECT);
for (const key of KEYS) {
  const p = pages.find((x) => x.pageKey === key);
  if (!p) { console.log(`${key} NOT FOUND`); continue; }
  try {
    const r = (await withTimeout(createAndRunRender(p.id, {}), PER_RENDER_MS, key)) as { status?: string; attempts?: number };
    console.log(`${key} -> ${r.status} attempts=${r.attempts}`);
  } catch (e) {
    // Timed out waiting on the call — the render may still finish server-side.
    // Poll the DB before declaring failure to avoid a wasteful re-render.
    const deadline = Date.now() + GRACE_MS;
    let recovered = false;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      if (isDone(await pageStatus(p.id))) { recovered = true; break; }
    }
    if (recovered) console.log(`${key} -> RENDERED (recovered after timeout)`);
    else console.log(`${key} FAILED/TIMEOUT: ${(e as Error).message}`);
  }
}
console.log('BATCH DONE');
process.exit(0);
