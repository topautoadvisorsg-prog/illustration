/* Operator tool: mark any stuck RENDERING render rows for the given page keys as
 * FAILED, so a hung console render (no timeout) stops showing as "rendering". */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { getProjectRenderSummary, markFailed } from '../src/db/repositories/whole-page-render.repo.js';

const PROJECT = process.argv[2]!;
const KEYS = process.argv.slice(3);
const pages = await listPaginatedPagesForProject(PROJECT);
const idToKey = new Map(pages.map((p) => [p.id, p.pageKey]));
const keySet = new Set(KEYS);
const summary = await getProjectRenderSummary(PROJECT);
let n = 0;
for (const r of summary.rows as Array<Record<string, any>>) {
  if (r.status !== 'RENDERING') continue;
  if (!keySet.has(idToKey.get(r.pageId) ?? '')) continue;
  await markFailed(r.id, 'abandoned stuck render (manual cleanup)');
  console.log(`${idToKey.get(r.pageId)} v${r.version} -> FAILED (was stuck RENDERING)`);
  n++;
}
console.log(n ? `Cleaned ${n} stuck render(s).` : 'No stuck RENDERING rows found.');
process.exit(0);
