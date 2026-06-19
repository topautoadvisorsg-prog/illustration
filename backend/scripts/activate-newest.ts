import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';
const db = getDb();
const PROJECT = process.argv[2]!; const FT = process.argv[3]!;
const row = (await db.select().from(pages).where(and(eq(pages.projectId, PROJECT), eq(pages.frontMatterType, FT))))[0];
if (!row) { console.error('page row not found'); process.exit(1); }
const rs = await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, row.id)).orderBy(desc(wholePageRenders.version));
const newest = rs[0]!;
await db.update(wholePageRenders).set({ active: false }).where(eq(wholePageRenders.pageId, row.id));
await db.update(wholePageRenders).set({ active: true }).where(eq(wholePageRenders.id, newest.id));
console.log(`activated v${newest.version} (${newest.status}) for ${row.pageKey}; approvedForBook stays ${newest.approvedForBook}`);
process.exit(0);
