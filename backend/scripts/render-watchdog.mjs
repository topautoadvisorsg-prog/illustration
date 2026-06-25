/* External watchdog for the hero render run. Does NOT trust the render process to
 * behave: it owns the render as a child, watches how recently a new PNG appeared,
 * and if the render freezes (no new image in STALE seconds) it SIGKILLs and restarts
 * it. Render-once + skip-if-exists make restarts free (no re-spend). Exits when the
 * folder reaches TARGET pngs, or after MAX_RESTARTS (permafail guard).
 *   node scripts/render-watchdog.mjs
 */
import { spawn } from 'node:child_process';
import { readdirSync, statSync, openSync } from 'node:fs';

const BACKEND = 'C:/Users/jovan/Downloads/wildlands agents platform/backend';
const HEROES = 'C:/Users/jovan/Downloads/heroes';
const TARGET = 130;          // 5 approved + 125 this run
const STALE = 420;           // seconds with no new png => frozen => kill+restart
const MAX_RESTARTS = 50;     // guard against an infinite permafail loop
const TICK = 60_000;

let child = null;
let restarts = 0;

const pngs = () => readdirSync(HEROES).filter((f) => f.toLowerCase().endsWith('.png'));
const newestAgeSec = () => {
  const ms = pngs().map((f) => statSync(`${HEROES}/${f}`).mtimeMs);
  return ms.length ? (Date.now() - Math.max(...ms)) / 1000 : 0;
};

function start() {
  const fd = openSync(`${HEROES}/_render-live.log`, 'a');
  child = spawn(process.execPath, ['../node_modules/tsx/dist/cli.mjs', 'scripts/render-heroes.ts'], {
    cwd: BACKEND,
    stdio: ['ignore', fd, fd],
  });
  console.log(`[watchdog] ${new Date().toISOString()} started render pid=${child.pid} (start #${restarts}, count=${pngs().length})`);
  child.on('exit', (code) => {
    console.log(`[watchdog] ${new Date().toISOString()} render exited code=${code} (count=${pngs().length})`);
    child = null;
  });
}

console.log(`[watchdog] online. target=${TARGET}, current=${pngs().length}, stale=${STALE}s`);
if (pngs().length < TARGET) { restarts++; start(); }

const iv = setInterval(() => {
  const c = pngs().length;
  if (c >= TARGET) {
    console.log(`[watchdog] DONE — ${c}/${TARGET} pngs. stopping.`);
    if (child) child.kill('SIGKILL');
    clearInterval(iv);
    process.exit(0);
  }
  if (restarts >= MAX_RESTARTS) {
    console.log(`[watchdog] hit MAX_RESTARTS=${MAX_RESTARTS} at ${c}/${TARGET} — likely a permafailing image. stopping for review.`);
    if (child) child.kill('SIGKILL');
    clearInterval(iv);
    process.exit(1);
  }
  if (!child) { restarts++; start(); return; }
  const age = newestAgeSec();
  if (age > STALE) {
    console.log(`[watchdog] ${new Date().toISOString()} STALL: no new png in ${age | 0}s (count=${c}) — killing render pid=${child.pid}; will restart next tick.`);
    child.kill('SIGKILL');
    child = null;
  }
}, TICK);
