/* Phase 1 audit: inventory all pages by section / pageType / layout family so we
 * can pick representative test pages for the ornament-free redesign. Read-only. */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';

import { P } from './_project.js';
const db = getDb();
const all = await listPaginatedPagesForProject(P);

const section = (k: string) => (/^FM_/.test(k) ? 'front-matter' : /^BM_/.test(k) ? 'back-matter' : 'body');
const tally = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const bySection = new Map<string, number>(), byType = new Map<string, number>(), byLayout = new Map<string, number>();
const openers: string[] = [];
const exemplar: Record<string, { key: string; folio: number; title: string }> = {};

for (const pg of all) {
  const key = pg.pageKey || '';
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, key))))[0];
  const rend = row ? (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] : undefined;
  const spec: any = rend?.specJson ?? {};
  const pageType = spec.pageType ?? 'UNKNOWN';
  const layout = spec.layoutFamily ?? 'n/a';
  tally(bySection, section(key)); tally(byType, pageType); tally(byLayout, layout);
  if (pageType === 'CHAPTER_OPENER') openers.push(`${String(pg.plannedPageNumber).padStart(3)}  ${key}  ${pg.entryTitle ?? ''}`);
  // capture one exemplar per layout family (prefer a body page with a title)
  if (!exemplar[layout] && section(key) === 'body') exemplar[layout] = { key, folio: pg.plannedPageNumber ?? 0, title: pg.entryTitle ?? '' };
}

const show = (label: string, m: Map<string, number>) => { console.log(`\n${label}:`); for (const [k, v] of [...m].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`); };
console.log('TOTAL pages:', all.length);
show('By section', bySection);
show('By pageType', byType);
show('By layout family', byLayout);
console.log('\nCHAPTER OPENERS:'); openers.forEach((o) => console.log('  ' + o));
console.log('\nONE EXEMPLAR PER LAYOUT FAMILY (test-page candidates):');
for (const [layout, e] of Object.entries(exemplar)) console.log(`  ${layout.padEnd(28)} → folio ${String(e.folio).padStart(3)}  ${e.key}  ${e.title}`);
process.exit(0);
