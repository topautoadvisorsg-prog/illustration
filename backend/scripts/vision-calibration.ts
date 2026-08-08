/**
 * REVIEWER CALIBRATION — paid, tightly scoped, NOT a QA run.
 *
 * Runs the vision reviewer over a named handful of pages and records what it
 * cost and how long it took, so the remaining work can be priced from measured
 * data instead of an assumption. The ~$0.045/call figure everyone has been
 * quoting is derived from a failed sweep months ago and has never been checked
 * against this reviewer config.
 *
 * DELIBERATELY SEPARATE FROM ai-review-report.json.
 * local-ai-review.ts merges its verdicts into that file, which is the input to
 * canonical reconciliation — so running it against an operator-approved page
 * would overwrite a human decision with a machine one. This writes to its own
 * file and changes no approval state whatsoever.
 *
 * Usage: tsx scripts/vision-calibration.ts <pageKey> [<pageKey> ...] [--out <path>]
 */
import { and, desc, eq } from 'drizzle-orm';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { P } from './_project.js';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { reviewRenderedText, REVIEWER_VERSION } from '../src/services/openai/text-review.js';
import { deriveReviewSourceText } from '../src/pipeline/whole-page-render/review-source-text.js';
import type { WholePageSpec } from '../src/pipeline/whole-page-render/types.js';

/** gpt-4.1-mini list price, USD per 1M tokens. Update if the model changes. */
const PRICE = { input: 0.4, output: 1.6 };

interface CalRecord {
  pageKey: string;
  renderId: string;
  layoutTemplate: string | null;
  model: string;
  reviewerVersion: number;
  outcome: string;
  issueCount: number;
  issues: string[];
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  sourceChars: number;
  error?: string;
}

async function main() {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx === -1 ? './vision-calibration.json' : argv[outIdx + 1]!;
  const pageKeys = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');

  if (pageKeys.length === 0) {
    console.error('usage: tsx scripts/vision-calibration.ts <pageKey> [...] [--out <path>]');
    process.exit(2);
  }
  const db = getDb();
  const records: CalRecord[] = [];

  // ── COSTED PREFLIGHT ─────────────────────────────────────────────────
  // Spending must never be invisible. Every paid run prints what it is about
  // to buy, at the measured rate, BEFORE the first call. Above 5 pages it also
  // requires an explicit --yes, so a batch can never start by accident.
  const MEASURED_PER_PAGE = 0.00216; // measured 2026-08-08, gpt-4.1-mini, n=3
  const already = existsSync(outPath)
    ? ((JSON.parse(readFileSync(outPath, 'utf8')).records ?? []) as CalRecord[])
    : [];
  const dupes = pageKeys.filter((k) => already.some((r) => r.pageKey === k && !r.error));
  const toRun = pageKeys.filter((k) => !dupes.includes(k));

  console.error('\n──────── PAID RUN — PREFLIGHT ────────');
  console.error(`  model            : gpt-4.1-mini (reviewer v${REVIEWER_VERSION})`);
  console.error(`  pages requested  : ${pageKeys.length}`);
  if (dupes.length) {
    console.error(`  already reviewed : ${dupes.length} (${dupes.join(', ')}) — SKIPPED, not paid for twice`);
  }
  console.error(`  calls to make    : ${toRun.length}`);
  console.error(`  measured rate    : $${MEASURED_PER_PAGE.toFixed(5)}/page`);
  console.error(`  ESTIMATED SPEND  : $${(toRun.length * MEASURED_PER_PAGE).toFixed(4)}`);
  console.error('──────────────────────────────────────\n');

  if (toRun.length === 0) {
    console.error('Nothing to run. Every requested page already has a result.');
    process.exit(0);
  }
  if (toRun.length > 5 && !argv.includes('--yes')) {
    console.error(`REFUSING: ${toRun.length} calls without --yes. Re-run with --yes to authorise this spend.`);
    process.exit(2);
  }

  let spentSoFar = 0;

  for (const pageKey of toRun) {
    const [page] = await db
      .select()
      .from(pages)
      .where(and(eq(pages.projectId, P), eq(pages.pageKey, pageKey)))
      .limit(1);
    if (!page) {
      console.error(`SKIP ${pageKey}: not found`);
      continue;
    }
    const [render] = await db
      .select()
      .from(wholePageRenders)
      .where(and(eq(wholePageRenders.pageId, page.id), eq(wholePageRenders.status, 'RENDERED' as any)))
      .orderBy(desc(wholePageRenders.version))
      .limit(1);
    if (!render?.imagePath) {
      console.error(`SKIP ${pageKey}: no usable render`);
      continue;
    }

    const spec = render.specJson as WholePageSpec;
    const sourceText = deriveReviewSourceText(spec);
    const imageBuf = await getProjectStorage().readProjectFile(render.imagePath);

    const t0 = Date.now();
    let rec: CalRecord;
    try {
      const result = await reviewRenderedText(imageBuf, sourceText);
      const latencyMs = Date.now() - t0;
      const pt = result.usage?.promptTokens ?? 0;
      const ct = result.usage?.completionTokens ?? 0;
      rec = {
        pageKey,
        renderId: render.id,
        layoutTemplate: (page as any).layoutTemplate ?? null,
        model: result.model,
        reviewerVersion: REVIEWER_VERSION,
        outcome: String((result as any).outcome ?? 'unknown'),
        issueCount: (result.issues ?? []).length,
        issues: result.issues ?? [],
        promptTokens: pt,
        completionTokens: ct,
        costUsd: (pt * PRICE.input + ct * PRICE.output) / 1e6,
        latencyMs,
        sourceChars: sourceText.length,
      };
    } catch (err) {
      rec = {
        pageKey,
        renderId: render.id,
        layoutTemplate: (page as any).layoutTemplate ?? null,
        model: 'error',
        reviewerVersion: REVIEWER_VERSION,
        outcome: 'error',
        issueCount: 0,
        issues: [],
        promptTokens: 0,
        completionTokens: 0,
        costUsd: 0,
        latencyMs: Date.now() - t0,
        sourceChars: sourceText.length,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    records.push(rec);
    spentSoFar += rec.costUsd;
    console.error(
      `  [${String(records.length).padStart(2)}/${toRun.length}] ${rec.pageKey.padEnd(16)} ` +
        `issues=${String(rec.issueCount).padStart(3)}  in=${rec.promptTokens} out=${rec.completionTokens}  ` +
        `$${rec.costUsd.toFixed(5)}  running=$${spentSoFar.toFixed(4)}  ${rec.latencyMs}ms`,
    );
  }

  // merge with any prior records, keyed by page+render. Completed work is never
  // re-run, so a resumed batch is never paid for twice.
  const merged = [...already.filter((p) => !records.some((r) => r.pageKey === p.pageKey && r.renderId === p.renderId)), ...records];
  writeFileSync(
    outPath,
    JSON.stringify({ projectId: P, generatedAt: new Date().toISOString(), price: PRICE, records: merged }, null, 2),
    'utf8',
  );

  const totCost = records.reduce((s, r) => s + r.costUsd, 0);
  const totIn = records.reduce((s, r) => s + r.promptTokens, 0);
  const totOut = records.reduce((s, r) => s + r.completionTokens, 0);
  const totMs = records.reduce((s, r) => s + r.latencyMs, 0);
  console.error(
    `\nMEASURED: ${records.length} calls · in ${totIn} out ${totOut} tokens · $${totCost.toFixed(5)} total · ` +
      `$${(totCost / Math.max(1, records.length)).toFixed(5)}/page · ${(totMs / 1000).toFixed(1)}s`,
  );
  console.error(`detail → ${outPath}`);
  console.error('NO approval state was written. Calibration only.\n');
  process.exit(0);
}

main();
