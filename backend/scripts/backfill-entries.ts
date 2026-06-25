/* Phase A — backfill the first-class entries layer for the active project.
 * READ-ONLY against pages + manifests; the only write is the `entries` table.
 * Does NOT persist if validation fails.
 *   node ../node_modules/tsx/dist/cli.mjs scripts/backfill-entries.ts
 */
import { backfillProjectEntries } from '../src/pipeline/entries/backfill-entries.js';
import { P } from './_project.js';

const { derived, report, persisted } = await backfillProjectEntries(P);
console.log(`\n=== entries backfill — project ${P} ===`);
console.log(`derived ${derived.length} entries · validation ${report.passed ? 'PASS ✓' : 'FAIL ✗'} · persisted ${persisted}`);
console.log(`body openers: ${report.bodyOpeners} · entry count: ${report.entryCount}`);
for (const c of report.checks) console.log(`  [${c.passed ? '✓' : '✗'}] ${c.name} — ${c.detail}`);
console.log('\nsample entries (first 10):');
for (const e of derived.slice(0, 10)) {
  console.log(`  #${e.readingOrder} ch${e.chapterNumber} ${e.entryKey} "${e.entryTitle}"${e.scientificName ? ` (${e.scientificName})` : ''} · ${e.pageCount}pg · ${e.wordCount}w`);
}
if (!report.passed) { console.error('\nVALIDATION FAILED — entries NOT persisted. Fix the data, re-run.'); process.exit(1); }
console.log(`\nDONE — ${persisted} entries persisted.`);
process.exit(0);
