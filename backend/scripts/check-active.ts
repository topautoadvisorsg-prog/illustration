import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq, and } from 'drizzle-orm';
const db = getDb();
const PROJECT = process.argv[2]!;
for (const ft of ['ABOUT_SERIES','COPYRIGHT_PAGE']) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, PROJECT), eq(pages.frontMatterType, ft))))[0];
  if (!row) { console.log(ft, '— no page row'); continue; }
  const rs = await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, row.id));
  const active = rs.find((r:any)=>r.active);
  console.log(`${ft} [${row.pageKey}]: ${rs.length} render(s), active v${active?.version} status=${active?.status} forBook=${active?.approvedForBook}`);
  console.log('   active image:', active?.imagePath);
}
process.exit(0);
