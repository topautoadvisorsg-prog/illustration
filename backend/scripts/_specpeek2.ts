/* Inspect the pageText structure of a restored render spec. Read-only. */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';

const db = getDb();
const pg = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, 'CH02_P001'))))[0]!;
const r = (await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, pg.id)))[0]! as any;
const spec = r.specJson;
console.log('pageText keys:', Object.keys(spec.pageText ?? {}));
console.log('pageText JSON (first 1200 chars):');
console.log(JSON.stringify(spec.pageText, null, 2).slice(0, 1200));
console.log('\n--- current page readingFieldText (first 400) ---');
console.log((pg.readingFieldText ?? '').slice(0, 400));
process.exit(0);
