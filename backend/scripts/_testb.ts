/* One-page orientation-fix TEST: re-render a Section-B page with the updated
 * prompt (new ORNAMENT PLACEMENT constraint) and dump the result so the operator
 * can confirm the top/bottom swags come out upright. Creates a NEW non-active
 * render version — the assembled book is untouched until we approve it. */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { createAndRunRender } from '../src/pipeline/whole-page-render/render-whole-page.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

const P = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';
const KEY = process.argv[2] ?? 'CH03_P012_c1';
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
if (!row) { console.log('page not found', KEY); process.exit(1); }
console.log('re-rendering', KEY, '(paid, one page) with the orientation-fixed prompt …');
const res = await createAndRunRender(row.id, {});
console.log('status:', res.status, '| version:', res.version, '| render:', res.renderId, '| img:', res.row.imagePath);
if (res.status !== 'RENDERED' || !res.row.imagePath) { console.log('render did not produce an image; status', res.status); process.exit(1); }
const img = await getProjectStorage().readProjectFile(res.row.imagePath);
writeFileSync('C:/Users/jovan/Downloads/_testB_full.png', await sharp(img).resize({ width: 760 }).png().toBuffer());
const m = await sharp(img).metadata();
const top = await sharp(img).extract({ left: 0, top: 0, width: m.width!, height: Math.round(m.height! * 0.16) }).resize({ width: 760 }).png().toBuffer();
const botTop = Math.round(m.height! * 0.84);
const bot = await sharp(img).extract({ left: 0, top: botTop, width: m.width!, height: m.height! - botTop }).resize({ width: 760 }).png().toBuffer();
writeFileSync('C:/Users/jovan/Downloads/_testB_top.png', top);
writeFileSync('C:/Users/jovan/Downloads/_testB_bottom.png', bot);
console.log('wrote _testB_full.png / _testB_top.png / _testB_bottom.png to Downloads');
process.exit(0);
