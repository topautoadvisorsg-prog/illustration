/* Diagnostic: dump ordering fields + print paths for a sample of pages. Read-only. */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';

const db = getDb();
const all = await db.select().from(pages).where(eq(pages.projectId, P));
console.log('total pages', all.length);
const sample = [...all].slice(0, 4).concat([...all].filter((p) => p.pageKey.startsWith('CH02_P003')).slice(0, 1));
for (const p of sample) {
  const r = (await db.select().from(wholePageRenders)
    .where(and(eq(wholePageRenders.pageId, p.id), eq(wholePageRenders.active, true)))
    .orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown> | undefined;
  console.log(JSON.stringify({
    key: p.pageKey, section: (p as any).section, spineOrder: (p as any).spineOrder,
    seq: (p as any).sequence, order: (p as any).order, planned: p.plannedPageNumber,
    pdf: (r?.printPdfPath as string) ?? null, png: (r?.printPngPath as string) ?? null,
  }));
}
process.exit(0);
