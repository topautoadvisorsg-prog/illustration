/**
 * Record a HUMAN visual verdict on a specific render, as first-class evidence.
 *
 * WHY THIS EXISTS
 * Two failures on this project came from verdicts that existed only in
 * conversation. An operator approved the knots page across three iterations
 * and the database never learned of it, so reconciliation queued that page for
 * a paid re-render that would have destroyed the approved artwork. Separately,
 * pages inspected by eye and found clean stayed listed as "unverified" because
 * looking at an image left no record.
 *
 * A verdict that lives in chat is not evidence. This writes it down, bound to
 * the exact render id it refers to, with provenance and a reason.
 *
 * Human verdicts carry reviewerVersion 999 so they are never treated as stale
 * by an automated ruleset change — a person looked at the actual page, and no
 * prompt revision invalidates that.
 *
 * Usage:
 *   tsx scripts/record-visual-verdict.ts <projectId> <pageKey> <clean|defective|manual> "<reason>" [--by "name"] [--commit]
 */
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { and, eq, desc } from 'drizzle-orm';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, '..', '..', 'ai-review-report.json');

/** Human verdicts outrank every automated ruleset and never expire. */
export const HUMAN_REVIEWER_VERSION = 999;

async function main() {
  const [projectId, pageKey, verdictRaw, reason] = process.argv.slice(2);
  const byIdx = process.argv.indexOf('--by');
  const by = byIdx !== -1 ? process.argv[byIdx + 1]! : 'operator (visual inspection)';
  const commit = process.argv.includes('--commit');

  if (!projectId || !pageKey || !verdictRaw || !reason) {
    console.error('usage: tsx scripts/record-visual-verdict.ts <projectId> <pageKey> <clean|defective|manual> "<reason>" [--by "name"] [--commit]');
    process.exit(2);
  }
  const verdict = verdictRaw.toLowerCase();
  if (!['clean', 'defective', 'manual'].includes(verdict)) {
    console.error(`verdict must be clean | defective | manual, got "${verdictRaw}"`);
    process.exit(2);
  }

  const db = getDb();
  const [page] = await db.select().from(pages).where(and(eq(pages.projectId, projectId), eq(pages.pageKey, pageKey))).limit(1);
  if (!page) {
    console.error(`page not found: ${pageKey}`);
    process.exit(1);
  }
  // The verdict binds to the render actually looked at — the newest usable one.
  const [render] = await db
    .select()
    .from(wholePageRenders)
    .where(eq(wholePageRenders.pageId, page.id))
    .orderBy(desc(wholePageRenders.version));
  if (!render?.imagePath) {
    console.error(`${pageKey} has no usable render to attach a verdict to`);
    process.exit(1);
  }

  const outcome = verdict === 'clean' ? 'pass' : verdict === 'defective' ? 'fail' : 'suspect';
  const record = {
    pageKey,
    renderId: render.id,
    outcome,
    issues: verdict === 'clean' ? [] : [reason],
    reviewerVersion: HUMAN_REVIEWER_VERSION,
    reviewedBy: by,
    reviewedAt: new Date().toISOString(),
    evidence: reason,
    method: 'human visual inspection of the rendered page image',
  };

  console.log(`${pageKey} v${render.version} (${render.id})`);
  console.log(`  verdict : ${verdict.toUpperCase()} -> outcome "${outcome}"`);
  console.log(`  by      : ${by}`);
  console.log(`  reason  : ${reason}`);

  if (!commit) {
    console.log('\nDRY RUN — pass --commit to persist.');
    process.exit(0);
  }

  const report = existsSync(REPORT_PATH)
    ? (JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as { projectId?: string; records?: unknown[] })
    : { projectId, records: [] };
  const records = (report.records ?? []) as Array<Record<string, unknown>>;
  // Replace any prior record for this page; keep everything else untouched.
  const kept = records.filter((r) => r.pageKey !== pageKey);
  kept.push(record);
  kept.sort((a, b) => String(a.pageKey).localeCompare(String(b.pageKey)));
  writeFileSync(REPORT_PATH, JSON.stringify({ ...report, projectId, records: kept }, null, 2), 'utf8');
  console.log(`\nPersisted. ${kept.length} records in ${REPORT_PATH}`);
  process.exit(0);
}

main();
