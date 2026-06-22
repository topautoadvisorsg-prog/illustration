/* Self-contained HTML preview of the book — with STAMP-PLACEMENT OVERLAY MODE.
 * For every page it embeds a downscaled JPEG AND the exact geometry of every
 * stamped element + boundary (from print-prep's stampGeometryForRender — the SAME
 * code that stamps), so placement is verified in the preview, never after export.
 * Toggle layers: Trim / Safe / Reading / Badge box / Folio box. Reader spreads.
 * Output: Downloads/THE_WILDLANDS_preview.html. Usage: _flipbook.ts */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { resolveSpine } from '../src/pipeline/book-assembly/spine-order.js';
import { stampGeometryForRender } from '../src/pipeline/print-prep/print-prep.js';
import { P } from './_project.js';

const db = getDb();
const storage = getProjectStorage();
const allPages = await db.select().from(pages).where(eq(pages.projectId, P));
const spine = resolveSpine(
  allPages.map((p) => ({ id: p.id, pageKey: p.pageKey, chapterNumber: (p as any).chapterNumber ?? 0, plannedPageNumber: p.plannedPageNumber ?? 0, section: (p as any).section, spineOrder: (p as any).spineOrder })),
);

type Box = { x: number; y: number; w: number; h: number } | null;
type Item = { key: string; side: 'left' | 'right'; folio: string | null; jpg: string; boxes: { trim: Box; safe: Box; reading: Box; badge: Box; folio: Box } | null };
const items: Item[] = [];
let i = 0;
for (const sp of spine) {
  const full = allPages.find((p) => p.id === sp.id)!;
  const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, full.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown> | undefined;
  const side: 'left' | 'right' = (i + 1) % 2 === 1 ? 'right' : 'left';
  let jpg = '';
  const pngPath = (r?.printPngPath as string) ?? (r?.printPdfPath as string | undefined)?.replace('.print.pdf', '.print.png');
  if (pngPath) { try { jpg = (await sharp(await storage.readProjectFile(pngPath)).resize({ width: 560 }).jpeg({ quality: 60 }).toBuffer()).toString('base64'); } catch { /* blank */ } }
  let boxes: Item['boxes'] = null;
  let folio: string | null = null;
  if (r?.id) {
    try {
      const g = await stampGeometryForRender(r.id as string);
      const W = g.canvas.width, H = g.canvas.height;
      const f = (b: { left: number; top: number; width: number; height: number } | null): Box => (b ? { x: b.left / W, y: b.top / H, w: b.width / W, h: b.height / H } : null);
      boxes = { trim: f(g.trim), safe: f(g.safe), reading: f(g.reading), badge: f(g.badgeBox), folio: f(g.folioBox) };
      folio = g.folioLabel;
    } catch { /* leave null */ }
  }
  items.push({ key: full.pageKey, side, folio, jpg, boxes });
  if (++i % 30 === 0) console.log('  geometry', i, '/', spine.length);
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The Wildlands — placement preview</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#15140f;color:#e8e2d4;font-family:system-ui,sans-serif}
  #bar{position:sticky;top:0;z-index:5;display:flex;gap:12px;align-items:center;padding:9px 14px;background:#1f1d16;border-bottom:1px solid #3a352a;flex-wrap:wrap}
  #bar b{font-size:14px} button{background:#3a352a;color:#e8e2d4;border:1px solid #564f3f;border-radius:6px;padding:6px 11px;cursor:pointer}
  button:hover{background:#4a4435} input[type=number]{width:60px;background:#15140f;color:#e8e2d4;border:1px solid #564f3f;border-radius:6px;padding:5px}
  .lay{font-size:13px;display:flex;gap:5px;align-items:center;padding:3px 8px;border-radius:5px;border:1px solid #564f3f}
  .sw{width:13px;height:13px;border-radius:3px;display:inline-block}
  #stage{display:flex;justify-content:center;padding:20px 10px}
  .spread{display:flex;gap:2px;align-items:flex-start;background:#0c0b08;box-shadow:0 0 40px #000}
  .page{position:relative;width:min(46vw,500px)}
  .page img{width:100%;display:block}
  .blank{width:min(46vw,500px);aspect-ratio:7.25/10.25;background:#0c0b08}
  .cap{position:absolute;top:5px;left:5px;background:rgba(0,0,0,.62);padding:3px 7px;border-radius:5px;font-size:12px}
  .overlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
  .lyr{fill:none;vector-effect:non-scaling-stroke;display:none}
  .l-trim{stroke:#ff3b3b;stroke-width:2}
  .l-safe{stroke:#ffa83b;stroke-width:1.5;stroke-dasharray:5 4}
  .l-reading{stroke:#ffe14d;stroke-width:1.4;stroke-dasharray:4 4}
  .l-badge{stroke:#d36bff;stroke-width:1.5;stroke-dasharray:4 3}
  .l-folio{stroke:#27e0d0;stroke-width:2.6}
  body.s-trim .l-trim,body.s-safe .l-safe,body.s-reading .l-reading,body.s-badge .l-badge,body.s-folio .l-folio{display:block}
  .spine{width:2px;background:#564f3f}
</style></head><body class="s-trim s-safe s-folio">
<div id="bar">
  <button onclick="go(-1)">◀</button><button onclick="go(1)">▶</button>
  <b id="lbl"></b>
  <label class="lay">folio <input id="jump" type="number" min="1" onchange="jumpFolio(this.value)"></label>
  <span style="opacity:.6">overlays:</span>
  <label class="lay"><input type="checkbox" checked onchange="L('trim',this.checked)"><span class="sw" style="background:#ff3b3b"></span>Trim</label>
  <label class="lay"><input type="checkbox" checked onchange="L('safe',this.checked)"><span class="sw" style="background:#ffa83b"></span>Safe</label>
  <label class="lay"><input type="checkbox" onchange="L('reading',this.checked)"><span class="sw" style="background:#ffe14d"></span>Reading</label>
  <label class="lay"><input type="checkbox" onchange="L('badge',this.checked)"><span class="sw" style="background:#d36bff"></span>Badge box</label>
  <label class="lay"><input type="checkbox" checked onchange="L('folio',this.checked)"><span class="sw" style="background:#27e0d0"></span>Folio box</label>
  <span style="opacity:.6;font-size:12px">← → flip · cyan box = exact page-number stamp</span>
</div>
<div id="stage"></div>
<script>
const D=${JSON.stringify(items)};
const spreads=[[null,0]]; for(let k=1;k<D.length;k+=2) spreads.push([k, k+1<D.length?k+1:null]);
let cur=0;
function ovl(b){ if(!b) return '';
  const R=(x,cls)=> x? '<rect class="lyr '+cls+'" x="'+x.x+'" y="'+x.y+'" width="'+x.w+'" height="'+x.h+'"/>':'';
  return '<svg class="overlay" viewBox="0 0 1 1" preserveAspectRatio="none">'
    + R(b.trim,'l-trim')+R(b.safe,'l-safe')+R(b.reading,'l-reading')+R(b.badge,'l-badge')+R(b.folio,'l-folio')+'</svg>'; }
function pageHTML(idx){ if(idx==null) return '<div class="blank"></div>';
  const d=D[idx]; const img=d.jpg?('<img src="data:image/jpeg;base64,'+d.jpg+'">'):'<div class="blank"></div>';
  return '<div class="page">'+img+(d.boxes?ovl(d.boxes):'')+'<div class="cap">'+d.key+' · '+d.side+'-hand · PDF p'+(idx+1)+(d.folio?' · folio '+d.folio:' · (no folio)')+'</div></div>'; }
function render(){ const [l,r]=spreads[cur];
  document.getElementById('stage').innerHTML='<div class="spread">'+pageHTML(l)+'<div class="spine"></div>'+pageHTML(r)+'</div>';
  document.getElementById('lbl').textContent='Spread '+(cur+1)+' / '+spreads.length; }
function go(d){ cur=Math.max(0,Math.min(spreads.length-1,cur+d)); render(); }
function L(name,on){ document.body.classList.toggle('s-'+name,on); }
function jumpFolio(v){ const n=parseInt(v,10); if(!n) return; const idx=D.findIndex(d=>d.folio===String(n)); if(idx>=0){ cur=spreads.findIndex(s=>s[0]===idx||s[1]===idx); if(cur<0)cur=0; render(); } }
document.addEventListener('keydown',e=>{ if(e.key==='ArrowRight')go(1); if(e.key==='ArrowLeft')go(-1); });
render();
</script></body></html>`;
writeFileSync('C:/Users/jovan/Downloads/THE_WILDLANDS_preview.html', html);
console.log('→ Downloads/THE_WILDLANDS_preview.html (' + items.length + ' pages, ' + (Buffer.byteLength(html) / 1048576).toFixed(1) + ' MB)');
process.exit(0);
