/* Throwaway: show ALL render rows for given page keys — version, status, active,
 * approvedForBook, createdAt — to see which version the book/console actually uses. */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { getProjectRenderSummary } from '../src/db/repositories/whole-page-render.repo.js';

const PROJECT = process.argv[2]!;
const KEYS = process.argv.slice(3);
const pages = await listPaginatedPagesForProject(PROJECT);
const idToKey = new Map(pages.map((p) => [p.id, p.pageKey]));
const keySet = new Set(KEYS);
const summary = await getProjectRenderSummary(PROJECT);
const rows = (summary.rows as Array<Record<string, any>>)
  .filter((r) => keySet.has(idToKey.get(r.pageId) ?? ''))
  .sort((a, b) => (idToKey.get(a.pageId)! + a.version).localeCompare(idToKey.get(b.pageId)! + b.version));
for (const r of rows) {
  console.log(
    `${idToKey.get(r.pageId)}  v${r.version}  ${r.status}  active=${r.active}  approvedForBook=${r.approvedForBook}  created=${new Date(r.createdAt).toISOString().slice(5, 19)}`,
  );
}
process.exit(0);
