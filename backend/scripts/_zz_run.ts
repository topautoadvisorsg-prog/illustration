/* Resilient chapter render: ONE render per page, skip done, log+continue on error, no auto-retry. */
import { getDb } from '../src/db/client.js';
import { sql } from 'drizzle-orm';
import { createAndRunRender } from '../src/pipeline/whole-page-render/render-whole-page.js';
const db = getDb();
const PID='8c1e161a-69dd-4a3d-a655-8de54995be16';
const PREFIX=process.argv[2] ?? 'CH02';
const PER_MS=300000;
const withTimeout=(p:Promise<any>,ms:number,l:string)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('TIMEOUT '+l)),ms))]);
async function alreadyDone(id:string){ try{ const c:any=await db.execute(sql.raw(`select 1 from whole_page_renders w where w.page_id='${id}' and w.status in ('RENDERED','APPROVED') limit 1`)); return (c.rows??c).length>0; }catch{ return false; } }
const r:any=await db.execute(sql.raw(`select p.id, p.page_key from pages p where p.project_id='${PID}' and p.page_key like '${PREFIX}%' and not exists(select 1 from whole_page_renders w where w.page_id=p.id and w.status in ('RENDERED','APPROVED')) order by p.page_key`));
const pages=(r.rows??r) as any[];
console.log(`${PREFIX} render: ${pages.length} page(s), one attempt each\n`);
const done:string[]=[], failed:string[]=[];
for(const pg of pages){
  if(await alreadyDone(pg.id)){ console.log('SKIP', pg.page_key); continue; }
  try{
    const res:any=await withTimeout(createAndRunRender(pg.id,{}),PER_MS,pg.page_key);
    if(res.status==='RENDERED'){ done.push(pg.page_key); console.log(`OK ${pg.page_key} v${res.version} attempts=${res.attempts}`); }
    else { failed.push(pg.page_key); console.log(`BAD ${res.status} ${pg.page_key}`); }
  }catch(e:any){ failed.push(pg.page_key); console.log(`ERR ${pg.page_key} — ${(e.message||String(e)).split('\n')[0]} (continuing)`); }
}
console.log(`\n==== ${PREFIX} SUMMARY ====\nrendered: ${done.length}/${pages.length}`);
console.log(failed.length?`failed: ${failed.length} -> ${failed.join(', ')} (re-run these only)`:'failed: 0 — chapter fully rendered');
process.exit(0);
