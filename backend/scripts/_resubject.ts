/* Override the illustration SUBJECT for ONE page and render it (subject switch,
 * SAME layout). Uses the page's existing layout/blueprint; only the illustration
 * DNA subject changes. Render-once; activates the new version. Preflight-gated.
 * Usage: _resubject.ts <pageKey> "<new primary subject>" */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { prepareRender, executeRender } from '../src/pipeline/whole-page-render/render-whole-page.js';
import { assemblePagePrompt } from '../src/pipeline/whole-page-render/assemble-page-prompt.js';
import { createRenderRow } from '../src/db/repositories/whole-page-render.repo.js';
import { WILDLANDS_STANDARD } from '../src/pipeline/publishing-standard/index.js';
import { preflight } from './_preflight.js';
import { P } from './_project.js';

const KEY = process.argv[2]!;
const NEW = process.argv[3];
if (!KEY || !NEW) { console.error('Usage: _resubject.ts <pageKey> "<new primary subject>"'); process.exit(1); }
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
if (!row) { console.error('no page', KEY); process.exit(1); }

const pf = await preflight();
for (const l of pf.lines) console.log('  ' + l);
if (!pf.ok) { console.error('ABORT: preflight failed (no spend)'); process.exit(1); }

const prepared = await prepareRender(row.id);
const subj = (prepared.spec as any).illustrationDNA.subject;
console.log('OLD subject:', subj.primary);
subj.primary = NEW;
let assembledPrompt = assemblePagePrompt(prepared.spec);
// The CONTINUATION STUDY directive orders "depict the SAME subject, only change the
// angle" — that fights a DELIBERATELY overridden subject (e.g. pups). Drop it so the
// new subject is the unopposed instruction.
assembledPrompt = assembledPrompt.split('\n').filter((l) => !l.startsWith('CONTINUATION STUDY')).join('\n');
const created = await createRenderRow({ pageId: row.id, projectId: prepared.projectId, specJson: prepared.spec, assembledPrompt, standardVersion: WILDLANDS_STANDARD.version });
const rendered = await executeRender(created.renderId, {});
if (rendered.status !== 'RENDERED' || !rendered.imagePath) { console.log('FAILED', rendered.status); process.exit(1); }
await db.update(wholePageRenders).set({ active: false }).where(eq(wholePageRenders.pageId, row.id));
await db.update(wholePageRenders).set({ active: true }).where(eq(wholePageRenders.id, created.renderId));
console.log('rendered', KEY, 'v' + created.version, '— NEW subject active');
process.exit(0);
