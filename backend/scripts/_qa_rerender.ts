/* Re-render ONE page by pageKey, using the real pipeline entry point
 * (same function the API route calls) so it goes through prepareRender +
 * the actual model call, gets a new version row, etc. Single attempt,
 * no retry loop — operator reviews the result, per render-once discipline.
 *   node ../node_modules/tsx/dist/cli.mjs scripts/_qa_rerender.ts <pageKey>
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { createAndRunRender } from '../src/pipeline/whole-page-render/render-whole-page.js';
import { P } from './_project.js';

const pageKey = process.argv[2];
if (!pageKey) { console.error('usage: _qa_rerender.ts <pageKey>'); process.exit(2); }

const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, pageKey))))[0];
if (!row) { console.error(`page not found: ${pageKey}`); process.exit(2); }

console.log(`Rendering ${pageKey} (id=${row.id})...`);
const t0 = Date.now();
const result = await createAndRunRender(row.id, {});
console.log(`v${result.version} status=${result.status} attempts=${result.attempts} (${((Date.now() - t0) / 1000) | 0}s)`);
console.log('imagePath:', result.row.imagePath);
process.exit(0);
