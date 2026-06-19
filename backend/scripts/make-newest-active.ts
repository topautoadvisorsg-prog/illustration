/* Operator tool: make the NEWEST render for each given page the ACTIVE one
 * (active=true) and clear active on its older siblings — WITHOUT approving it.
 * Status stays RENDERED so the publisher reviews + approves the corrected image
 * in the console. Use after a fix re-render whose new version came in inactive. */
import { getDb } from '../src/db/client.js';
import { wholePageRenders } from '../src/db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';

const PROJECT = process.argv[2]!;
const KEYS = process.argv.slice(3);
const db = getDb();
const pages = await listPaginatedPagesForProject(PROJECT);

for (const key of KEYS) {
  const p = pages.find((x) => x.pageKey === key);
  if (!p) { console.log(`${key}: NOT FOUND`); continue; }
  const rows = await db
    .select({ id: wholePageRenders.id, version: wholePageRenders.version, status: wholePageRenders.status })
    .from(wholePageRenders)
    .where(and(eq(wholePageRenders.projectId, PROJECT), eq(wholePageRenders.pageId, p.id)));
  if (!rows.length) { console.log(`${key}: no renders`); continue; }
  const newest = rows.reduce((a, b) => (b.version > a.version ? b : a));
  for (const r of rows) {
    await db.update(wholePageRenders)
      .set({ active: r.id === newest.id, updatedAt: new Date() })
      .where(eq(wholePageRenders.id, r.id));
  }
  console.log(`${key}: v${newest.version} (${newest.status}) is now ACTIVE; ${rows.length - 1} sibling(s) cleared. Pending your approval.`);
}
process.exit(0);
