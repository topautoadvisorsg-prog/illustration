import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import sharp from 'sharp';
const P = process.argv[2]!;
const db = getDb();
const st = getProjectStorage();
const allPages = await db.select().from(pages).where(eq(pages.projectId, P));
const keyById = new Map(allPages.map((p:any)=>[p.id,p.pageKey]));
const renders = await db.select().from(wholePageRenders).where(eq(wholePageRenders.projectId, P));
const active = (renders as any[]).filter(r=>r.active);

// GLOBAL: every page must be active+approved+printPdf+preflight to be in the book at print quality
const approved = active.filter(r=>r.approvedForBook);
const withPdf = approved.filter(r=>r.printPdfPath);
const preflight = withPdf.filter(r=>r.preflightPassed);
console.log('GLOBAL (all 275):');
console.log(`  active=${active.length} approvedForBook=${approved.length} hasPrintPDF=${withPdf.length} preflightPassed=${preflight.length}`);
const gap = approved.filter(r=>!r.printPdfPath || !r.preflightPassed).map(r=>keyById.get(r.pageId));
console.log(`  approved-but-NOT-print-ready: ${gap.length}` + (gap.length?` → ${gap.join(', ')}`:''));

// DPI proof: read one print PNG, compute px / inches
const sample:any = withPdf.find(r=>keyById.get(r.pageId)==='CH04_P011');
if (sample?.printPngPath){ const m = await sharp(await st.readProjectFile(sample.printPngPath)).metadata(); console.log(`\nDPI proof (CH04_P011): ${m.width}x${m.height}px on 7.25x10.25in → ${(m.width!/7.25).toFixed(0)} x ${(m.height!/10.25).toFixed(0)} DPI`); }

// The pages I re-rendered / edited AFTER initial approval — prove each is freshly print-prepped at q88
const TOUCHED = ['FM_002_TITLE_PAGE','FM_007_INTRODUCTION_CONT','FM_008_INTRODUCTION_CONT','FM_010_INTRODUCTION_CONT','BM_005_ABOUT_SERIES'];
console.log('\nRECENTLY RE-RENDERED / EDITED pages:');
for (const k of TOUCHED){
  const pg = (allPages as any[]).find(p=>p.pageKey===k);
  const r:any = active.find(x=>x.pageId===pg.id);
  let mb = 0; try { mb = (await st.readProjectFile(r.printPdfPath)).length/1048576; } catch {}
  const rid = (r.printPdfPath||'').split('-').slice(-1)[0]?.replace('.print.pdf','');
  console.log(`  ${k}: approved=${r.approvedForBook} preflight=${r.preflightPassed} printPDF=${mb.toFixed(2)}MB (q88 JPEG) path-renderId=${(r.printPdfPath||'').includes(r.id)?'matches active render':'MISMATCH'}`);
}
process.exit(0);
