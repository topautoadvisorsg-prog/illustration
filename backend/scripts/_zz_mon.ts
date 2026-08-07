import { getDb } from '../src/db/client.js';
import { sql } from 'drizzle-orm';
const db = getDb();
const PID='8c1e161a-69dd-4a3d-a655-8de54995be16';
const PREFIX=process.argv[2] ?? 'CH02';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
// Per-page precedence: DONE if any successful render row exists; else RENDERING;
// else FAILED; else pending. Robust to stale orphan rows from stopped runners.
async function snap(){
  const r:any=await db.execute(sql.raw(`
   select
     case
       when bool_or(w.status in ('RENDERED','APPROVED')) then 'done'
       when bool_or(w.status='RENDERING') then 'rendering'
       when bool_or(w.status='FAILED') then 'failed'
       else 'pending' end state
   from pages p left join whole_page_renders w on w.page_id=p.id
   where p.project_id='${PID}' and p.page_key like '${PREFIX}%'
   group by p.id`));
  const rows=(r.rows??r) as any[]; let done=0,failed=0,inprog=0;
  for(const x of rows){ if(x.state==='done')done++; else if(x.state==='failed')failed++; else if(x.state==='rendering')inprog++; }
  return {total:rows.length,done,failed,inprog};
}
let last='';
for(let i=0;i<240;i++){ let s; try{ s=await snap(); }catch{ await sleep(30000); continue; } const line=`${PREFIX}: ${s.done} of ${s.total} pages DONE (good) · ${s.failed} errors · ${s.inprog} rendering now`; if(line!==last){ console.log(line); last=line; } if(s.done+s.failed>=s.total){ console.log(`✅ ${PREFIX} COMPLETE: ${s.done} pages rendered, ${s.failed} errors`); break; } await sleep(30000); }
process.exit(0);
