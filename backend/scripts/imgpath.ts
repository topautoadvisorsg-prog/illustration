import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
const db = getDb(); const P = process.argv[2]!;
const all = await db.select().from(pages).where(eq(pages.projectId, P));
for (const k of process.argv.slice(3)){ const p=(all as any[]).find(x=>x.pageKey===k); const r:any=(await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId,p.id))).find((x:any)=>x.active); console.log(k, '|', r?.imagePath); }
process.exit(0);
