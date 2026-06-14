/* BATCH RENDER — operator tool. Renders a list of page keys for a project with a
 * per-render timeout so one hung image-API call can never freeze the whole batch
 * (a timed-out page is left for a follow-up re-render via render-health).
 *
 * Usage (via railway run, prod env):
 *   node <tsx> scripts/render-batch.ts <projectId> <pageKey> [pageKey ...]
 */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { createAndRunRender } from '../src/pipeline/whole-page-render/render-whole-page.js';

const PROJECT = process.argv[2];
const KEYS = process.argv.slice(3);
if (!PROJECT || KEYS.length === 0) { console.error('usage: render-batch.ts <projectId> <pageKey> [pageKey ...]'); process.exit(1); }

const PER_RENDER_MS = 150000;
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT >${ms}ms on ${label}`)), ms)),
  ]);
}

const pages = await listPaginatedPagesForProject(PROJECT);
for (const key of KEYS) {
  const p = pages.find((x) => x.pageKey === key);
  if (!p) { console.log(`${key} NOT FOUND`); continue; }
  try {
    const r = (await withTimeout(createAndRunRender(p.id, {}), PER_RENDER_MS, key)) as { status?: string; attempts?: number };
    console.log(`${key} -> ${r.status} attempts=${r.attempts}`);
  } catch (e) {
    console.log(`${key} FAILED/TIMEOUT: ${(e as Error).message}`);
  }
}
console.log('BATCH DONE');
process.exit(0);
