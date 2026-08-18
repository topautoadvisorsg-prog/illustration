/**
 * DIAGNOSTIC ONLY — where does the console's typeset-preview route hang?
 *
 * Observed three times: `GET /api/projects/:id/typeset-preview` never returns
 * AND the backend stops answering `/health`, i.e. the whole process stops
 * serving. The same book through `renderTypesetBook` in a standalone script
 * completes in ~90s. The route calls `buildTypesetInterior`, which wraps the
 * renderer and does more first. This measures which stage is responsible.
 *
 * MEASURES ONLY. Changes no behaviour, no configuration, no production, and
 * implements no fix. It re-walks the SAME calls `buildTypesetInterior` makes, in
 * the same order, timing each and bounding each so a hang yields evidence
 * instead of another ten-minute wait. It then runs the real
 * `buildTypesetInterior` once, bounded, for fidelity.
 *
 * The heartbeat is the point of the whole exercise: it separates
 *   "awaiting something that never resolves"  (loop alive, drift ~0)
 * from
 *   "blocking the Node process"               (ticks stop, drift climbs)
 * Those two have completely different causes and completely different fixes.
 *
 *   yarn tsx scripts/diag-typeset-hang.ts
 */
import { exec } from 'node:child_process';
import '../src/env.js';

const PROJECT_ID = '55d7bce0-2f71-4f02-8131-e6c750c8506e';
/** Per-stage ceiling. Generous: a healthy full render measured ~90s. */
const STAGE_TIMEOUT_MS = 180_000;
const HEARTBEAT_MS = 1_000;

// ── heartbeat ───────────────────────────────────────────────────────────────
let lastTick = Date.now();
let ticks = 0;
let maxDriftMs = 0;
let chromeSeen = 0;
let currentStage = '(none)';

const heartbeat = setInterval(() => {
  const now = Date.now();
  const drift = now - lastTick - HEARTBEAT_MS;
  lastTick = now;
  ticks++;
  if (drift > maxDriftMs) maxDriftMs = drift;
  // Every 5s: report, and sample Chromium asynchronously so the probe itself
  // cannot block the loop it is measuring (execSync here would corrupt the
  // very number we are trying to read).
  if (ticks % 5 === 0) {
    exec('tasklist /fi "imagename eq chrome.exe" /nh', (err, stdout) => {
      const n = err ? -1 : (stdout.match(/chrome\.exe/gi) ?? []).length;
      if (n > chromeSeen) chromeSeen = n;
      console.log(
        `    [hb ${String(ticks).padStart(4)}s] stage=${currentStage} drift=${drift}ms maxDrift=${maxDriftMs}ms chrome=${n}`,
      );
    });
  }
}, HEARTBEAT_MS);
heartbeat.unref();

// ── stage runner ────────────────────────────────────────────────────────────
interface StageResult { name: string; ms: number; ok: boolean; note: string }
const results: StageResult[] = [];
let lastEntered = '(none)';
let lastCompleted = '(none)';

async function stage<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  currentStage = name;
  lastEntered = name;
  const t0 = Date.now();
  console.log(`\n>>> ENTER  ${name}`);
  let timer: NodeJS.Timeout | undefined;
  try {
    const value = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`STAGE TIMEOUT after ${STAGE_TIMEOUT_MS}ms`)),
          STAGE_TIMEOUT_MS,
        );
      }),
    ]);
    const ms = Date.now() - t0;
    lastCompleted = name;
    results.push({ name, ms, ok: true, note: 'completed' });
    console.log(`<<< DONE   ${name}  ${ms}ms`);
    return value;
  } catch (err) {
    const ms = Date.now() - t0;
    const note = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    results.push({ name, ms, ok: false, note });
    console.log(`!!! FAIL   ${name}  ${ms}ms  ${note}`);
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
    currentStage = `after:${name}`;
  }
}

// ── 1. resolve project + storage configuration ──────────────────────────────
const { getProject } = await import('../src/db/repositories/projects.repo.js');

const project = await stage('1-getProject', async () => getProject(PROJECT_ID));
if (!project) {
  console.log('\nCannot continue: project not found or lookup failed.');
  process.exit(1);
}

const storageInfo = await stage('1b-resolve-storage-config', async () => {
  const mod = await import('../src/services/storage/project-storage.js');
  const { getEnv } = await import('../src/env.js');
  const env = getEnv() as Record<string, unknown>;
  const has = (k: string): boolean => Boolean(env[k]);
  const svc = mod.getProjectStorage();
  return {
    resolvedClass: svc.constructor.name,
    r2Configured: mod.isR2StorageConfigured?.() ?? 'n/a',
    supabaseConfigured: mod.isSupabaseStorageConfigured?.() ?? 'n/a',
    nodeEnv: String(env.NODE_ENV),
    r2Vars: { account: has('R2_ACCOUNT_ID'), key: has('R2_ACCESS_KEY_ID'), secret: has('R2_SECRET_ACCESS_KEY') },
    supabaseVars: { url: has('SUPABASE_URL'), serviceKey: has('SUPABASE_SERVICE_ROLE_KEY') },
    svc,
  };
});
if (storageInfo) {
  const { svc, ...printable } = storageInfo as Record<string, unknown> & { svc: unknown };
  console.log(`    storage: ${JSON.stringify(printable)}`);
}

// ── 2. readProjectFile — the prime suspect ──────────────────────────────────
const manuscriptPath = (project as { manuscriptPath?: string }).manuscriptPath;
console.log(`    manuscriptPath = ${manuscriptPath ?? '(none)'}`);

const markdown = await stage('2-readProjectFile', async () => {
  const svc = (storageInfo as { svc: { readProjectFile(p: string): Promise<Buffer> } }).svc;
  const buf = await svc.readProjectFile(manuscriptPath!);
  return buf.toString('utf8');
});
if (markdown) console.log(`    read ${markdown.length} chars`);

// ── 3-5. the real thing, bounded ────────────────────────────────────────────
// Stages 3 (illustration prep), 4 (renderTypesetBook) and 5 (pad to even) live
// inside buildTypesetInterior and are not separately callable without changing
// it — which is out of scope. So it runs once, bounded, and the heartbeat plus
// the Chromium sample say how far it got.
// Run TWICE in the same process. The route lives in a long-lived server that
// has already served other requests; a script that calls it once does not
// reproduce that. If the second call behaves differently, the fault is state
// carried between calls rather than anything about the book.
for (const pass of [1, 2]) {
  await stage(`3-5-buildTypesetInterior-pass${pass}`, async () => {
    const { buildTypesetInterior } = await import('../src/pipeline/typeset/build-typeset-interior.js');
    const { ProjectConfigSchema } = await import('@wildlands/shared');
    const config = ProjectConfigSchema.parse((project as { config: unknown }).config) as Record<string, unknown>;
    if (pass === 1) {
      console.log(`    productionProfileId=${String(config.productionProfileId)}`);
      console.log(`    typesetLayoutStandardId=${String(config.typesetLayoutStandardId)}`);
      console.log(`    illustrations=${Object.keys((config.illustrations as object) ?? {}).length}`);
      console.log(`    chaptersStartRecto=${String(config.typesetChaptersStartRecto)}`);
    }
    const r = await buildTypesetInterior(PROJECT_ID, config as never, {
      chaptersStartRecto: Boolean(config.typesetChaptersStartRecto),
      reviewGuides: false,
    });
    console.log(
      `    RESULT pass${pass}: ${r.pageCount} pages, pdf ${r.pdf.length} bytes, ` +
        `standard=${r.layoutStandardId}, sections=${r.report.sectionStarts.length}, ` +
        `blanks=${r.report.blankPages.length}, vOverflow=${r.report.verticalOverflowPages.length}, ` +
        `hOverflow=${r.report.horizontalOverflow.length}`,
    );
    return r.pageCount;
  });
}

// ── report ──────────────────────────────────────────────────────────────────
clearInterval(heartbeat);
console.log(`\n${'═'.repeat(74)}\nDIAGNOSTIC REPORT`);
console.log(`  last stage ENTERED   : ${lastEntered}`);
console.log(`  last stage COMPLETED : ${lastCompleted}`);
console.log(`  heartbeat ticks      : ${ticks} (expect ~1/s — if far short, the loop was BLOCKED)`);
console.log(`  max event-loop drift : ${maxDriftMs}ms`);
console.log(`  peak chrome.exe seen : ${chromeSeen}`);
console.log('  per-stage:');
for (const r of results) {
  console.log(`    ${r.ok ? 'OK  ' : 'FAIL'}  ${r.name.padEnd(28)} ${String(r.ms).padStart(7)}ms  ${r.note}`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
