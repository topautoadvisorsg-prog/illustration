/* List front/back-matter page keys (non-CH) with layout + frontMatterType. Read-only. */
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';

const P = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';
const db = getDb();
const all = await db.select().from(pages).where(eq(pages.projectId, P));
const fm = all
  .filter((p) => !/^CH\d/.test(p.pageKey))
  .sort((a, b) => (a.plannedPageNumber ?? 0) - (b.plannedPageNumber ?? 0));
for (const p of fm) {
  console.log(
    String(p.plannedPageNumber ?? '?').padStart(3),
    p.pageKey.padEnd(22),
    (p.layoutTemplate ?? '').padEnd(22),
    (p as { frontMatterType?: string | null }).frontMatterType ?? '',
  );
}
process.exit(0);
