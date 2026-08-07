import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { P } from './_project.js';
const db = getDb();
const pg = await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.section, 'BODY')));
const openers = pg.filter(p => p.pageRole === 'opener');
console.log('OPENERS:', openers.length);
const byLC = new Map<string, number>();
for (const p of openers) { const k = `${p.layoutTemplate} | carriesSubject=${p.carriesSubject}`; byLC.set(k, (byLC.get(k)??0)+1); }
for (const [k,n] of [...byLC.entries()].sort()) console.log(`  ${n.toString().padStart(3)}  ${k}`);
// list the pure-text openers (LAYOUT_D) explicitly
console.log('\nLAYOUT_D_PURE_TEXT openers (text-only reference sections, no art by design):');
for (const p of openers.filter(p=>p.layoutTemplate==='LAYOUT_D_PURE_TEXT').sort((a,b)=>a.pageKey.localeCompare(b.pageKey))) {
  const t=(p.readingFieldText??'').replace(/[*#>|]/g,'').split('\n').map(s=>s.trim()).filter(Boolean)[0]??'';
  console.log(`   ${p.pageKey.padEnd(11)} ${t.slice(0,50)}`);
}
process.exit(0);
