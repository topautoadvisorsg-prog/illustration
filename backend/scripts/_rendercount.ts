/* Read-only: quantify the render history so we can decide what to keep vs prune.
 * Counts renders by selection state and tallies how many stored FILE references
 * the keep-set (active / approved) holds vs the prunable inactive versions.
 * NO writes, NO deletes. Usage: _rendercount.ts */
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { wholePageRenders, pages } from '../src/db/schema/index.js';
import { P } from './_project.js';

const db = getDb();
const rows = await db.select().from(wholePageRenders).where(eq(wholePageRenders.projectId, P));
const pageRows = await db.select().from(pages).where(eq(pages.projectId, P));

const FILE_COLS = ['imagePath', 'specPath', 'promptPath', 'blueprintPath', 'printPngPath', 'printPdfPath'] as const;
function fileCount(r: Record<string, unknown>): number {
  return FILE_COLS.reduce((n, c) => n + (r[c] ? 1 : 0), 0);
}

const total = rows.length;
const active = rows.filter((r) => r.active);
const approved = rows.filter((r) => r.approvedForBook);
const activeOrApproved = rows.filter((r) => r.active || r.approvedForBook);
const prunable = rows.filter((r) => !r.active && !r.approvedForBook);

const sum = (rs: typeof rows) => rs.reduce((n, r) => n + fileCount(r as Record<string, unknown>), 0);

console.log('=== RENDER HISTORY (project', P.slice(0, 8) + '…) ===');
console.log('pages in project           :', pageRows.length);
console.log('render rows (all versions) :', total);
console.log('  active=true              :', active.length, `(files: ${sum(active)})`);
console.log('  approved_for_book=true   :', approved.length, `(files: ${sum(approved)})`);
console.log('  KEEP (active OR approved):', activeOrApproved.length, `(files: ${sum(activeOrApproved)})`);
console.log('  PRUNABLE (neither)       :', prunable.length, `(files: ${sum(prunable)})`);
console.log('total file refs in DB      :', sum(rows));

// Pages with no active render (would lose their image if we pruned blindly — shows
// the keep-set really does cover every page).
const activePageIds = new Set(active.map((r) => r.pageId));
const pagesWithoutActive = pageRows.filter((p) => !activePageIds.has(p.id));
console.log('pages WITHOUT an active render:', pagesWithoutActive.length,
  pagesWithoutActive.length ? '(' + pagesWithoutActive.slice(0, 10).map((p) => p.pageKey).join(', ') + (pagesWithoutActive.length > 10 ? '…' : '') + ')' : '');

// Versions-per-page distribution (top offenders).
const byPage = new Map<string, number>();
for (const r of rows) byPage.set(r.pageId, (byPage.get(r.pageId) ?? 0) + 1);
const keyOf = new Map(pageRows.map((p) => [p.id, p.pageKey]));
const top = [...byPage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('\nmost-versioned pages:');
for (const [pid, n] of top) console.log('  ', (keyOf.get(pid) ?? pid).padEnd(20), n, 'versions');
process.exit(0);
