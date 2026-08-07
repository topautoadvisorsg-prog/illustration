/* DRY re-paginate: run the paginator in-memory with the CURRENT code (incl. the
 * title-fit layout gate) and DIFF against the persisted rows. NO persist, NO spend.
 * Answers two questions before we touch the DB:
 *   (1) Does the book REFLOW? (page count / numbering / role changes)
 *   (2) Which openers just SWAP layout template? (surgical-fixable, renders preserved)
 * Usage: _drypaginate.ts */
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, manifests, projects } from '../src/db/schema/index.js';
import { PageManifestSchema, ProjectConfigSchema } from '@wildlands/shared';
import { paginateProject } from '../src/pipeline/stage-1.75-pagination/paginate.js';
import { P } from './_project.js';

const db = getDb();
const proj = (await db.select().from(projects).where(eq(projects.id, P)))[0]!;
const config = ProjectConfigSchema.parse(proj.config);
const mrows = await db.select().from(manifests).where(eq(manifests.projectId, P));
const entries = mrows
  .filter((r) => r.kind === 'PAGE')
  .map((r) => PageManifestSchema.parse(r.content));

const result = paginateProject({ entries, config });

// Persisted rows (body only — front/back matter isn't produced by paginateProject).
const dbRows = await db.select().from(pages).where(eq(pages.projectId, P));
const dbByKey = new Map(dbRows.map((r) => [r.pageKey, r]));

const newByKey = new Map(result.pages.map((p) => [p.pageKey, p]));

// (1) structural diff — keys added/removed = reflow
const dbBodyKeys = new Set(dbRows.filter((r) => /^CH\d+_P/.test(r.pageKey)).map((r) => r.pageKey));
const newKeys = new Set(result.pages.map((p) => p.pageKey));
const added = [...newKeys].filter((k) => !dbBodyKeys.has(k));
const removed = [...dbBodyKeys].filter((k) => !newKeys.has(k));

console.log('=== STRUCTURAL DIFF (reflow?) ===');
console.log('  db body pages:', dbBodyKeys.size, ' new body pages:', newKeys.size);
console.log('  ADDED keys:', added.length ? added.join(', ') : '(none)');
console.log('  REMOVED keys:', removed.length ? removed.join(', ') : '(none)');

// (2) layout-template swaps on matching keys
console.log('\n=== LAYOUT SWAPS (same key, template changed) ===');
let swaps = 0;
for (const [key, np] of newByKey) {
  const old = dbByKey.get(key);
  if (!old) continue;
  if ((old.layoutTemplate ?? null) !== (np.layoutTemplate ?? null)) {
    swaps++;
    const title = (np as { entryTitle?: string }).entryTitle ?? key;
    console.log(`  ${key}  ${old.layoutTemplate} -> ${np.layoutTemplate}   [${title}]`);
  }
}
if (!swaps) console.log('  (none)');
console.log(`\nTOTAL swaps: ${swaps} | added: ${added.length} | removed: ${removed.length}`);

// (3) text-allocation deltas on swapped pages — if chars differ, a template-only
// DB update would leave text sized for the OLD layout. Zero delta => _setlayout safe.
console.log('\n=== TEXT-ALLOCATION DELTAS (swapped pages) ===');
let textChanged = 0;
for (const [key, np] of newByKey) {
  const old = dbByKey.get(key);
  if (!old) continue;
  if ((old.layoutTemplate ?? null) === (np.layoutTemplate ?? null)) continue;
  const oldChars = old.readingFieldChars ?? (old.readingFieldText ?? '').length;
  const newChars = (np as { readingFieldChars?: number }).readingFieldChars ??
    ((np as { readingFieldText?: string }).readingFieldText ?? '').length;
  const delta = newChars - oldChars;
  if (delta !== 0) { textChanged++; console.log(`  ${key}: ${oldChars} -> ${newChars}  (Δ${delta})`); }
}
if (!textChanged) console.log('  (all swapped pages: identical text allocation — template-only)');

// (4) which paid renders sit on swapped pages
const swapKeys = new Set([...newByKey].filter(([k, np]) => {
  const old = dbByKey.get(k); return old && (old.layoutTemplate ?? null) !== (np.layoutTemplate ?? null);
}).map(([k]) => k));
const { wholePageRenders } = await import('../src/db/schema/index.js');
const { and } = await import('drizzle-orm');
const paid = await db.select({ pageId: wholePageRenders.pageId, status: wholePageRenders.status })
  .from(wholePageRenders).where(and(eq(wholePageRenders.projectId, P), eq(wholePageRenders.active, true)));
const idToKey = new Map(dbRows.map((r) => [r.id, r.pageKey]));
const paidKeys = paid.filter((r) => r.status === 'RENDERED' || r.status === 'APPROVED').map((r) => idToKey.get(r.pageId));
console.log('\n=== PAID RENDERS (' + paidKeys.length + ') ===');
console.log('  keys:', paidKeys.join(', '));
console.log('  paid renders ON swapped pages (need re-render):',
  paidKeys.filter((k) => k && swapKeys.has(k)).join(', ') || '(none)');
process.exit(0);
