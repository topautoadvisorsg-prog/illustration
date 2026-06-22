/* Self-contained HTML preview of the re-prepped book. Reads every page from the
 * local cache, embeds a downscaled JPEG (no external files → no browser cache),
 * lays them out as reader SPREADS (verso|recto) so folios show on the OUTER edges.
 * Toggleable trim/safe guides. Read-only. Output: Downloads/THE_WILDLANDS_preview.html
 * Usage: _flipbook.ts */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { resolveSpine } from '../src/pipeline/book-assembly/spine-order.js';
import { P } from './_project.js';

const db = getDb();
const storage = getProjectStorage();
const allPages = await db.select().from(pages).where(eq(pages.projectId, P));
const spine = resolveSpine(
  allPages.map((p) => ({ id: p.id, pageKey: p.pageKey, chapterNumber: (p as any).chapterNumber ?? 0, plannedPageNumber: p.plannedPageNumber ?? 0, section: (p as any).section, spineOrder: (p as any).spineOrder })),
);

type Item = { key: string; side: 'left' | 'right'; jpg: string };
const items: Item[] = [];
let i = 0;
for (const sp of spine) {
  const full = allPages.find((p) => p.id === sp.id)!;
  const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, full.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown> | undefined;
  const side: 'left' | 'right' = (i + 1) % 2 === 1 ? 'right' : 'left'; // PDF index 1 = recto = right
  let jpg = '';
  const pngPath = (r?.printPngPath as string) ?? (r?.printPdfPath as string | undefined)?.replace('.print.pdf', '.print.png');
  if (pngPath) {
    try { jpg = (await sharp(await storage.readProjectFile(pngPath)).resize({ width: 560 }).jpeg({ quality: 60 }).toBuffer()).toString('base64'); } catch { /* leave blank */ }
  }
  items.push({ key: full.pageKey, side, jpg });
  if (++i % 40 === 0) console.log('  loaded', i, '/', spine.length);
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The Wildlands — interior preview</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#15140f;color:#e8e2d4;font-family:system-ui,sans-serif}
  #bar{position:sticky;top:0;display:flex;gap:14px;align-items:center;padding:10px 16px;background:#1f1d16;border-bottom:1px solid #3a352a;flex-wrap:wrap}
  #bar b{font-size:15px} button{background:#3a352a;color:#e8e2d4;border:1px solid #564f3f;border-radius:6px;padding:7px 12px;font-size:15px;cursor:pointer}
  button:hover{background:#4a4435} input{width:64px;background:#15140f;color:#e8e2d4;border:1px solid #564f3f;border-radius:6px;padding:6px}
  label{font-size:14px;display:flex;gap:6px;align-items:center}
  #stage{display:flex;justify-content:center;padding:22px 12px}
  .spread{display:flex;gap:2px;align-items:flex-start;background:#0c0b08;padding:0;box-shadow:0 0 40px #000}
  .page{position:relative;width:min(46vw,520px)}
  .page img{width:100%;display:block}
  .blank{width:min(46vw,520px);aspect-ratio:7.25/10.25;background:#0c0b08}
  .cap{position:absolute;top:6px;left:6px;background:rgba(0,0,0,.6);padding:3px 7px;border-radius:5px;font-size:12px;letter-spacing:.3px}
  .guide{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none}
  .show .guide{display:block}
  .spine{width:2px;background:#564f3f}
</style></head><body>
<div id="bar">
  <button onclick="go(-1)">◀ Prev</button>
  <button onclick="go(1)">Next ▶</button>
  <b id="lbl"></b>
  <label>Jump to folio <input id="jump" type="number" min="1" onchange="jumpFolio(this.value)"></label>
  <label><input type="checkbox" id="g" onchange="toggleGuides(this.checked)"> show trim (red) + safe (orange) guides</label>
  <span style="opacity:.7;font-size:13px">← → arrow keys flip • outer corner = page-turn edge</span>
</div>
<div id="stage"></div>
<script>
const D=${JSON.stringify(items)};
// reader spreads: page 1 alone (recto/right), then [verso|recto] pairs.
const spreads=[[null,0]]; for(let k=1;k<D.length;k+=2) spreads.push([k, k+1<D.length?k+1:null]);
let cur=0, guides=false;
const G='<svg class="guide" viewBox="0 0 7.25 10.25" preserveAspectRatio="none">'
  +'<rect x="0.125" y="0.125" width="7" height="10" fill="none" stroke="#e23b3b" stroke-width="0.03" stroke-dasharray="0.12 0.08"/>'
  +'<rect x="0.625" y="0.625" width="6" height="9" fill="none" stroke="#e8902e" stroke-width="0.022" stroke-dasharray="0.1 0.07"/></svg>';
function pageHTML(idx){ if(idx==null) return '<div class="blank"></div>';
  const d=D[idx]; const img=d.jpg?('<img src="data:image/jpeg;base64,'+d.jpg+'">'):'<div class="blank"></div>';
  return '<div class="page">'+img+G+'<div class="cap">'+d.key+' · '+d.side+'-hand · PDF p'+(idx+1)+'</div></div>'; }
function render(){ const [l,r]=spreads[cur];
  document.getElementById('stage').innerHTML='<div class="spread'+(guides?' show':'')+'">'+pageHTML(l)+'<div class="spine"></div>'+pageHTML(r)+'</div>';
  document.getElementById('lbl').textContent='Spread '+(cur+1)+' / '+spreads.length; }
function go(d){ cur=Math.max(0,Math.min(spreads.length-1,cur+d)); render(); }
function toggleGuides(v){ guides=v; render(); }
function jumpFolio(v){ const n=parseInt(v,10); if(!n) return; const idx=Math.min(D.length-1,Math.max(0,n)); // treat as PDF page index
  cur=spreads.findIndex(s=>s[0]===idx||s[1]===idx); if(cur<0)cur=0; render(); }
document.addEventListener('keydown',e=>{ if(e.key==='ArrowRight')go(1); if(e.key==='ArrowLeft')go(-1); });
render();
</script></body></html>`;
writeFileSync('C:/Users/jovan/Downloads/THE_WILDLANDS_preview.html', html);
console.log('→ Downloads/THE_WILDLANDS_preview.html (' + items.length + ' pages, ' + (Buffer.byteLength(html) / 1048576).toFixed(1) + ' MB)');
process.exit(0);
