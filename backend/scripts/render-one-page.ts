/* Renders exactly ONE named page, exactly once. No retry loop, no bulk
 * selection — the page key is a required, explicit CLI argument, never
 * inferred or pattern-matched, so this can't accidentally fan out into a
 * multi-page render. This is the ONLY sanctioned way to spend on a render
 * from a script: pass one project id and one page key.
 *
 * Usage: tsx scripts/render-one-page.ts <projectId> <pageKey>
 */
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { createAndRunRender } from '../src/pipeline/whole-page-render/render-whole-page.js';

const [PROJECT, PAGE_KEY] = process.argv.slice(2);
if (!PROJECT || !PAGE_KEY) {
  console.error('Usage: tsx scripts/render-one-page.ts <projectId> <pageKey>');
  process.exit(1);
}

const db = getDb();
const [row] = await db.select().from(pages).where(and(eq(pages.projectId, PROJECT), eq(pages.pageKey, PAGE_KEY))).limit(1);
if (!row) { console.error(`${PAGE_KEY} not found in project ${PROJECT}`); process.exit(1); }

console.log(`Rendering ${PAGE_KEY} (${row.id}) — single attempt, no retry...`);
const result = await createAndRunRender(row.id);
console.log(`${PAGE_KEY}: status=${result.status} renderId=${result.renderId} version=${result.version}`);
if (result.status !== 'RENDERED') {
  console.log('Not RENDERED — investigate before doing anything else. Do NOT re-run this script in a loop.');
}
process.exit(0);
