/* Operator tool: select the NEWEST successful render of each given page key as the
 * book version (active=true + approvedForBook=true; clears the flags on all older
 * versions). Use after re-rendering an already-approved page — the new version is
 * created inactive, so the book keeps using the old one until it is selected. */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { approveRender, getProjectRenderSummary, selectForBook } from '../src/db/repositories/whole-page-render.repo.js';

const PROJECT = process.argv[2]!;
const KEYS = process.argv.slice(3);
const DECIDED_BY = 'claudio (operator)';
if (!PROJECT || KEYS.length === 0) { console.error('usage: select-newest.ts <projectId> <pageKey...>'); process.exit(1); }

const pages = await listPaginatedPagesForProject(PROJECT);
const keyToId = new Map(pages.map((p) => [p.pageKey, p.id]));
const summary = await getProjectRenderSummary(PROJECT);
const isDone = (s: string) => s === 'RENDERED' || s === 'APPROVED';

for (const key of KEYS) {
  const pageId = keyToId.get(key);
  if (!pageId) { console.log(`${key} NOT FOUND`); continue; }
  // Rows come back newest-first (createdAt desc); pick the first done one.
  const candidate = (summary.rows as Array<Record<string, any>>).find(
    (r) => r.pageId === pageId && isDone(r.status),
  );
  if (!candidate) { console.log(`${key} no successful render`); continue; }
  // selectForBook requires the version be APPROVED first (render -> approve -> select).
  if (candidate.status !== 'APPROVED') await approveRender(candidate.id, DECIDED_BY);
  const row = await selectForBook(candidate.id, DECIDED_BY);
  console.log(`${key} -> selected v${row.version} for book (active=${row.active}, approved=${row.approvedForBook})`);
}
process.exit(0);
