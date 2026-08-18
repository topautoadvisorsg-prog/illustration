/**
 * C1 REGRESSION — old parser vs new, across every manuscript that shares the
 * typeset renderer.
 *
 * SPEC_TYPESET_ENGINE_V1 amendments 2 and 3: coverage is every shipped book, and
 * the criterion is structural/content equivalence rather than a byte hash.
 *
 * The old parser is inlined below VERBATIM as it stood before the C1 change, so
 * this compares against what actually shipped rather than against a description
 * of it. It is frozen: never update it to match the new one.
 *
 *   yarn tsx scripts/c1-regression.ts
 *
 * Reads manuscripts from disk. Touches no database, spends nothing.
 */
import { readFileSync, existsSync } from 'node:fs';
import { parseTypesetSections, type TypesetSection } from '../src/pipeline/typeset/typeset-book.js';
import {
  assertCanonicalCompleteness,
  scanCanonicalHeadings,
} from '../src/pipeline/typeset/canonical-inventory.js';

// ── The parser exactly as it stood before C1. FROZEN. ───────────────────────
interface OldSection { kind: 'chapter' | 'front' | 'back'; number: number | null; title: string; bodyLines: string[] }
function parseTypesetSectionsOLD(markdown: string): OldSection[] {
  const out: OldSection[] = [];
  let current: OldSection | null = null;
  let pendingChapter: number | null = null;
  let matter: 'front' | 'back' | null = null;
  let seenStructure = false;
  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    if (h1) {
      const t = h1[1]!.trim();
      const ch = t.match(/^chapter\s+(\d+)/i);
      if (ch) { pendingChapter = Number(ch[1]); matter = null; seenStructure = true; current = null; continue; }
      if (/^front\s+matter$/i.test(t)) { matter = 'front'; seenStructure = true; current = null; continue; }
      if (/^back\s+matter$/i.test(t)) { matter = 'back'; seenStructure = true; current = null; continue; }
      if (!seenStructure) { pendingChapter = null; current = null; continue; }
      current = { kind: matter ?? 'front', number: null, title: t, bodyLines: [] };
      out.push(current);
      pendingChapter = null;
      continue;
    }
    if (h2) {
      current = {
        kind: pendingChapter !== null ? 'chapter' : (matter ?? 'front'),
        number: pendingChapter,
        title: h2[1]!.trim(),
        bodyLines: [],
      };
      out.push(current);
      pendingChapter = null;
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  return out;
}
// ────────────────────────────────────────────────────────────────────────────

/**
 * `track` matters for how the completeness invariant is read.
 *
 * The invariant assumes H1/H2 name SECTIONS, which is true on the typeset track.
 * On the whole-page track an H2 is an entry inside a chapter — a species, a park
 * — so the scan legitimately counts more "sections" than the typeset parser
 * produces. Those books do not use `parseTypesetSections` at all. Reporting them
 * as failures would be noise, so they are run and reported as INFORMATIONAL:
 * what must hold for them is that the parse did not MOVE, which is checked
 * exactly as strictly as for everything else.
 */
const D = 'C:/Users/jovan/Downloads/';
const BOOKS: { name: string; path: string; shipped: boolean; track: 'typeset' | 'whole-page' }[] = [
  { name: 'NO ONE TOLD ME THAT (shipped)', path: `${D}puberty boy book/no-one-told-me-that-MANUSCRIPT.md`, shipped: true, track: 'typeset' },
  { name: 'NATIONAL PARKS (shipped)', path: `${D}NATIONAL-PARKS-WITHOUT-THE-OVERWHELM_FINAL.md`, shipped: true, track: 'whole-page' },
  { name: 'THE WILDLANDS — New England (shipped)', path: `${D}The-Wild-Lands-New-England-MASTER.md`, shipped: true, track: 'whole-page' },
  { name: 'THE WILDLANDS — Canadian Rockies (shipped)', path: `${D}the-wildlands-canadian-rockies-FULL-MANUSCRIPTt.md`, shipped: true, track: 'whole-page' },
  { name: 'DIRT RICH (new, the book C1 unblocks)', path: `${D}DIRT-RICH-ABBY-FENWICK_FINAL.md`, shipped: false, track: 'typeset' },
];

const words = (lines: string[]): number => lines.join(' ').split(/\s+/).filter(Boolean).length;
const sig = (s: { kind: string; number: number | null; title: string; bodyLines: string[] }): string =>
  `${s.kind}|${s.number}|${s.title}|${words(s.bodyLines)}`;

let regressions = 0;
let unblocked = 0;
let invariantFailures = 0;

for (const book of BOOKS) {
  console.log(`\n${'═'.repeat(78)}\n${book.name}`);
  if (!existsSync(book.path)) {
    console.log(`  SKIPPED — not on disk: ${book.path}`);
    continue;
  }
  const md = readFileSync(book.path, 'utf8');
  const before = parseTypesetSectionsOLD(md);
  const after = parseTypesetSections(md);

  const beforeSig = before.map(sig);
  const afterSig = after.map(sig);
  const identical = beforeSig.length === afterSig.length && beforeSig.every((x, i) => x === afterSig[i]);

  console.log(`  sections   ${before.length} -> ${after.length}`);
  console.log(`  chapters   ${before.filter((s) => s.number !== null).length} -> ${after.filter((s) => s.number !== null).length}`);
  console.log(`  body words ${before.reduce((a, s) => a + words(s.bodyLines), 0)} -> ${after.reduce((a, s) => a + words(s.bodyLines), 0)}`);

  if (identical) {
    console.log('  RESULT: IDENTICAL — this book parses exactly as it did before.');
  } else if (book.shipped) {
    regressions++;
    console.log('  RESULT: *** CHANGED ON A SHIPPED BOOK — REGRESSION ***');
    const n = Math.max(beforeSig.length, afterSig.length);
    for (let i = 0; i < n; i++) {
      if (beforeSig[i] !== afterSig[i]) console.log(`    [${i}] before: ${beforeSig[i] ?? '(none)'}\n        after:  ${afterSig[i] ?? '(none)'}`);
    }
  } else {
    unblocked++;
    console.log('  RESULT: CHANGED — expected, this is the book C1 exists to fix.');
  }

  // Amendment 6: completeness judged from the canonical source, independently.
  const inv = scanCanonicalHeadings(md);
  const view = (s: TypesetSection | OldSection) => ({
    title: s.title,
    sourceTitle: (s as TypesetSection).sourceTitle,
    words: words(s.bodyLines),
  });
  const rBefore = assertCanonicalCompleteness(inv, before.map(view));
  const rAfter = assertCanonicalCompleteness(inv, after.map(view));
  const tag = book.track === 'typeset' ? 'canonical invariant' : 'canonical invariant (informational — whole-page track)';
  console.log(`  ${tag}: before ${rBefore.ok ? 'PASS' : `FAIL (${rBefore.failures.length})`}` +
              ` -> after ${rAfter.ok ? 'PASS' : `FAIL (${rAfter.failures.length})`}` +
              `   [expected ${rAfter.expectedSections} sections, ${rAfter.canonicalWords} words]`);
  if (!rAfter.ok && book.track === 'typeset') {
    invariantFailures++;
    for (const f of rAfter.failures.slice(0, 12)) console.log(`    - ${f.message}`);
    if (rAfter.failures.length > 12) console.log(`    - ...and ${rAfter.failures.length - 12} more`);
  }
}

console.log(`\n${'═'.repeat(78)}`);
console.log(
  `shipped-book regressions: ${regressions}    ` +
  `typeset-track invariant failures: ${invariantFailures}    ` +
  `books unblocked: ${unblocked}`,
);
process.exit(regressions === 0 && invariantFailures === 0 ? 0 : 1);
