/* LOCAL print-prep — runs printPrepRender() in-process with the CURRENT branch
 * code (the deployed backend runs main and lacks the badge-gate fix). Re-stamps
 * every active+approved render so the folio centres inside the trim (badges gated
 * off via WL_ENABLE_BADGES, which we leave UNSET). Image work only, no AI spend.
 * Usage: [CONC=n] printprep-local.ts */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { printPrepRender } from '../src/pipeline/print-prep/print-prep.js';
import { P } from './_project.js';

const CONC = Number(process.env.CONC ?? 4);
const ONLY = process.argv[2]; // optional single pageKey for a smoke test
const db = getDb();
const allPages = (await db.select().from(pages).where(eq(pages.projectId, P))).filter((p) => !ONLY || p.pageKey === ONLY);
const ids: string[] = [];
for (const p of allPages) {
  const r = (await db.select().from(wholePageRenders)
    .where(and(eq(wholePageRenders.pageId, p.id), eq(wholePageRenders.active, true), eq(wholePageRenders.approvedForBook, true))))[0];
  if (r) ids.push(r.id);
}
console.log(`re-prepping ${ids.length} renders LOCALLY (badges gated off → folio centres). CONC=${CONC}`);
if (process.env.WL_ENABLE_BADGES) { console.error('WL_ENABLE_BADGES is set — unset it so badges stay off'); process.exit(2); }

let done = 0, ok = 0, fail = 0, pfFail = 0;
const start = Date.now();
const failures: string[] = [];
async function worker(q: string[]) {
  while (q.length) {
    const id = q.shift();
    if (!id) break;
    try {
      const res = await printPrepRender(id);
      ok++;
      if (!res.preflight.passed) { pfFail++; failures.push(`${id}: preflight FAILED`); }
    } catch (e) { fail++; failures.push(`${id}: ${e instanceof Error ? e.message : String(e)}`); }
    done++;
    if (done % 20 === 0 || done === ids.length) {
      console.log(`  [${done}/${ids.length}] ok=${ok} fail=${fail} pfFail=${pfFail} (${(done / ((Date.now() - start) / 1000)).toFixed(2)}/s)`);
    }
  }
}
const q = [...ids];
await Promise.all(Array.from({ length: CONC }, () => worker(q)));
console.log(`DONE — ok=${ok}, fail=${fail}, preflightFail=${pfFail}, elapsed=${((Date.now() - start) / 1000).toFixed(0)}s`);
if (failures.length) { console.log('issues:'); for (const f of failures.slice(0, 40)) console.log('  -', f); }
process.exit(fail ? 1 : 0);
