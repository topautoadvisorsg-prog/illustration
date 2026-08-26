/**
 * THE CORRECTION REPORT.
 *
 * Every build states what it did with every correction. The report is short on
 * purpose: a person verifying a punctuation fix needs the sentence around it,
 * not the manuscript, and a report nobody reads is a report that hides things.
 */
import type { CorrectionResolution, CorrectionResult } from './resolve-corrections.js';
import { BLOCKING_OUTCOMES } from './resolve-corrections.js';

const ORDER: Record<string, number> = {
  UNMATCHED: 0,
  AMBIGUOUS: 1,
  EXPECT_MISMATCH: 2,
  APPLIED: 3,
  NOOP: 4,
  SUPERSEDED: 5,
};

export function renderCorrectionReport(result: CorrectionResult): string {
  const out: string[] = [];
  const c = result.counts;

  out.push('');
  out.push('CORRECTIONS');
  out.push('─'.repeat(78));
  out.push(
    `  configured ${c.total}   applied ${c.APPLIED}   no-op ${c.NOOP}   superseded ${c.SUPERSEDED}   ` +
      `unmatched ${c.UNMATCHED}   ambiguous ${c.AMBIGUOUS}   expect-mismatch ${c.EXPECT_MISMATCH}`,
  );

  if (result.resolutions.length === 0) {
    out.push('  (none configured for this book)');
    out.push('');
    return out.join('\n');
  }

  out.push('');
  const sorted = [...result.resolutions].sort(
    (a, b) => (ORDER[a.outcome] ?? 9) - (ORDER[b.outcome] ?? 9) || a.id.localeCompare(b.id),
  );
  for (const r of sorted) out.push(...renderOne(r));

  out.push('─'.repeat(78));
  if (result.ok) {
    out.push('  All corrections resolved.');
  } else {
    const blocking = result.resolutions.filter((r) => BLOCKING_OUTCOMES.includes(r.outcome));
    out.push(`  BLOCKED — ${blocking.length} correction(s) did not resolve: ${blocking.map((b) => b.id).join(', ')}`);
    out.push('  A correction someone deliberately made must not silently become a no-op.');
  }
  out.push('');
  return out.join('\n');
}

function renderOne(r: CorrectionResolution): string[] {
  const lines: string[] = [];
  lines.push(`  [${r.outcome.padEnd(15)}] ${r.id}  (${r.type})`);
  lines.push(`      why    : ${r.reason}`);
  lines.push(`      result : ${r.detail}`);
  if (r.before !== undefined) lines.push(`      before : ${r.before}`);
  if (r.after !== undefined) lines.push(`      after  : ${r.after}`);
  lines.push('');
  return lines;
}

/** The machine-readable form, for a build manifest or a CI job. */
export function correctionReportJson(result: CorrectionResult): {
  ok: boolean;
  counts: CorrectionResult['counts'];
  resolutions: CorrectionResolution[];
} {
  return { ok: result.ok, counts: result.counts, resolutions: result.resolutions };
}
