/**
 * TYPECHECK GATE FOR `scripts/**` — a ratchet, not a cliff.
 *
 * WHY A RATCHET. `tsconfig.json` includes `src/**` and nothing else, so "tsc is
 * clean" has only ever meant the LIBRARY is clean. The 677 files under
 * `scripts/` run through `tsx`, which transpiles WITHOUT typechecking, so a type
 * error there reaches runtime with nothing in front of it. One script carried an
 * outright syntax error — a `'\\'` that escaped its own closing quote — long
 * enough that it could never once have run, and nothing noticed.
 *
 * Turning the whole surface on at once is not an option: it reports 467
 * pre-existing errors, 186 of them in throwaway `_scratch` tools. A gate that is
 * red on the day it lands is a gate people learn to ignore, which is worse than
 * no gate.
 *
 * So this records the errors that exist TODAY, per file, and fails only when a
 * file gets WORSE or a new file arrives with errors. Every script written from
 * now on is fully typechecked; the backlog is visible and can only shrink.
 *
 *   node scripts/typecheck-ratchet.mjs            check
 *   node scripts/typecheck-ratchet.mjs --update   re-record after fixing some
 *
 * Per FILE rather than per line, deliberately: line numbers churn on every edit
 * and a baseline that churns is a baseline nobody trusts.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BASELINE = path.join(HERE, 'typecheck-baseline.json');
const UPDATE = process.argv.includes('--update');

/**
 * Run tsc through NODE, not through the `.bin` shim.
 *
 * Node refuses to `execFileSync` a `.cmd` and fails EINVAL, and the first
 * version of this file caught that alongside tsc's ordinary non-zero exit and
 * recorded a baseline of ZERO errors from an empty string — a gate reporting
 * PASS while checking nothing, which is the exact failure it exists to prevent.
 */
const require = createRequire(import.meta.url);
const tscJs = require.resolve('typescript/bin/tsc');

let out = '';
let ran = false;
try {
  out = execFileSync(process.execPath, [tscJs, '--noEmit', '-p', 'tsconfig.scripts.json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  ran = true;
} catch (e) {
  // tsc exits non-zero when it reports errors, which is the normal case here.
  // A failure to LAUNCH is not: it has no stdout and must never look like clean.
  out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  ran = typeof e.status === 'number' && out.trim().length > 0;
  if (!ran) {
    console.error(`\nscripts typecheck: COULD NOT RUN tsc — ${e.message}`);
    process.exit(2);
  }
}
if (!ran) {
  console.error('\nscripts typecheck: COULD NOT RUN tsc.');
  process.exit(2);
}

/** `scripts/foo.ts(12,3): error TS1234: ...` -> counts keyed by file. */
const counts = {};
const srcErrors = [];
for (const line of out.split(/\r?\n/)) {
  const m = /^([^\s(]+)\((\d+),(\d+)\): error TS\d+:/.exec(line);
  if (!m) continue;
  const file = m[1].replace(/\\/g, '/');
  if (file.startsWith('src/')) {
    srcErrors.push(line);
    continue;
  }
  counts[file] = (counts[file] ?? 0) + 1;
}

// The config pulls in whatever src/ the scripts import, so a LIBRARY error can
// surface here. That is `typecheck`'s job to report, not this one's — but it
// must not be swallowed either.
if (srcErrors.length) {
  console.error(`\n  ${srcErrors.length} error(s) in src/ — run \`yarn typecheck\`; this gate covers scripts/ only.`);
  for (const l of srcErrors.slice(0, 5)) console.error(`    ${l}`);
  process.exit(1);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (UPDATE || !existsSync(BASELINE)) {
  writeFileSync(BASELINE, `${JSON.stringify({ total, files: counts }, null, 2)}\n`);
  console.log(`scripts typecheck: baseline recorded — ${total} pre-existing error(s) in ${Object.keys(counts).length} file(s)`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const worse = [];
const better = [];
for (const [file, n] of Object.entries(counts)) {
  const was = base.files[file] ?? 0;
  if (n > was) worse.push(`${file}: ${was} -> ${n}`);
}
for (const [file, was] of Object.entries(base.files)) {
  const n = counts[file] ?? 0;
  if (n < was) better.push(`${file}: ${was} -> ${n}`);
}

if (worse.length) {
  console.error(`\nscripts typecheck: FAILED — ${worse.length} file(s) got worse\n`);
  for (const w of worse) console.error(`  ${w}`);
  console.error(`\n  Fix them, or run \`node scripts/typecheck-ratchet.mjs --update\` only if the`);
  console.error(`  increase is deliberate and explained.\n`);
  process.exit(1);
}

console.log(
  `scripts typecheck: PASS — ${total} pre-existing error(s), baseline ${base.total}, nothing got worse`,
);
if (better.length) {
  console.log(`  ${better.length} file(s) improved — run --update to record it:`);
  for (const b of better.slice(0, 10)) console.log(`    ${b}`);
}
process.exit(0);
