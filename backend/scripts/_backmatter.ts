/* List back-matter pages + expected continuing folio. Read-only. */
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { P } from './_project.js';
const db = getDb();
const all = await db.select().from(pages).where(eq(pages.projectId, P));
const body = all.filter((p) => (p as any).section === 'BODY');
const bodyMax = Math.max(...body.map((p) => p.plannedPageNumber ?? 0));
console.log('body max planned page =', bodyMax);
const back = all.filter((p) => (p as any).section === 'BACK_MATTER').sort((a, b) => ((a as any).spineOrder ?? 0) - ((b as any).spineOrder ?? 0));
for (const p of back) {
  const so = (p as any).spineOrder ?? 0;
  const fmt = (p as any).frontMatterType;
  const expected = so > 0 && fmt !== 'ABOUT_SERIES' ? bodyMax + so : '(none)';
  console.log(p.pageKey.padEnd(26), 'spineOrder=' + String(so).padEnd(5), 'fmt=' + String(fmt).padEnd(14), 'expectedFolio=' + expected);
}
process.exit(0);
