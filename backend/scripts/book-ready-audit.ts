/* Book-ready audit: a page is IN THE BOOK only if it has a render with
 * active=true AND approvedForBook=true. Rendering alone does NOT set those. This
 * lists, per section, how many pages are book-ready vs rendered-but-not-selected. */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { getProjectRenderSummary } from '../src/db/repositories/whole-page-render.repo.js';

const PROJECT = process.argv[2]!;
const SHOW = process.argv[3] === '--list';
const pages = await listPaginatedPagesForProject(PROJECT);
const summary = await getProjectRenderSummary(PROJECT);
const isDone = (s: string) => s === 'RENDERED' || s === 'APPROVED';

const bookReady = new Set<string>();
const hasRender = new Set<string>();
for (const r of summary.rows as Array<Record<string, any>>) {
  if (isDone(r.status)) hasRender.add(r.pageId);
  if (r.active && r.approvedForBook) bookReady.add(r.pageId);
}

const sectionOf = (k: string) => (k.startsWith('CH') ? k.slice(0, 4) : k.startsWith('FM') ? 'FRONT' : 'BACK');
const counts = new Map<string, { ready: number; renderedNotReady: number; noRender: number }>();
const notReady: string[] = [];
for (const p of pages) {
  const sec = sectionOf(p.pageKey);
  const c = counts.get(sec) ?? { ready: 0, renderedNotReady: 0, noRender: 0 };
  if (bookReady.has(p.id)) c.ready++;
  else if (hasRender.has(p.id)) { c.renderedNotReady++; notReady.push(p.pageKey); }
  else c.noRender++;
  counts.set(sec, c);
}

console.log(`BOOK-READY AUDIT — project ${PROJECT}`);
let totReady = 0, totNotReady = 0, totNo = 0;
for (const [sec, c] of [...counts.entries()].sort()) {
  console.log(`  ${sec.padEnd(7)} book-ready ${String(c.ready).padStart(3)}  rendered-not-selected ${String(c.renderedNotReady).padStart(3)}  no-render ${c.noRender}`);
  totReady += c.ready; totNotReady += c.renderedNotReady; totNo += c.noRender;
}
console.log(`  TOTAL   book-ready ${totReady}  rendered-not-selected ${totNotReady}  no-render ${totNo}`);
if (SHOW && notReady.length) console.log(`\nRendered but NOT selected for book:\n${notReady.sort().join(' ')}`);
process.exit(0);
