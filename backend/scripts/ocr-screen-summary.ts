/**
 * Summarises an ocr-text-fidelity.ts JSON report into operator-readable bands.
 *
 * The screen produces one recovery score per page. This turns that into a
 * decision table without anybody having to read 45 page dumps. It classifies
 * ONLY text fidelity — never publication approval — and it deliberately keeps
 * "not screenable" separate from "flagged", because a page in an unsupported
 * layout is not evidence of a defect, it is absence of evidence.
 *
 * Usage: tsx scripts/ocr-screen-summary.ts <report.json> [--layouts]
 */
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';

import { P } from './_project.js';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';

/** Calibrated on 6 labelled pages: clean band 97.0-99.0%, defective band
 *  3.3-86.6%. 95% sits in the gap with no overlap. Screening threshold only. */
const PASS = 0.95;
/** Below this the OCR did not meaningfully read the page, so the score says
 *  nothing about the text — it is an OCR failure, not a page defect. */
const UNREADABLE = 0.5;

interface Mismatch { at: number; expected: string; printed: string | null; lettersDiffer: boolean }
interface Block { index: number; expected: string[]; recovery: number; mismatches: Mismatch[] }
interface Result {
  pageKey: string; renderId: string; version: number | null;
  expectedTokens: number; ocrTokens: number; droppedLowConfidence: number;
  blocks: Block[]; recovery: number; letterDefects: number; punctuationDefects: number; ocrMs: number;
}

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error('usage: tsx scripts/ocr-screen-summary.ts <report.json>');
    process.exit(2);
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { results: Result[] };
  const results = report.results;

  const db = getDb();
  const rows = await db.select().from(pages).where(eq(pages.projectId, P));
  const layoutOf = new Map(rows.map((r: any) => [r.pageKey, r.layoutTemplate ?? 'FRONT_MATTER']));

  const band = (r: Result): 'PASS' | 'FLAG' | 'UNREADABLE' =>
    r.recovery >= PASS ? 'PASS' : r.recovery < UNREADABLE ? 'UNREADABLE' : 'FLAG';

  const sorted = [...results].sort((a, b) => a.recovery - b.recovery);

  console.log('\n════════ TEXT FIDELITY SCREEN — RESULTS ════════');
  console.log('(text fidelity only; not a publication-quality verdict)\n');
  console.log('recovery  band        layout                        page');
  console.log('─'.repeat(88));
  for (const r of sorted) {
    console.log(
      `${(r.recovery * 100).toFixed(1).padStart(6)}%  ${band(r).padEnd(11)} ${String(layoutOf.get(r.pageKey) ?? '?').padEnd(29)} ${r.pageKey}`,
    );
  }

  // ── bands ──
  const byBand: Record<string, Result[]> = { PASS: [], FLAG: [], UNREADABLE: [] };
  for (const r of results) byBand[band(r)]!.push(r);

  console.log('\n──── BANDS ────');
  console.log(`  TEXT FIDELITY SCREEN PASSED (>=${PASS * 100}%) : ${byBand.PASS!.length}`);
  console.log(`  FLAGGED FOR INVESTIGATION                : ${byBand.FLAG!.length}`);
  console.log(`  NOT SCREENABLE (OCR could not read)      : ${byBand.UNREADABLE!.length}`);
  console.log(`  TOTAL                                    : ${results.length}`);

  // ── layout distribution ──
  const byLayout = new Map<string, { n: number; sum: number; pass: number }>();
  for (const r of results) {
    const L = String(layoutOf.get(r.pageKey) ?? '?');
    const e = byLayout.get(L) ?? { n: 0, sum: 0, pass: 0 };
    e.n++; e.sum += r.recovery; if (band(r) === 'PASS') e.pass++;
    byLayout.set(L, e);
  }
  console.log('\n──── LAYOUT DISTRIBUTION ────');
  for (const [L, e] of [...byLayout.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${L.padEnd(29)} n=${String(e.n).padStart(2)}  mean ${(100 * e.sum / e.n).toFixed(1)}%  passed ${e.pass}/${e.n}`);
  }

  // ── localized mismatches on everything that is not a wholesale OCR failure ──
  console.log('\n──── LOCALIZED MISMATCHES (readable pages only) ────');
  let shown = 0;
  for (const r of sorted) {
    if (band(r) === 'UNREADABLE') continue;
    const printed = r.blocks.flatMap((b) => b.mismatches.filter((m) => m.printed !== null).map((m) => ({ b, m })));
    if (printed.length === 0) continue;
    console.log(`\n  ${r.pageKey}  (${(r.recovery * 100).toFixed(1)}%)`);
    for (const { b, m } of printed) {
      const l = b.expected.slice(Math.max(0, m.at - 3), m.at).join(' ');
      const rr = b.expected.slice(m.at + 1, m.at + 4).join(' ');
      console.log(`    [${m.lettersDiffer ? 'LETTERS' : 'punct  '}] ...${l} 〔${m.expected}〕 ${rr}...`);
      console.log(`              printed: 〔${m.printed}〕`);
      shown++;
    }
  }
  if (shown === 0) console.log('  (none)');

  const totalMs = results.reduce((s, r) => s + r.ocrMs, 0);
  console.log(`\n──── RUNTIME ────`);
  console.log(`  ${(totalMs / 1000).toFixed(0)}s total · ${(totalMs / 1000 / results.length).toFixed(1)}s/page mean`);
  console.log(`  external API spend: $0.00`);
  console.log('\nEvidence produced: TEXT FIDELITY SCREEN only. No canonical state written.');
  process.exit(0);
}

main();
