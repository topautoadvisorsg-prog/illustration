/* Whole-book audit: every page's render state + capacity. Tells us what still needs
 * rendering. Read-only. Usage: _audit_all.ts */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';

const P = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';
const PURE_CAP = 3128;
// Renders created this session (architecture-fixed) are "fresh"; older = stale.
const FRESH = new Date('2026-06-18T00:00:00Z');
const db = getDb();

function strip(md: string) { return md.replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/`(.*?)`/g, '$1').replace(/\[(.*?)\]\(.*?\)/g, '$1').trim(); }

const all = (await db.select().from(pages).where(eq(pages.projectId, P))).sort((a, b) => (a.plannedPageNumber ?? 0) - (b.plannedPageNumber ?? 0));

type Stat = { total: number; fresh: number; stale: number; missing: number; over: string[]; needs: string[] };
const sections = new Map<string, Stat>();
const blank = (): Stat => ({ total: 0, fresh: 0, stale: 0, missing: 0, over: [], needs: [] });

for (const pg of all) {
  const m = /^(CH\d+)_/.exec(pg.pageKey);
  const sec = m ? m[1] : 'FRONT/BACK-MATTER';
  if (!sections.has(sec)) sections.set(sec, blank());
  const s = sections.get(sec)!;
  s.total++;

  const act = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, pg.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0];
  const rendered = act?.status === 'RENDERED';
  const fresh = rendered && act?.createdAt && new Date(act.createdAt as any) >= FRESH;
  if (fresh) s.fresh++;
  else if (rendered) { s.stale++; s.needs.push(pg.pageKey + '(stale)'); }
  else { s.missing++; s.needs.push(pg.pageKey + (act ? `(${act.status})` : '(none)')); }

  const chars = strip(pg.readingFieldText ?? '').length;
  if (chars > 0) {
    const paras = (pg.readingFieldText ?? '').split(/\n\s*\n/).filter((x) => x.trim()).length;
    const load = chars + 120 * Math.max(0, paras - 1);
    if (load > PURE_CAP) s.over.push(`${pg.pageKey}(${chars}c/${load}L)`);
  }
}

const pad = (x: string | number, n: number) => String(x).padEnd(n);
console.log(pad('SECTION', 20) + pad('total', 7) + pad('fresh', 7) + pad('stale', 7) + pad('missing', 9) + 'over-cap');
console.log('-'.repeat(64));
let T = 0, F = 0;
for (const [sec, s] of [...sections.entries()].sort()) {
  T += s.total; F += s.fresh;
  console.log(pad(sec, 20) + pad(s.total, 7) + pad(s.fresh, 7) + pad(s.stale, 7) + pad(s.missing, 9) + (s.over.length || ''));
}
console.log('-'.repeat(64));
console.log(`TOTAL ${T} pages | ${F} fresh | ${T - F} need attention\n`);

console.log('=== PAGES STILL NEEDING RENDER (stale / missing), by section ===');
for (const [sec, s] of [...sections.entries()].sort()) {
  if (s.needs.length) console.log(`${sec}: ${s.needs.join(' ')}`);
}
console.log('\n=== OVER-CAPACITY PAGES (load > pure-text cap; re-pagination candidates) ===');
for (const [sec, s] of [...sections.entries()].sort()) {
  if (s.over.length) console.log(`${sec}: ${s.over.join(' ')}`);
}
process.exit(0);
