import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq, and, inArray } from 'drizzle-orm';
const db = getDb();
const P = process.argv[2]!;
const keys = process.argv.slice(3);
const ps = await db.select().from(pages).where(eq(pages.projectId, P));
for (const k of keys) {
  const pg = (ps as any[]).find(p=>p.pageKey===k);
  if(!pg){console.log(k,'— not found');continue;}
  const r:any = (await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, pg.id))).find((x:any)=>x.active);
  console.log(`${k} | plannedPageNo=${pg.plannedPageNumber} | section=${pg.section} | printPng=${r?.printPngPath}`);
}
process.exit(0);
