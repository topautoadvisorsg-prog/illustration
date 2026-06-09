/**
 * run-supervisor.ts — hit the live POST /api/projects/:id/run-pipeline endpoint
 * and pretty-print the PipelineReport so the acceptance checks are obvious
 * at a glance.
 *
 * Usage:
 *   tsx scripts/run-supervisor.ts                # no-spend, default project
 *   tsx scripts/run-supervisor.ts --mode no-spend
 *   BACKEND_URL=... PROJECT_ID=... tsx scripts/run-supervisor.ts
 *
 * Outputs the report so the operator can compare against the acceptance
 * checklist:
 *   - project trim
 *   - page count
 *   - fit distribution
 *   - remaining overflow count
 *   - operator-review pages
 *   - verification-batch ready?
 *   - next action
 */

const BACKEND_URL =
  process.env.BACKEND_URL ?? 'https://wildlandsbackend-production.up.railway.app';
const PROJECT_ID =
  process.env.PROJECT_ID ?? '9e46d6b9-c8eb-46a0-bba8-88584b0add48';
const MODE = process.argv.includes('--mode')
  ? process.argv[process.argv.indexOf('--mode') + 1]
  : 'no-spend';

const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const head = (msg: string) => console.log(`\n── ${msg} ──`);

async function main(): Promise<void> {
  console.log(`Backend : ${BACKEND_URL}`);
  console.log(`Project : ${PROJECT_ID}`);
  console.log(`Mode    : ${MODE}`);

  const res = await fetch(
    `${BACKEND_URL}/api/projects/${PROJECT_ID}/run-pipeline`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: MODE }),
    },
  );
  const text = await res.text();
  if (res.status !== 200) {
    console.error(`HTTP ${res.status}\n${text}`);
    process.exit(1);
  }
  const report = JSON.parse(text);

  head('1. Snapshot — acceptance-test checklist');
  ok(`Project trim   : ${report.snapshot.trim.widthIn}×${report.snapshot.trim.heightIn} in (bleed ${report.snapshot.trim.bleedIn})`);
  ok(`Resolved canvas: ${report.snapshot.canvas.widthIn}×${report.snapshot.canvas.heightIn} in`);
  ok(`Page count     : ${report.snapshot.pageCount}`);
  ok(`Roles          : openers=${report.snapshot.roleDistribution.openers} continuations=${report.snapshot.roleDistribution.continuations} compacted=${report.snapshot.roleDistribution.compacted}`);
  ok(`Fit distribution: ${JSON.stringify(report.snapshot.fitDistribution)}`);
  ok(`OVERFLOW count : ${report.snapshot.overflowCount}`);
  ok(`Operator-review pages: ${report.snapshot.operatorReviewPages.length === 0 ? '(none)' : report.snapshot.operatorReviewPages.join(', ')}`);
  ok(`Verification batch ready: ${report.snapshot.verificationBatchReady}${report.snapshot.verificationBatchReason ? ` (reason: ${report.snapshot.verificationBatchReason})` : ''}`);
  ok(`Estimated image spend : $${report.snapshot.estimatedImageSpendUsd.toFixed(2)} (budget $${report.snapshot.imageBudgetUsd.toFixed(2)})`);

  head('2. Stages');
  for (const s of report.stages) {
    const tag = s.verdict.padEnd(7);
    console.log(`  [${tag}] ${s.label}: ${s.summary}`);
    if (s.autoFixes.length > 0) {
      for (const f of s.autoFixes) {
        console.log(`    ↳ auto-fix applied (${f.kind}) on ${f.pageKey ?? 'project'}: ${f.description}`);
      }
    }
  }

  head('3. Blocking issues');
  if (report.blockingIssues.length === 0) {
    ok('No blocking issues.');
  } else {
    for (const f of report.blockingIssues) {
      console.log(`  ✗ [${f.stage}] ${f.message}${f.recommendedAction ? `\n     → ${f.recommendedAction}` : ''}`);
    }
  }

  head('4. Operator-review items');
  if (report.operatorReviewItems.length === 0) {
    ok('No operator-review items.');
  } else {
    for (const f of report.operatorReviewItems) {
      console.log(`  ⚠ [${f.severity}] [${f.stage}] ${f.message}`);
    }
  }

  head('5. Next action');
  console.log(`  type   : ${report.nextAction.type}`);
  console.log(`  label  : ${report.nextAction.label}`);
  if (report.nextAction.details) console.log(`  details: ${report.nextAction.details}`);
  if (report.nextAction.url) console.log(`  url    : ${report.nextAction.url}`);

  head('6. Verdict');
  console.log(`  Overall : ${report.overallVerdict}`);
  console.log(`  Current : ${report.currentStage}`);
  console.log(`  Mode    : ${report.mode}`);
  console.log(`  Duration: ${report.durationMs}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
