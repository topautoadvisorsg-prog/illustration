/* CONSISTENCY CHECK for the 8 restored renders: does the text BAKED into each
 * image still match what the page says AFTER re-pagination? If any differ, the
 * render is stale and must be re-rendered. Read-only. Usage: _rendertextcheck.ts */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { stripReadingFieldMetadata } from '../src/pipeline/subject-badges/extract-badges.js';
import { P } from './_project.js';

const KEYS = ['CH01_P001','CH02_P001','CH02_P024','CH02_P024_c1','CH02_P028','CH03_P009','CH03_P009_c1','CH03_P013'];
const db = getDb();

// Normalize prose to plain words: DELETE markdown emphasis (so `**x**,`->`x,`),
// drop horizontal-rule separators (---, ***), collapse whitespace, lowercase.
const norm = (s: string) => (s ?? '')
  .replace(/^[-*]{3,}\s*$/gm, ' ')   // --- / *** section rules
  .replace(/[*_`#>|]/g, '')          // emphasis + header pipes: delete, don't space
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

function firstDiff(a: string, b: string): string {
  const n = Math.min(a.length, b.length);
  let i = 0; while (i < n && a[i] === b[i]) i++;
  if (i === n && a.length === b.length) return '(identical)';
  const ctx = (s: string) => s.slice(Math.max(0, i - 40), i + 40);
  return `@${i}/${a.length} vs ${b.length}\n      baked : …${ctx(a)}…\n      page  : …${ctx(b)}…`;
}

let allOk = true;
for (const key of KEYS) {
  const pg = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, key))))[0];
  if (!pg) { console.log(`  ${key}: NO PAGE`); allOk = false; continue; }
  const r = (await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, pg.id)))[0] as any;
  if (!r) { console.log(`  ${key}: NO RENDER`); allOk = false; continue; }

  const baked = r.specJson?.pageText?.body ?? '';
  const bakedTitle = r.specJson?.pageText?.title ?? {};
  const currentBody = stripReadingFieldMetadata(pg.readingFieldText ?? '');

  const bodyOk = norm(baked) === norm(currentBody);
  // title: scientificName from the header line should still be present
  const sci = (bakedTitle.scientificName ?? '').trim();
  const titleOk = !sci || norm(pg.readingFieldText ?? '').includes(norm(sci));

  const status = bodyOk && titleOk ? 'MATCH ✓' : 'MISMATCH ✗';
  if (!(bodyOk && titleOk)) allOk = false;
  console.log(`  ${key.padEnd(15)} ${status}  [title:${bakedTitle.name ?? '—'} / ${sci || '—'}]  body:${baked.length}b page:${currentBody.length}b`);
  if (!bodyOk) console.log('      BODY DIFF ' + firstDiff(norm(baked), norm(currentBody)));
  if (!titleOk) console.log(`      TITLE: scientificName "${sci}" not found in current page header`);
}
console.log('\n' + (allOk ? 'ALL 8 CONSISTENT — baked text matches current page text. Renders are valid.'
  : 'SOME MISMATCH — see above; those renders are stale and need re-render.'));
process.exit(0);
