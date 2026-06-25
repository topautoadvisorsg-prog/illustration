/* Driver: render every hero, ONE child process per image, with a hard kill-timeout.
 * A single bad image (e.g. one that hangs the OpenAI call) gets SIGKILLed at
 * PER_IMAGE_MS and recorded as a failure — it can NEVER wedge the whole run.
 * Already-rendered PNGs are skipped (no re-spend). Prints a final report.
 *   node ../node_modules/tsx/dist/cli.mjs scripts/render-driver.ts
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HEROES } from './heroes-data.js';

const BACKEND = 'C:/Users/jovan/Downloads/wildlands agents platform/backend';
const OUT = 'C:/Users/jovan/Downloads/heroes';
const PER_IMAGE_MS = 300_000; // 5 min hard cap per image (normal render ≤ ~240s)

function runOne(id: string): Promise<{ status: 'ok' | 'timeout' | 'error'; line: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['../node_modules/tsx/dist/cli.mjs', 'scripts/render-one.ts', id], {
      cwd: BACKEND,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({ status: 'timeout', line: 'killed at 300s' });
    }, PER_IMAGE_MS);
    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const last = out.trim().split('\n').pop() ?? '';
      resolve({ status: code === 0 ? 'ok' : 'error', line: last });
    });
  });
}

const ok: string[] = [];
const skipped: string[] = [];
const failed: string[] = [];

console.log(`\n=== Driver: ${HEROES.length} heroes, ${PER_IMAGE_MS / 1000}s hard cap each → ${OUT} ===\n`);
for (const h of HEROES) {
  const fname = `hero_${h.id.padStart(3, '0')}_${h.slug}.png`;
  if (existsSync(join(OUT, fname))) { skipped.push(h.id); console.log(`#${h.id} ${h.slug} — exists, skip`); continue; }
  process.stdout.write(`#${h.id} ${h.slug} [${h.o}] … `);
  const r = await runOne(h.id);
  if (r.status === 'ok') { ok.push(h.id); console.log(r.line || 'OK'); }
  else { failed.push(`${h.id} ${h.slug} — ${r.status}: ${r.line}`); console.log(`FAILED (${r.status})`); }
}

console.log('\n=================== RENDER REPORT ===================');
console.log(`rendered OK : ${ok.length}  [${ok.join(', ')}]`);
console.log(`skipped(had): ${skipped.length}`);
console.log(`FAILED      : ${failed.length}`);
for (const f of failed) console.log(`   - ${f}`);
console.log('====================================================');
writeFileSync(join(OUT, '_render-report.txt'),
  `OK ${ok.length}: ${ok.join(', ')}\nSKIPPED ${skipped.length}: ${skipped.join(', ')}\nFAILED ${failed.length}:\n${failed.map((f) => '  - ' + f).join('\n')}\n`);
process.exit(0);
