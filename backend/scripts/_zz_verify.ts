import { getDb } from '../src/db/client.js';
import { sql } from 'drizzle-orm';
import { prepareRender } from '../src/pipeline/whole-page-render/render-whole-page.js';
const db = getDb();
const PID='8c1e161a-69dd-4a3d-a655-8de54995be16';
const PREFIX=process.argv[2] ?? 'CH02';
const BANNED=['SAFE CONTENT AREA','TEXT SAFETY IS HIGHEST PRIORITY','SAFE-ZONE (hard constraint)','TEXT CENTERING:','ILLUSTRATION IS FULL-BLEED, NEVER REDUCED','NO LINE OR BORDER AROUND THE TEXT','NO DECORATIVE BANDS OR FRAMES','The reading field sits at the supplied coordinates','Temperate woodland'];
const REQ=['PRODUCTION GUIDES ARE NOT ARTWORK','COMPOSITION CONTRACT','LAYER ARCHITECTURE','NO FRAMES, BORDERS, OR DECORATIVE BANDS','TEXT SAFETY (highest priority','BOTTOM ANCHOR','TOP ANCHOR','SUBJECT POSE','HARD NEGATIVES'];
const r:any=await db.execute(sql.raw(`
 select p.id, p.page_key from pages p
 where p.project_id='${PID}' and p.page_key like '${PREFIX}%'
   and not exists (select 1 from whole_page_renders w where w.page_id=p.id and w.status in ('RENDERED','APPROVED'))
 order by p.page_key`));
const rows=(r.rows??r) as any[];
console.log(`${PREFIX} remaining to render: ${rows.length}`);
let clean=true; const envCount=new Map<string,number>();
for(const row of rows){
  const p=await prepareRender(row.id); const prompt=p.assembledPrompt;
  const env=(prompt.match(/"environment":\s*"([^"]+)"/)||[])[1]||'(n/a)'; envCount.set(env,(envCount.get(env)??0)+1);
  const bad=BANNED.filter(b=>prompt.includes(b));
  const isText=/PAGE BODY — render every block/.test(prompt);
  const miss=isText?REQ.filter(q=>!prompt.includes(q)):[];
  const ts=(prompt.match(/TEXT SAFETY \(highest priority/g)||[]).length;
  const ok=bad.length===0&&miss.length===0&&(!isText||ts===1);
  if(!ok){clean=false; console.log(`❌ ${row.page_key} ${bad.length?'BANNED:'+bad:''} ${miss.length?'MISSING:'+miss:''} ts=${ts}`);}
}
console.log('\nbiome spread:'); for(const [k,v] of [...envCount.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(3)} ${k}`);
console.log(`\n${clean?'✅ ALL '+PREFIX+' PROMPTS CLEAN — safe to render':'❌ FIX BEFORE RENDER'}`);
process.exit(0);
