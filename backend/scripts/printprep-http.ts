/* Server-side batch print-prep: trigger the deployed backend's per-render
 * /print-prep endpoint for every active, approved page that lacks a print PDF.
 * Heavy 300-DPI work runs in-datacenter; this client only fires HTTP triggers
 * with small concurrency. No AI spend.
 *
 * Auth: reads CONSOLE_PASSWORD from the environment (injected by `railway run`);
 * never hardcoded. Run: railway run --service "@wildlands/backend" -- node
 *   ../node_modules/tsx/dist/cli.mjs scripts/printprep-http.ts <projectId> [conc]
 */
import '../src/env.js'; // load <repo-root>/.env so CONSOLE_PASSWORD is available (no railway CLI)
const BASE = process.env.WL_BACKEND ?? 'https://wildlandsbackend-production.up.railway.app';
const PW = (process.env.CONSOLE_PASSWORD ?? '').trim();
if (!PW) { console.error('CONSOLE_PASSWORD not in env — run via `railway run` so it is injected.'); process.exit(2); }
const PROJECT = process.argv[2]!;
const CONCURRENCY = Number(process.argv[3] ?? 3);
const FORCE = process.argv.includes('force'); // re-prep even pages already prepped
const ONLY = process.argv.find((a) => a.startsWith('only='))?.slice(5); // renderId(s), comma-separated
const H = { Authorization: `Bearer ${PW}`, 'Content-Type': 'application/json' };

const sum = await (await fetch(`${BASE}/api/whole-page-render/project/${PROJECT}`, { headers: H })).json();
let todo = (sum.renders as any[]).filter((r) => r.active && r.approvedForBook && (FORCE || !r.printPdfPath));
if (ONLY) { const set = new Set(ONLY.split(',')); todo = todo.filter((r) => set.has(r.id)); }
console.log(`active=${(sum.renders as any[]).filter((r: any) => r.active).length} | needing print-prep=${todo.length} | concurrency=${CONCURRENCY}`);

let done = 0, ok = 0, failed = 0, preflightFail = 0;
const failures: string[] = [];
const start = Date.now();

async function worker(queue: any[]) {
  while (queue.length) {
    const r = queue.shift();
    if (!r) break;
    try {
      const res = await fetch(`${BASE}/api/whole-page-render/${r.id}/print-prep`, { method: 'POST', headers: H, body: '{}' });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok) { failed++; failures.push(`${r.id}: HTTP ${res.status} ${JSON.stringify(j).slice(0, 120)}`); }
      else { ok++; if (j.render && j.render.preflightPassed === false) { preflightFail++; failures.push(`${r.id}: preflight FAILED`); } }
    } catch (e) { failed++; failures.push(`${r.id}: ${e instanceof Error ? e.message : String(e)}`); }
    done++;
    if (done % 20 === 0 || done === todo.length) {
      const rate = done / ((Date.now() - start) / 1000);
      console.log(`  [${done}/${todo.length}] ok=${ok} failed=${failed} preflightFail=${preflightFail} (${rate.toFixed(2)}/s)`);
    }
  }
}
const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
console.log('');
console.log(`DONE — print-prepped ok=${ok}, failed=${failed}, preflightFail=${preflightFail}, elapsed=${((Date.now() - start) / 1000).toFixed(0)}s`);
if (failures.length) { console.log('issues:'); for (const f of failures.slice(0, 40)) console.log('  -', f); }
process.exit(failed ? 1 : 0);
