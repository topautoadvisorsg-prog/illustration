/* Break down the body pages that carry NO illustration, by role + layout, so we
 * can confirm they're legitimately text (continuations + protocol sections) and
 * not species entries that wrongly lost art. Read-only. */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { P } from './_project.js';
const db = getDb();
const pg = await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.section, 'BODY')));
const noimg = pg.filter(p => !p.carriesSubject);
const openers = noimg.filter(p => p.pageRole === 'opener');
const conts = noimg.filter(p => p.pageRole !== 'opener');
console.log(`BODY pages: ${pg.length} | with illustration: ${pg.length-noimg.length} | NO illustration: ${noimg.length}`);
console.log(`  of the no-illustration pages: ${conts.length} are CONTINUATIONS (art is on the entry's first page)`);
console.log(`  ${openers.length} are OPENERS with no art (should be text-only reference sections):`);
for (const p of openers.sort((a,b)=>a.pageKey.localeCompare(b.pageKey))) {
  const t = (p.readingFieldText ?? '').replace(/[*#>|]/g,'').split('\n').map(s=>s.trim()).filter(Boolean)[0] ?? '';
  console.log(`     ${p.pageKey.padEnd(12)} ${(''+p.layoutTemplate).padEnd(26)} ${t.slice(0,52)}`);
}
process.exit(0);
