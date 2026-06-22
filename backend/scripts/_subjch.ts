/* List a chapter's pages with their active render's illustration subject, to spot
 * near-duplicate images. Read-only. Usage: _subjch.ts <CHxx> [grepWord] */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';
const CH = (process.argv[2] ?? 'CH02').toUpperCase();
const WORD = (process.argv[3] ?? '').toLowerCase();
const db = getDb();
const all = (await db.select().from(pages).where(eq(pages.projectId, P)))
  .filter((p) => p.pageKey.startsWith(CH + '_'))
  .sort((a, b) => (a.plannedPageNumber ?? 0) - (b.plannedPageNumber ?? 0));
for (const p of all) {
  const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, p.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown> | undefined;
  const spec = r?.specJson as any;
  const subj = spec?.illustrationDNA?.subject?.primary ?? '?';
  const line = `${p.pageKey.padEnd(18)} p${String(p.plannedPageNumber ?? '?').padEnd(4)} v${(r?.version ?? '-')} | ${String(subj).slice(0, 80)}`;
  if (!WORD || line.toLowerCase().includes(WORD)) console.log(line);
}
process.exit(0);
