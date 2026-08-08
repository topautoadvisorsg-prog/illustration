/**
 * EXCEPTION TABLE — cross-references vision verdicts against OCR evidence.
 *
 * The vision reviewer states each issue as "WRONG (as printed) -> RIGHT (from
 * source)". That is a checkable claim: if the renderer really printed WRONG,
 * an independent OCR pass over the same image should have seen it too. This
 * searches the raw OCR token stream for the claimed word.
 *
 * Corroboration works even on pages whose OCR recovery is far too low to
 * screen with — a low overall score means the alignment failed, not that every
 * token is unreadable, so looking for one specific string is still valid.
 *
 * Deterministic. No API calls. No canonical state written.
 *
 * Usage: tsx scripts/exception-table.ts
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CACHE_DIR = path.join(process.cwd(), '.ocr-cache');

interface CalRecord {
  pageKey: string; renderId: string; layoutTemplate: string | null;
  outcome: string; issueCount: number; issues: string[];
  promptTokens: number; completionTokens: number; costUsd: number; latencyMs: number; error?: string;
}

const letters = (s: string): string => s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

/** Raw OCR tokens for a page, from whichever cached run produced them. */
function ocrTokensFor(pageKey: string): string[] | null {
  if (!existsSync(CACHE_DIR)) return null;
  const f = readdirSync(CACHE_DIR).find((n) => n.startsWith(`${pageKey}-`) && n.endsWith('.json'));
  if (!f) return null;
  try {
    const c = JSON.parse(readFileSync(path.join(CACHE_DIR, f), 'utf8'));
    const raw: string = c.raw ?? '';
    return [...(c.tokens ?? []), ...raw.split(/\s+/)].filter(Boolean);
  } catch {
    return null;
  }
}

function ocrRecoveryFor(pageKey: string, files: string[]): number | null {
  for (const f of files) {
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    const r = (j.results ?? []).find((x: any) => x.pageKey === pageKey);
    if (r) return r.recovery;
  }
  return null;
}

/** "transeeiver (as printed) -> transceiver (from source)" → the printed word. */
function claimedWord(issue: string): string | null {
  const m = issue.match(/^\s*(.+?)\s*\(as printed[^)]*\)\s*->/i);
  return m ? m[1]!.trim() : null;
}

function main() {
  const cal = JSON.parse(readFileSync('./vision-calibration.json', 'utf8'));
  const records: CalRecord[] = cal.records ?? [];
  const ocrFiles = ['./ocr-screen-45.json', './ocr-calibration.json', './ocr-textheavy-11.json'];

  console.log('\n' + '═'.repeat(100));
  console.log('EXCEPTION TABLE — vision verdicts cross-checked against independent OCR');
  console.log('═'.repeat(100));

  let corroborated = 0;
  let uncorroborated = 0;
  let cleanPages = 0;
  let totalCost = 0;

  for (const r of records.sort((a, b) => b.issueCount - a.issueCount)) {
    totalCost += r.costUsd;
    const rec = ocrRecoveryFor(r.pageKey, ocrFiles);
    const ocrState = rec === null ? 'not screened' : `${(rec * 100).toFixed(1)}%`;
    if (r.issueCount === 0) {
      cleanPages++;
      continue;
    }
    console.log(`\n${r.pageKey}  [${r.layoutTemplate ?? 'FRONT_MATTER'}]  OCR ${ocrState}  $${r.costUsd.toFixed(5)}`);
    const toks = ocrTokensFor(r.pageKey);
    for (const issue of r.issues) {
      const w = claimedWord(issue);
      let verdict: string;
      if (!w) verdict = 'UNPARSEABLE CLAIM';
      else if (!toks) verdict = 'NO OCR DATA';
      else {
        const hit = toks.some((t) => t === w) || toks.some((t) => letters(t) === letters(w) && letters(w).length > 2);
        verdict = hit ? 'CORROBORATED by OCR' : 'NOT corroborated';
        hit ? corroborated++ : uncorroborated++;
      }
      console.log(`    ${verdict.padEnd(22)} ${issue}`);
    }
  }

  console.log(`\n${'═'.repeat(100)}`);
  console.log(`pages reviewed        : ${records.length}`);
  console.log(`called CLEAN by vision: ${cleanPages}`);
  console.log(`with claimed issues   : ${records.length - cleanPages}`);
  console.log(`claims CORROBORATED   : ${corroborated}`);
  console.log(`claims NOT corroborated: ${uncorroborated}`);
  console.log(`total OpenAI spend    : $${totalCost.toFixed(5)}`);
  console.log('\nDeterministic cross-check. No canonical state written.');
  process.exit(0);
}

main();
