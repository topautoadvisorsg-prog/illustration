/* Revert a page to a SPECIFIC render version (make it active). Read+write.
 * Usage: _revert.ts <pageKey> <version> */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';

const KEY = process.argv[2]!;
const VER = Number(process.argv[3]!);
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
if (!row) { console.log('page not found', KEY); process.exit(1); }
const target = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.version, VER))).limit(1))[0];
if (!target) { console.log('no version', VER, 'for', KEY); process.exit(1); }
await db.update(wholePageRenders).set({ active: false }).where(eq(wholePageRenders.pageId, row.id));
await db.update(wholePageRenders).set({ active: true }).where(eq(wholePageRenders.id, target.id));
console.log('reverted', KEY, '→ v' + VER, '(active)');
process.exit(0);
