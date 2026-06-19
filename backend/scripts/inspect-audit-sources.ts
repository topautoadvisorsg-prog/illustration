import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq, and } from 'drizzle-orm';
const db = getDb();
const P = process.argv[2]!;
const all = await db.select().from(pages).where(eq(pages.projectId, P));
// TOC source: CONTENTS readingFieldText
const toc = (all as any[]).find(p=>p.frontMatterType==='CONTENTS');
console.log('--- CONTENTS readingFieldText (TOC numbers) ---');
console.log((toc?.readingFieldText ?? '(none)').slice(0,600));
// chapter first-page planned numbers (truth for TOC)
const bodies = (all as any[]).filter(p=>p.section==='BODY').sort((a,b)=>a.plannedPageNumber-b.plannedPageNumber);
const firstOfChapter = new Map<number,any>();
for (const b of bodies) if(!firstOfChapter.has(b.chapterNumber)) firstOfChapter.set(b.chapterNumber,b);
console.log('--- chapter first-page planned numbers (truth) ---');
for (const [ch,p] of [...firstOfChapter.entries()].sort((a,b)=>a[0]-b[0])) console.log(`  ch${ch}: page ${p.plannedPageNumber} (${p.pageKey})`);
// one INDEX readingFieldText sample
const idx = (all as any[]).find(p=>p.frontMatterType==='INDEX');
console.log('--- INDEX[0] readingFieldText sample ---');
console.log((idx?.readingFieldText ?? '(none)').slice(0,400));
// badge context sample from a body render specJson
const oneBody = bodies.find(b=>b.carriesSubject) ?? bodies[0];
const r = (await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, oneBody.id))).find((x:any)=>x.active) as any;
console.log('--- sample body render badgeContext ---', oneBody.pageKey);
console.log(JSON.stringify((r?.specJson as any)?.badgeContext ?? '(none)'));
process.exit(0);
