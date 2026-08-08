/**
 * PUNCTUATION FIDELITY AUDIT — deterministic, free, no API calls.
 *
 * The CH07_P012_m calibration established that source `;` printed as `,` is a
 * REAL renderer defect, not an OCR misread: three instances were confirmed by
 * zoomed inspection of the render, and the vision reviewer missed two of them.
 * Vision is therefore not the authority for this defect class.
 *
 * This sweeps the OCR screen output for every punctuation-only mismatch and
 * sorts them by how much the surrounding evidence supports them, so the
 * operator sees which are likely real and which are probably the reader's
 * fault. It decides nothing on its own.
 *
 * Bands:
 *   A HIGH-CONFIDENCE LIKELY RENDER DEFECT — on a page OCR read well, in a
 *     substitution class already confirmed real on this book.
 *   B AMBIGUOUS OCR READ — page recovery too low, or an isolated one-off in a
 *     class tesseract is known to confuse.
 *   C BENIGN TYPOGRAPHIC NORMALIZATION — case-only title differences and the
 *     like. Not defects; noise the screen cannot suppress.
 *
 * Usage: tsx scripts/punctuation-audit.ts <ocr-report.json> [more.json ...]
 */
import { readFileSync } from 'node:fs';

interface Mismatch { at: number; expected: string; printed: string | null; lettersDiffer: boolean }
interface Block { index: number; expected: string[]; recovery: number; mismatches: Mismatch[] }
interface Result { pageKey: string; renderId: string; recovery: number; blocks: Block[] }

/** Substitutions confirmed REAL on this book by zoomed inspection of the render. */
const CONFIRMED_CLASSES = new Set([';->,', ':->;', '.->,', ':->,', ';->:']);
/** Page-level OCR recovery below which a punctuation read is not trustworthy. */
const TRUST_RECOVERY = 0.95;

const strip = (t: string): string => t.replace(/[\p{L}\p{N}]/gu, '');
const core = (t: string): string => t.replace(/[^\p{L}\p{N}]/gu, '');

function classOf(expected: string, printed: string): string {
  const e = strip(expected);
  const p = strip(printed);
  return `${e || '∅'}->${p || '∅'}`;
}

interface Row {
  pageKey: string;
  recovery: number;
  context: string;
  expected: string;
  printed: string;
  cls: string;
  band: 'A' | 'B' | 'C';
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('usage: tsx scripts/punctuation-audit.ts <ocr-report.json> [...]');
    process.exit(2);
  }

  const results: Result[] = [];
  for (const f of files) {
    const j = JSON.parse(readFileSync(f, 'utf8'));
    for (const r of j.results ?? []) results.push(r);
  }

  const rows: Row[] = [];
  for (const r of results) {
    for (const b of r.blocks) {
      for (const m of b.mismatches) {
        if (m.printed === null || m.lettersDiffer) continue;
        // case-only difference: same letters, same punctuation, different case
        if (core(m.expected).toLowerCase() === core(m.printed).toLowerCase() && strip(m.expected) === strip(m.printed)) {
          rows.push({
            pageKey: r.pageKey, recovery: r.recovery,
            context: b.expected.slice(Math.max(0, m.at - 3), m.at + 4).join(' '),
            expected: m.expected, printed: m.printed, cls: 'case-only', band: 'C',
          });
          continue;
        }
        const cls = classOf(m.expected, m.printed);
        const band: Row['band'] =
          r.recovery >= TRUST_RECOVERY && CONFIRMED_CLASSES.has(cls) ? 'A' : 'B';
        rows.push({
          pageKey: r.pageKey, recovery: r.recovery,
          context: b.expected.slice(Math.max(0, m.at - 3), m.at + 4).join(' '),
          expected: m.expected, printed: m.printed, cls, band,
        });
      }
    }
  }

  // does the same substitution class repeat on the same page? repetition is
  // evidence of a systematic renderer behaviour rather than a stray misread.
  const perPageClass = new Map<string, number>();
  for (const r of rows) perPageClass.set(`${r.pageKey}|${r.cls}`, (perPageClass.get(`${r.pageKey}|${r.cls}`) ?? 0) + 1);

  const bands: Record<string, Row[]> = { A: [], B: [], C: [] };
  for (const r of rows) bands[r.band]!.push(r);

  const title = { A: 'A — HIGH-CONFIDENCE LIKELY RENDER DEFECT', B: 'B — AMBIGUOUS OCR READ', C: 'C — BENIGN TYPOGRAPHIC NORMALIZATION' };
  for (const band of ['A', 'B', 'C'] as const) {
    const list = bands[band]!;
    console.log(`\n${'═'.repeat(78)}\n${title[band]}  (${list.length})`);
    if (band === 'C') {
      const byPage = new Map<string, number>();
      for (const r of list) byPage.set(r.pageKey, (byPage.get(r.pageKey) ?? 0) + 1);
      console.log('  ' + [...byPage.entries()].map(([k, v]) => `${k}(${v})`).join(' '));
      continue;
    }
    for (const r of list.sort((a, b) => b.recovery - a.recovery)) {
      const rep = perPageClass.get(`${r.pageKey}|${r.cls}`)!;
      console.log(
        `\n  ${r.pageKey}  recovery ${(r.recovery * 100).toFixed(1)}%  class ${r.cls}` +
          (rep > 1 ? `  ×${rep} on this page (repeating)` : ''),
      );
      console.log(`    source : ${r.context}`);
      console.log(`    printed: 〔${r.expected}〕 -> 〔${r.printed}〕`);
    }
  }

  const aPages = new Set(bands.A!.map((r) => r.pageKey));
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`BAND A: ${bands.A!.length} mismatches across ${aPages.size} pages`);
  console.log(`  ${[...aPages].sort().join(' ')}`);
  console.log(`BAND B: ${bands.B!.length}   BAND C: ${bands.C!.length}`);
  console.log('\nDeterministic. No API calls. No canonical state written.');
  process.exit(0);
}

main();
