/* Throwaway: list NOT-STARTED page keys for a section prefix. */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { getProjectRenderSummary } from '../src/db/repositories/whole-page-render.repo.js';

const PROJECT = process.argv[2]!;
const PREFIX = process.argv[3] ?? 'CH03';
const isDone = (s: string) => s === 'RENDERED' || s === 'APPROVED';
const pages = await listPaginatedPagesForProject(PROJECT);
const summary = await getProjectRenderSummary(PROJECT);
const byPage = new Map<string, string>();
for (const r of summary.rows as Array<{ pageId: string; status: string }>) {
  const cur = byPage.get(r.pageId);
  if (!cur || (isDone(r.status) && !isDone(cur))) byPage.set(r.pageId, r.status);
}
const out: string[] = [];
for (const p of pages) {
  if (!p.pageKey.startsWith(PREFIX)) continue;
  const s = byPage.get(p.id);
  if (!s) out.push(p.pageKey + '  [no-render]');
  else if (!isDone(s)) out.push(p.pageKey + '  [' + s + ']');
}
console.log(out.join('\n'));
console.log('\nKEYS: ' + out.map((l) => l.split('  ')[0]).join(' '));
process.exit(0);
