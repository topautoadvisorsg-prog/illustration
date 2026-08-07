/**
 * Batch AI text-review — runs the existing /ai-review endpoint (cheap vision
 * chat-completion, NOT gpt-image-2) against every page's latest render in a
 * project, ONE AT A TIME, so the operator doesn't have to click "AI review
 * text" individually on every page in the console.
 *
 * Sequential by design (render-once discipline: single attempt per page,
 * report results, never silent bulk anything) — also keeps API spend paced
 * rather than firing 200+ vision calls in parallel.
 *
 * Usage:
 *   tsx scripts/batch-ai-review.ts <projectId> [pageKeyContains]
 *
 * Examples:
 *   tsx scripts/batch-ai-review.ts 8c1e161a-...                # every page
 *   tsx scripts/batch-ai-review.ts 8c1e161a-... GLOSSARY        # just glossary pages
 *   tsx scripts/batch-ai-review.ts 8c1e161a-... FM_002,BM_001   # comma list of pageKey substrings
 *
 * Requires CONSOLE_PASSWORD in the repo-root .env (same auth the console uses).
 * Hits the deployed backend, not local code, so results reflect what's
 * actually live in production.
 */
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { and, eq, sql } from 'drizzle-orm';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Durable results file, so a run survives a lost terminal or a piped stdout. */
const REPORT_PATH = path.join(__dirname, '..', '..', 'ai-review-report.json');

function loadConsolePassword(): string {
  const envPath = path.join(__dirname, '..', '..', '.env');
  const raw = readFileSync(envPath, 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith('CONSOLE_PASSWORD='));
  if (!line) throw new Error('CONSOLE_PASSWORD not found in repo-root .env');
  return line.slice('CONSOLE_PASSWORD='.length).trim().replace(/^"|"$/g, '');
}

const BACKEND = process.env.WL_BACKEND ?? 'https://wildlandsbackend-production.up.railway.app';

interface TargetRender {
  pageKey: string;
  renderId: string;
}

async function findLatestRenders(projectId: string, filters: string[]): Promise<TargetRender[]> {
  const db = getDb();
  // Latest (highest version) RENDERED/APPROVED render per page.
  const rows = await db
    .select({
      pageKey: pages.pageKey,
      renderId: wholePageRenders.id,
      version: wholePageRenders.version,
      status: wholePageRenders.status,
    })
    .from(pages)
    .innerJoin(wholePageRenders, eq(wholePageRenders.pageId, pages.id))
    .where(and(eq(pages.projectId, projectId), sql`${wholePageRenders.status} IN ('RENDERED', 'APPROVED')`))
    .orderBy(pages.pageKey, sql`${wholePageRenders.version} DESC`);

  const latestByPage = new Map<string, TargetRender>();
  for (const r of rows) {
    if (!latestByPage.has(r.pageKey)) latestByPage.set(r.pageKey, { pageKey: r.pageKey, renderId: r.renderId });
  }

  let targets = Array.from(latestByPage.values());
  if (filters.length > 0) {
    targets = targets.filter((t) => filters.some((f) => t.pageKey.includes(f)));
  }
  targets.sort((a, b) => a.pageKey.localeCompare(b.pageKey));
  return targets;
}

async function reviewOne(pw: string, renderId: string): Promise<{ pass: boolean; issues: string[]; note?: string; error?: string }> {
  try {
    const res = await fetch(`${BACKEND}/api/whole-page-render/${renderId}/ai-review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await res.json();
    if (!res.ok) return { pass: false, issues: [], error: `HTTP ${res.status}: ${body.message ?? JSON.stringify(body)}` };
    return body;
  } catch (err) {
    return { pass: false, issues: [], error: (err as Error).message };
  }
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error('usage: tsx scripts/batch-ai-review.ts <projectId> [pageKeyContains,comma,list]');
    process.exit(2);
  }
  const argv = process.argv.slice(3);
  const onlyErrors = argv.includes('--only-errors');
  const filters = (argv.find((a) => !a.startsWith('--')) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const pw = loadConsolePassword();

  let targets = await findLatestRenders(projectId, filters);

  // Resume mode: retry ONLY the pages that errored last run. An errored page
  // was never checked — it is not a pass — so retrying just those, rather than
  // re-reviewing the whole book, keeps a transient outage from costing a
  // second full sweep.
  if (onlyErrors) {
    if (!existsSync(REPORT_PATH)) {
      console.error(`--only-errors: no previous report at ${REPORT_PATH}. Run a full sweep first.`);
      process.exit(2);
    }
    const prev = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as {
      records?: Array<{ pageKey: string; outcome: string }>;
    };
    const errorKeys = new Set((prev.records ?? []).filter((r) => r.outcome === 'error').map((r) => r.pageKey));
    if (errorKeys.size === 0) {
      console.log('--only-errors: previous run had no errored pages. Nothing to retry.');
      process.exit(0);
    }
    targets = targets.filter((t) => errorKeys.has(t.pageKey));
    console.log(`--only-errors: retrying ${targets.length} page(s) that errored in the previous run.`);
  }
  console.log(`Reviewing ${targets.length} page(s)${filters.length ? ` matching [${filters.join(', ')}]` : ''}, one at a time...\n`);

  let passed = 0;
  let failed = 0;
  let errored = 0;
  const failures: { pageKey: string; issues: string[] }[] = [];
  // Durable per-page record. An earlier full sweep was effectively lost: its
  // output was piped through `tail`, and 143 pages had errored transiently
  // against a backend still recovering from a database outage — leaving no way
  // to distinguish pages that were genuinely clean from pages never actually
  // checked. Every run now writes its results to disk so it can be audited,
  // resumed with --only-errors, and turned into a publication QA report.
  type Outcome = 'pass' | 'fail' | 'error';
  const records: Array<{ pageKey: string; renderId: string; outcome: Outcome; issues: string[]; error?: string }> = [];

  for (const t of targets) {
    process.stdout.write(`  ${t.pageKey} ... `);
    const result = await reviewOne(pw, t.renderId);
    if (result.error) {
      errored++;
      records.push({ pageKey: t.pageKey, renderId: t.renderId, outcome: 'error', issues: [], error: result.error });
      console.log(`ERROR: ${result.error}`);
      continue;
    }
    if (result.pass) {
      passed++;
      records.push({ pageKey: t.pageKey, renderId: t.renderId, outcome: 'pass', issues: [] });
      console.log('PASS' + (result.note ? ` (${result.note})` : ''));
    } else {
      failed++;
      records.push({ pageKey: t.pageKey, renderId: t.renderId, outcome: 'fail', issues: result.issues });
      console.log(`FAIL — ${result.issues.length} issue(s)`);
      for (const issue of result.issues) console.log(`      - ${issue}`);
      failures.push({ pageKey: t.pageKey, issues: result.issues });
    }
  }

  // Merge into any existing report rather than replacing it. A partial run
  // (a filter, or --only-errors) must not erase results for pages it did not
  // touch — otherwise resuming a failed sweep would silently discard the
  // pages that already passed.
  const merged = new Map<string, (typeof records)[number]>();
  if (existsSync(REPORT_PATH)) {
    try {
      const prev = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as { projectId?: string; records?: typeof records };
      if (prev.projectId === projectId) for (const r of prev.records ?? []) merged.set(r.pageKey, r);
    } catch {
      // Unreadable previous report is not fatal; this run's results still land.
    }
  }
  for (const r of records) merged.set(r.pageKey, r);
  const allRecords = Array.from(merged.values()).sort((a, b) => a.pageKey.localeCompare(b.pageKey));
  const cumulative = {
    total: allRecords.length,
    passed: allRecords.filter((r) => r.outcome === 'pass').length,
    failed: allRecords.filter((r) => r.outcome === 'fail').length,
    errored: allRecords.filter((r) => r.outcome === 'error').length,
  };

  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        projectId,
        ranAt: new Date().toISOString(),
        backend: BACKEND,
        lastRun: { filters, onlyErrors, total: targets.length, passed, failed, errored },
        cumulative,
        records: allRecords,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`\n${passed} passed, ${failed} failed, ${errored} errored, ${targets.length} total.`);
  if (failures.length > 0) {
    console.log('\nPages needing a look:');
    for (const f of failures) {
      console.log(`  - ${f.pageKey}: ${f.issues.length} issue(s)`);
      for (const issue of f.issues) console.log(`      · ${issue}`);
    }
  }
  if (errored > 0) {
    console.log(`\n${errored} page(s) ERRORED and were NOT checked. These are not passes.`);
    console.log('  Re-run with --only-errors to retry just those against a healthy backend.');
  }
  console.log(`\nReport written to ${REPORT_PATH}`);
  process.exit(failed > 0 || errored > 0 ? 1 : 0);
}

main();
