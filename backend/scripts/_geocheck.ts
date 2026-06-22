/* Dump stampGeometryForRender for one page. Read-only. Usage: _geocheck.ts <pageKey> */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { stampGeometryForRender } from '../src/pipeline/print-prep/print-prep.js';
import { P } from './_project.js';
const KEY = process.argv[2] ?? 'CH02_P004_c2';
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0]!;
const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0]!;
console.log(JSON.stringify(await stampGeometryForRender(r.id), null, 2));
process.exit(0);
