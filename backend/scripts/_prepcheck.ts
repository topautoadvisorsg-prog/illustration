/* Call printPrepRender for one page and report what it stamped. Cache-only.
 * Usage: RENDER_CACHE_ONLY=1 _prepcheck.ts <pageKey> */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { printPrepRender } from '../src/pipeline/print-prep/print-prep.js';
import { P } from './_project.js';

const KEY = process.argv[2] ?? 'CH02_P004_c2';
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0]!;
const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0]!;
console.log('page row:', JSON.stringify({ section: (row as any).section, frontMatterType: (row as any).frontMatterType, planned: row.plannedPageNumber, spineOrder: (row as any).spineOrder }));
const res = await printPrepRender(r.id);
console.log('RESULT:', JSON.stringify({ stampedFolio: res.stampedFolio, stampedBadges: res.stampedBadges, preflight: res.preflight.passed }));
process.exit(0);
