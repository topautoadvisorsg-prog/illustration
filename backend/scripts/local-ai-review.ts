/**
 * AI text review, run LOCALLY — same check as the /ai-review endpoint, but
 * without routing 269 sequential requests through the deployed backend.
 *
 * WHY THIS EXISTS
 * batch-ai-review.ts drives the Railway endpoint. Each call makes that
 * container download a ~3MB page render from R2 and hold it in memory while
 * an OpenAI vision call completes. Two full sweeps were attempted; both
 * killed the container mid-run. The second reviewed 62 pages, then failed
 * with `fetch failed` on all 211 remaining pages and never recovered until
 * Railway restarted it. A publication QA gate must not take production down,
 * and production must not be the reason the gate can't finish.
 *
 * This does the identical work in-process: read the render from R2, derive the
 * expected text from the stored spec, compare with the vision model. Same
 * cost, same result, no container to exhaust.
 *
 * Usage:
 *   tsx scripts/local-ai-review.ts <projectId> [pageKeyContains,comma,list]
 *   tsx scripts/local-ai-review.ts <projectId> --only-errors
 *   tsx scripts/local-ai-review.ts <projectId> --only-unchecked
 *
 * Results merge into ai-review-report.json, so a run can always be resumed.
 */
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { and, eq, sql } from 'drizzle-orm';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { reviewRenderedText } from '../src/services/openai/text-review.js';
import { deriveReviewSourceText } from '../src/pipeline/whole-page-render/review-source-text.js';
import type { WholePageSpec } from '../src/pipeline/whole-page-render/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, '..', '..', 'ai-review-report.json');

type Outcome = 'pass' | 'fail' | 'error';
interface Record_ {
  pageKey: string;
  renderId: string;
  outcome: Outcome;
  issues: string[];
  error?: string;
}

interface Target {
  pageKey: string;
  renderId: string;
}

async function findLatestRenders(projectId: string, filters: string[]): Promise<Target[]> {
  const db = getDb();
  const rows = await db
    .select({ pageKey: pages.pageKey, renderId: wholePageRenders.id, version: wholePageRenders.version })
    .from(pages)
    .innerJoin(wholePageRenders, eq(wholePageRenders.pageId, pages.id))
    .where(and(eq(pages.projectId, projectId), sql`${wholePageRenders.status} IN ('RENDERED', 'APPROVED')`))
    .orderBy(pages.pageKey, sql`${wholePageRenders.version} DESC`);

  const latest = new Map<string, Target>();
  for (const r of rows) if (!latest.has(r.pageKey)) latest.set(r.pageKey, { pageKey: r.pageKey, renderId: r.renderId });

  let targets = Array.from(latest.values());
  if (filters.length) targets = targets.filter((t) => filters.some((f) => t.pageKey.includes(f)));
  return targets.sort((a, b) => a.pageKey.localeCompare(b.pageKey));
}

function loadPrevious(projectId: string): Map<string, Record_> {
  const map = new Map<string, Record_>();
  if (!existsSync(REPORT_PATH)) return map;
  try {
    const prev = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as { projectId?: string; records?: Record_[] };
    if (prev.projectId === projectId) for (const r of prev.records ?? []) map.set(r.pageKey, r);
  } catch {
    /* unreadable previous report is not fatal */
  }
  return map;
}

/** Running token totals, so a run can report measured cost instead of a guess. */
const usageTotals = { promptTokens: 0, completionTokens: 0, calls: 0 };

async function reviewOne(
  renderId: string,
): Promise<{ outcome: Outcome; issues: string[]; error?: string; usage?: { promptTokens: number; completionTokens: number } }> {
  const db = getDb();
  try {
    const [render] = await db.select().from(wholePageRenders).where(eq(wholePageRenders.id, renderId)).limit(1);
    if (!render) return { outcome: 'error', issues: [], error: `render_not_found:${renderId}` };
    if (!render.imagePath) return { outcome: 'error', issues: [], error: 'render_has_no_image' };

    const spec = render.specJson as WholePageSpec;
    const sourceText = deriveReviewSourceText(spec);
    // A page with no body text (half-title, pure ornament) has nothing to compare.
    if (!sourceText.trim()) return { outcome: 'pass', issues: [] };

    const imageBuf = await getProjectStorage().readProjectFile(render.imagePath);
    const result = await reviewRenderedText(imageBuf, sourceText);
    if (result.usage) {
      usageTotals.promptTokens += result.usage.promptTokens;
      usageTotals.completionTokens += result.usage.completionTokens;
      usageTotals.calls++;
    }
    return {
      outcome: result.pass ? 'pass' : 'fail',
      issues: result.issues ?? [],
      usage: result.usage ? { promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens } : undefined,
    };
  } catch (err) {
    return { outcome: 'error', issues: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error('usage: tsx scripts/local-ai-review.ts <projectId> [pageKeyContains] [--only-errors|--only-unchecked]');
    process.exit(2);
  }
  const argv = process.argv.slice(3);
  const onlyErrors = argv.includes('--only-errors');
  const onlyUnchecked = argv.includes('--only-unchecked');
  const filters = (argv.find((a) => !a.startsWith('--')) ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const previous = loadPrevious(projectId);
  let targets = await findLatestRenders(projectId, filters);

  if (onlyErrors) {
    targets = targets.filter((t) => previous.get(t.pageKey)?.outcome === 'error');
    console.log(`--only-errors: retrying ${targets.length} page(s) that errored previously.`);
  } else if (onlyUnchecked) {
    // An errored page was never actually checked, so it counts as unchecked.
    targets = targets.filter((t) => {
      const p = previous.get(t.pageKey);
      return !p || p.outcome === 'error';
    });
    console.log(`--only-unchecked: reviewing ${targets.length} page(s) with no verified result yet.`);
  }

  if (targets.length === 0) {
    console.log('Nothing to review.');
    process.exit(0);
  }

  console.log(`Reviewing ${targets.length} page(s) locally (no deployed backend involved)...\n`);
  const records: Record_[] = [];
  let passed = 0;
  let failed = 0;
  let errored = 0;

  for (const t of targets) {
    process.stdout.write(`  ${t.pageKey} ... `);
    const r = await reviewOne(t.renderId);
    const rec: Record_ = { pageKey: t.pageKey, renderId: t.renderId, outcome: r.outcome, issues: r.issues, error: r.error };
    records.push(rec);
    if (r.outcome === 'pass') {
      passed++;
      console.log('PASS');
    } else if (r.outcome === 'fail') {
      failed++;
      console.log(`FAIL — ${r.issues.length} issue(s)`);
      for (const i of r.issues) console.log(`      · ${i}`);
    } else {
      errored++;
      console.log(`ERROR: ${r.error}`);
    }
    // Persist after every page. A crash mid-run then costs one page, not a sweep.
    persist(projectId, previous, records);
  }

  const all = Array.from(mergeRecords(previous, records).values());
  const cum = {
    total: all.length,
    passed: all.filter((r) => r.outcome === 'pass').length,
    failed: all.filter((r) => r.outcome === 'fail').length,
    errored: all.filter((r) => r.outcome === 'error').length,
  };

  // Measured token usage. Cost per unit must come from data, never intuition.
  if (usageTotals.calls > 0) {
    const avgPrompt = Math.round(usageTotals.promptTokens / usageTotals.calls);
    const avgCompletion = Math.round(usageTotals.completionTokens / usageTotals.calls);
    console.log('\n--- MEASURED USAGE ---');
    console.log(`  billed calls:        ${usageTotals.calls}`);
    console.log(`  prompt tokens:       ${usageTotals.promptTokens} (avg ${avgPrompt}/page — image dominates this)`);
    console.log(`  completion tokens:   ${usageTotals.completionTokens} (avg ${avgCompletion}/page)`);
    console.log(`  total tokens:        ${usageTotals.promptTokens + usageTotals.completionTokens}`);
    console.log('  Multiply by the model\'s per-token price for actual cost per page.');
  }

  console.log(`\nThis run: ${passed} passed, ${failed} failed, ${errored} errored, ${targets.length} total.`);
  console.log(`Cumulative: ${cum.passed} passed, ${cum.failed} failed, ${cum.errored} errored, ${cum.total} pages.`);
  const stillUnchecked = cum.errored;
  if (stillUnchecked > 0) console.log(`\n${stillUnchecked} page(s) still have NO verified result. These are not passes.`);
  console.log(`\nReport: ${REPORT_PATH}`);
  process.exit(0);
}

function mergeRecords(previous: Map<string, Record_>, records: Record_[]): Map<string, Record_> {
  const merged = new Map(previous);
  for (const r of records) merged.set(r.pageKey, r);
  return merged;
}

function persist(projectId: string, previous: Map<string, Record_>, records: Record_[]): void {
  const all = Array.from(mergeRecords(previous, records).values()).sort((a, b) => a.pageKey.localeCompare(b.pageKey));
  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        projectId,
        ranAt: new Date().toISOString(),
        mode: 'local',
        cumulative: {
          total: all.length,
          passed: all.filter((r) => r.outcome === 'pass').length,
          failed: all.filter((r) => r.outcome === 'fail').length,
          errored: all.filter((r) => r.outcome === 'error').length,
        },
        records: all,
      },
      null,
      2,
    ),
    'utf8',
  );
}

main();
