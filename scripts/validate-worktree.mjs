#!/usr/bin/env node
/**
 * VALIDATE THIS CHECKOUT — and prove it validated THIS checkout.
 *
 * The trap this exists to close: `node_modules/@wildlands/shared` and
 * `@wildlands/backend` are junctions created by the yarn workspace install in
 * whichever checkout ran it. A git worktree that borrows that `node_modules`
 * therefore typechecks and tests against the OTHER checkout's `shared` — so a
 * change to `shared/src` appears to do nothing, and a merge that adds a field to
 * it appears to fail. Both happened during Phase 0B.
 *
 * A validation run that cannot say which files it validated is not a validation
 * run. So the first thing this does is RESOLVE `@wildlands/shared` the way Node
 * will at runtime, print the absolute path, and refuse to continue if that path
 * is outside this checkout.
 *
 * It also builds this checkout's `shared` itself rather than trusting that
 * someone built it somewhere — a stale `dist` is the same failure wearing a
 * different hat.
 *
 *   node scripts/validate-worktree.mjs            # everything
 *   node scripts/validate-worktree.mjs --no-tests # static checks only
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = path.join(ROOT, 'backend');
const SHARED = path.join(ROOT, 'shared');
const SKIP_TESTS = process.argv.includes('--no-tests');

let failures = 0;
const pass = (label, detail = '') => console.log(`  PASS  ${label}${detail ? '  ' + detail : ''}`);
const fail = (label, detail = '') => { console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`); failures += 1; };
const head = (n) => console.log(`\n${n}\n${'-'.repeat(n.length)}`);

const bin = (name) => {
  const exe = process.platform === 'win32' ? `${name}.cmd` : name;
  for (const dir of [path.join(ROOT, 'node_modules', '.bin'), path.join(BACKEND, 'node_modules', '.bin')]) {
    const p = path.join(dir, exe);
    if (existsSync(p)) return p;
  }
  throw new Error(`cannot find ${name} in any .bin`);
};
/**
 * shell:true on Windows — a .cmd shim cannot be spawned directly (EINVAL), and
 * the path is quoted because every checkout here has a space in it.
 */
const WIN = process.platform === 'win32';
const run = (cmd, args, cwd) =>
  execFileSync(WIN ? `"${cmd}"` : cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 1 << 28,
    shell: WIN,
  });

console.log(`Validating: ${ROOT}`);

// ── 0. Build this checkout's shared, so resolution cannot land on a stale dist ──
head('0. Build shared (this checkout)');
try {
  run(bin('tsc'), ['-p', 'tsconfig.json'], SHARED);
  pass('shared built', path.join(SHARED, 'dist'));
} catch (e) {
  fail('shared build', String(e.stdout || e.message).slice(0, 400));
}

// ── 1. THE PROOF ──────────────────────────────────────────────────────────────
head('1. Module-resolution isolation — PROOF');
let resolvedShared = '';

/**
 * Node's own lookup: walk node_modules upward from `fromDir` until the package
 * directory appears. Written out rather than delegating to createRequire.resolve
 * because `@wildlands/shared` is ESM-only — its exports map declares "types" and
 * "import" and no "require" condition, so the CJS resolver refuses it. The
 * question being asked here is *which package directory wins*, and this answers
 * exactly that.
 */
const resolvePackageDir = (name, fromDir) => {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'));
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
};

try {
  const pkgDir = resolvePackageDir('@wildlands/shared', BACKEND);
  if (!pkgDir) throw new Error('package directory not found walking up from backend/');
  const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const entry = pkg.exports?.['.']?.import ?? pkg.module ?? pkg.main;
  resolvedShared = path.resolve(pkgDir, entry);
  /**
   * REAL PATH, NOT THE APPARENT ONE.
   *
   * `node_modules/@wildlands/shared` inside a worktree is usually a JUNCTION
   * into another checkout. Its apparent path is therefore inside this worktree
   * while its contents are somebody else's — a path-only check passes and
   * validates the wrong tree. Verified: with the local override removed, the
   * apparent path stayed inside this worktree and only the content check below
   * caught it.
   */
  const realPkgDir = realpathSync(pkgDir);
  console.log(`  package dir (apparent)   -> ${pkgDir}`);
  console.log(`  package dir (real)       -> ${realPkgDir}`);
  if (realPkgDir.toLowerCase() !== pkgDir.toLowerCase()) {
    console.log('  note: that path is a link — the REAL path is what is checked');
  }
  console.log(`  resolved @wildlands/shared -> ${resolvedShared}`);
  const real = realpathSync(resolvedShared);
  if (real.toLowerCase().startsWith(ROOT.toLowerCase() + path.sep)) {
    pass('@wildlands/shared resolves INSIDE this checkout');
  } else {
    fail('@wildlands/shared resolves OUTSIDE this checkout', `-> ${real}`);
    console.log('        This run would have validated another checkout. See README, "Working in a git worktree".');
  }
} catch (e) {
  fail('@wildlands/shared could not be resolved', String(e.message).slice(0, 200));
}

// Runtime proof: load the resolved module and confirm it is the built artifact of THIS source.
try {
  const srcHasField = readFileSync(path.join(SHARED, 'src', 'index.ts'), 'utf8').includes('pageOffset');
  const mod = await import(pathToFileURL(resolvedShared).href);
  const dtsHasField = readFileSync(resolvedShared.replace(/\.js$/, '.d.ts'), 'utf8').includes('pageOffset');
  const symbols = Object.keys(mod).length;
  console.log(`  loaded module exports ${symbols} symbols`);
  if (srcHasField === dtsHasField) {
    pass('resolved build matches this checkout\'s source', `(pageOffset present in both: ${srcHasField})`);
  } else {
    fail('resolved build does NOT match this checkout\'s source', `src:${srcHasField} dist:${dtsHasField}`);
  }
} catch (e) {
  fail('runtime load of @wildlands/shared', String(e.message).slice(0, 200));
}

// ── 2. Typecheck ──────────────────────────────────────────────────────────────
head('2. Typecheck');
for (const [label, cwd] of [['shared', SHARED], ['backend', BACKEND]]) {
  try { run(bin('tsc'), ['--noEmit', '-p', 'tsconfig.json'], cwd); pass(`${label} typecheck`); }
  catch (e) { fail(`${label} typecheck`, '\n' + String(e.stdout || e.message).split('\n').slice(0, 8).join('\n')); }
}

// ── 3. Package targets ────────────────────────────────────────────────────────
head('3. Package targets point at real files');
{
  let dead = 0;
  for (const [file, base] of [[path.join(ROOT, 'package.json'), ROOT], [path.join(BACKEND, 'package.json'), BACKEND]]) {
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
      for (const m of String(cmd).matchAll(/(?:tsx|node)\s+([A-Za-z0-9_./-]+\.(?:ts|mjs|js))/g)) {
        if (m[1].startsWith('dist/')) continue; // build output
        if (!existsSync(path.join(base, m[1]))) { fail(`${path.basename(file)} :: ${name}`, `-> ${m[1]}`); dead += 1; }
      }
    }
  }
  if (!dead) pass('no target references a missing source file');
}

// ── 4. Import resolution + production boundary ────────────────────────────────
head('4. Import resolution and the src -> scripts boundary');
{
  const tracked = run('git', ['ls-files', 'backend/src', 'backend/scripts', 'shared/src'], ROOT)
    .trim().split('\n').filter((f) => /\.(ts|mjs|js)$/.test(f));
  const set = new Set(tracked);
  let unresolved = 0, violations = 0;
  for (const f of tracked) {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    const dir = path.posix.dirname(f);
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const t = path.posix.normalize(path.posix.join(dir, spec));
      const hit = [t, t.replace(/\.js$/, '.ts'), `${t}.ts`, `${t}/index.ts`].find((c) => set.has(c));
      if (!hit) { unresolved += 1; continue; }
      if (f.startsWith('backend/src/') && hit.startsWith('backend/scripts/')) {
        fail('BOUNDARY VIOLATION', `${f} -> ${spec}`); violations += 1;
      }
    }
  }
  if (!violations) pass('backend/src imports nothing from backend/scripts');
  console.log(`  (${tracked.length} files scanned; ${unresolved} relative specifiers pointed outside the tracked set)`);
}

// ── 5. Documentation links ────────────────────────────────────────────────────
head('5. Documentation links');
{
  const docs = ['README.md', ...readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];
  let bad = 0, ok = 0;
  for (const f of docs) {
    const dir = path.dirname(path.join(ROOT, f));
    for (const m of readFileSync(path.join(ROOT, f), 'utf8').matchAll(/\]\(([^)#]+\.md|[^)#]*\/)\)/g)) {
      if (/^https?:/.test(m[1])) continue;
      if (existsSync(path.normalize(path.join(dir, m[1])))) ok += 1;
      else { fail('broken link', `${f} -> ${m[1]}`); bad += 1; }
    }
  }
  if (!bad) pass('all relative documentation links resolve', `(${ok} checked)`);
}

// ── 6. Tests ──────────────────────────────────────────────────────────────────
if (!SKIP_TESTS) {
  head('6. Test suite');
  let out = '';
  try { out = run(bin('vitest'), ['run', '--reporter=basic'], BACKEND); }
  catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
  const clean = out.replace(/\x1b\[[0-9;]*m/g, '');
  const line = clean.split('\n').find((l) => /^\s*Tests\s+/.test(l)) || '(no summary line)';
  const failed = [...clean.matchAll(/^ FAIL\s+(.+)$/gm)].map((m) => m[1].trim());
  console.log(`  ${line.trim()}`);
  /**
   * THE BASELINE IS EMPTY, AND IT MUST STAY THAT WAY.
   *
   * Four tests used to live here. Two read a commercial manuscript from an
   * absolute path outside the repository; two read a tracked fixture whose
   * checked-out line endings differed between working trees at the SAME commit,
   * so the same code passed in one and failed in the other.
   *
   * Both causes are fixed rather than tolerated. Newlines are normalised once,
   * at the boundary where text becomes a manuscript. The commercial-manuscript
   * cases moved to `*.operator.test.ts`, excluded from the default run, and
   * their portable equivalents assert against the repository-owned fixture book.
   *
   * An allow-list is a debt that hides regressions: it permits the named tests to
   * fail for ANY reason, including a real one. Do not add a name here to make a
   * run green. Fix the test, or move it out of the portable gate and say why.
   */
  const KNOWN = [];
  const unexpected = failed.filter((f) => !KNOWN.some((k) => f.includes(k)));
  for (const f of failed) console.log(`    ${KNOWN.some((k) => f.includes(k)) ? 'known ' : 'NEW   '} ${f.slice(0, 110)}`);
  if (unexpected.length === 0)
    pass(KNOWN.length === 0 ? 'test suite is green with no allow-listed failures' : `no failures beyond the ${KNOWN.length} allow-listed tests`);
  else fail(`${unexpected.length} failure(s) beyond baseline`);
} else {
  head('6. Test suite');
  console.log('  skipped (--no-tests)');
}

head('RESULT');
console.log(failures === 0 ? '  VALIDATION PASSED' : `  VALIDATION FAILED — ${failures} check(s)`);
console.log(`  validated: ${ROOT}`);
console.log(`  @wildlands/shared: ${resolvedShared || '(unresolved)'}`);
process.exit(failures === 0 ? 0 : 1);
