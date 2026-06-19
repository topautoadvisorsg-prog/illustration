import { getMaxBodyPlannedPageNumber } from '../src/db/repositories/pagination.repo.js';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { eq, and } from 'drizzle-orm';
const P = process.argv[2]!;
const max = await getMaxBodyPlannedPageNumber(P);
console.log('bodyMax (last numbered body page):', max);
const db = getDb();
const bm = await db.select().from(pages).where(and(eq(pages.projectId,P), eq(pages.section,'BACK_MATTER')));
console.log('expected back-matter folios (bodyMax + spineOrder):');
for (const r of (bm as any[]).sort((a,b)=>a.spineOrder-b.spineOrder)) {
  const ft=(r.frontMatterType??'').toUpperCase();
  const folio = ft==='ABOUT_SERIES' ? '(none)' : String(max + r.spineOrder);
  console.log(`  ${r.pageKey} spineOrder=${r.spineOrder} → folio ${folio}`);
}
process.exit(0);
