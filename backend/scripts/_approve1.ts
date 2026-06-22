/* Approve ONE page's active render for book (status=APPROVED, approvedForBook=true).
 * Read+write, no spend. Usage: _approve1.ts <pageKey> */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';
const KEY = process.argv[2]!;
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0]!;
const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0]!;
await db.update(wholePageRenders).set({ status: 'APPROVED', approvedForBook: true }).where(eq(wholePageRenders.id, r.id));
console.log('approved', KEY, 'v' + r.version);
process.exit(0);
