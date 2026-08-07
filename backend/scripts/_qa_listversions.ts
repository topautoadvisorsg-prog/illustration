import { and, eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';

const pageKey = process.argv[2];
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, pageKey))))[0];
const rows = await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, row.id));
for (const r of rows.sort((a, b) => a.version - b.version)) {
  console.log(`v${r.version} status=${r.status} attempts=${r.attempts} active=${r.active} approvedForBook=${r.approvedForBook} createdAt=${r.createdAt} errorMessage=${r.errorMessage ?? ''}`);
  console.log(`   imagePath=${r.imagePath}`);
}
process.exit(0);
