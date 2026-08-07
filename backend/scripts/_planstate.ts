/* Render campaign state: what's done, what's left, by chapter + front/back matter. Read-only. */
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';
const db = getDb();
const pg = await db.select().from(pages).where(eq(pages.projectId, P));
const rends = await db.select().from(wholePageRenders).where(eq(wholePageRenders.projectId, P));
const rByPage = new Map<string, string>();
for (const r of rends) rByPage.set(r.pageId, r.status);
const sec = (k:string)=> k.startsWith('CH')? k.slice(0,4) : k.startsWith('FM')?'FRONT':'BACK';
type Row={need:number;done:number};
const g = new Map<string,Row>();
for (const p of pg) {
  const isFM = p.pageKey.startsWith('FM')||p.pageKey.startsWith('BM');
  const illustrated = p.carriesSubject || (isFM && (p as any).aiRendered);
  // FM aiRendered flag not on row; approximate: FM illustrated = half-title/title/contents/intro/about
  const fmIll = isFM && /HALF_TITLE|TITLE_PAGE|CONTENTS|INTRODUCTION|ABOUT/.test(p.pageKey);
  const needs = p.carriesSubject || fmIll;
  if (!needs) continue;
  const key = sec(p.pageKey);
  const row = g.get(key) ?? {need:0,done:0}; row.need++;
  const st = rByPage.get(p.id);
  if (st==='RENDERED'||st==='APPROVED') row.done++;
  g.set(key,row);
}
let tn=0,td=0;
console.log('SECTION        need  done  left');
for (const k of [...g.keys()].sort()) { const r=g.get(k)!; tn+=r.need; td+=r.done; console.log(`  ${k.padEnd(12)} ${String(r.need).padStart(4)} ${String(r.done).padStart(5)} ${String(r.need-r.done).padStart(5)}`); }
console.log(`  ${'TOTAL'.padEnd(12)} ${String(tn).padStart(4)} ${String(td).padStart(5)} ${String(tn-td).padStart(5)}`);
process.exit(0);
