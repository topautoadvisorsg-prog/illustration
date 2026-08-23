/**
 * DIRT RICH Rev 4 — apply the external-QA text corrections.
 *
 * Read-only against production. Reads the Rev 3 working text from a local file
 * proved byte-identical to the live manuscript (sha e2a5f783...), applies each
 * correction by WHOLE-LINE EXACT MATCH, and writes a candidate beside it.
 *
 * Every site must resolve to exactly one line. A Rev 3 correction pass silently
 * overwrote the wrong line by matching a phrase that also occurred in the
 * preceding sentence; it was caught only by a character-delta mismatch. So this
 * refuses to write unless every BEFORE matches exactly once, and it prints the
 * per-site delta so the total can be checked against expectation.
 *
 *   yarn tsx scripts/dirt-rich-rev4-apply.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'C:/Users/jovan/Downloads/dirt rich book';
const SRC = `${DIR}/QA-ONLY-corrected-on-REV2-NOT-CANONICAL.md`;
const OUT = `${DIR}/REV4-CANDIDATE-working-manuscript.md`;
/** The live Rev 3 working manuscript. Refuse to run against anything else. */
const REV3_SHA = 'e2a5f7832fed47e9e787a6b140f7283484bed6c56a7b7ee9b5048ed4be9e6dd4';

interface Correction {
  id: string;
  note: string;
  before: string;
  after: string;
}

const CORRECTIONS: Correction[] = [
  {
    id: 'R4-2',
    note: 'frost-free days: 160 -> 150, matching the May 10 / Oct 10 pair at L93',
    before:
      'Adjust everything below to your own frost dates. I\u0027m in a zone with a real winter and about a hundred and sixty frost-free days, and if yours is longer, the shape holds but the shoulders stretch.',
    after:
      'Adjust everything below to your own frost dates. I\u0027m in a zone with a real winter and about a hundred and fifty frost-free days, and if yours is longer, the shape holds but the shoulders stretch.',
  },
  {
    id: 'R4-3',
    note: 'manure interval attribution: NOP is the source, FDA defers to it. Numbers unchanged.',
    before:
      'For raw, aged, or incompletely composted manure, the published intervals, which come from the FDA\u0027s produce safety rule and the USDA National Organic Program standard it defers to, are 120 days before harvest for crops whose edible part touches the soil, and 90 days for crops where it doesn\u0027t. Properly composted material is treated differently and can generally be worked into beds as needed.',
    after:
      "For raw, aged, or incompletely composted manure, the published intervals are 120 days before harvest for crops whose edible part touches the soil, and 90 days for crops where it doesn't. Those are USDA National Organic Program intervals; FDA's produce safety rule points to them rather than setting its own. Properly composted material is treated differently and can generally be worked into beds as needed.",
  },
  {
    id: 'R4-6',
    note: 'remove the self-undermining "this table is stale" sentence',
    before:
      'Both totals match the figures in Chapter 2 and in *Every Number in This Book*. If they ever disagree, the chapters are right and this table is stale.',
    after: 'Both totals match the figures in Chapter 2 and in *Every Number in This Book*.',
  },
  {
    id: 'R4-1',
    note:
      'black walnut: juglone does break down in a finished pile (UW-Madison Extension); ' +
      'Illinois Extension gives six months. Keeps the practical caution, drops the false absolute.',
    before:
      'Two things to watch. Don\u0027t take bags from a lawn somebody treats chemically, for the herbicide reason coming up in a moment, and skip black walnut leaves. They carry a compound that suppresses tomatoes and survives composting.',
    after:
      "Two things to watch. Don't take bags from a lawn somebody treats chemically, for the herbicide reason coming up in a moment, and be careful with black walnut leaves. Juglone bothers tomatoes, but it breaks down in a finished pile, given six months.",
  },
  {
    id: 'R4-4',
    note:
      'source fit: the cited Utah State page is about human kidney-bean poisoning. ' +
      'Replaced with poultry feeding guidance, which is the authority for a chicken chapter.',
    before: 'Utah State University Extension, *Killer Kidney Beans* (lectins in raw beans)',
    after:
      'Colorado State University Extension, *Raising Poultry the Organic Way* (avoid undercooked or dried beans)',
  },
  {
    id: 'R4-5',
    note: 'enforcement: frame the general claim as experience, note it varies by jurisdiction',
    before:
      'Almost all of this is **complaint-driven**. Code enforcement officers do not patrol residential streets looking into back gardens. In fifteen years I have never seen one on this street who wasn\u0027t responding to something.',
    after:
      'In my experience almost all of this is **complaint-driven**, though how strictly a place enforces its rules varies, and yours may not work the way mine does. The officers around here do not patrol residential streets looking into back gardens. In fifteen years I have never seen one on this street who wasn\u0027t responding to something.',
  },
];

const original = readFileSync(SRC, 'utf8');
const sha = createHash('sha256').update(original, 'utf8').digest('hex');
console.log(`source : ${SRC.split('/').pop()}`);
console.log(`sha256 : ${sha}`);
if (sha !== REV3_SHA) {
  console.error('\nREFUSING TO RUN — this is not the live Rev 3 working manuscript.');
  process.exit(1);
}
console.log('         matches the live Rev 3 working manuscript\n');

const lines = original.split('\n');
let text = original;
let totalDelta = 0;
const applied: Array<{ id: string; line: number; delta: number }> = [];

for (const c of CORRECTIONS) {
  // Whole-line exact match. Anything other than exactly one hit is a hard stop.
  const hits: number[] = [];
  lines.forEach((line, i) => {
    if (line === c.before) hits.push(i + 1);
  });
  if (hits.length !== 1) {
    console.error(`${c.id}: expected exactly 1 matching line, found ${hits.length}`);
    if (hits.length > 1) console.error(`   lines: ${hits.join(', ')}`);
    process.exit(1);
  }
  const delta = c.after.length - c.before.length;
  totalDelta += delta;
  applied.push({ id: c.id, line: hits[0]!, delta });
  text = text.replace(c.before, c.after);
  console.log(`${c.id}  L${String(hits[0]).padStart(4)}  ${delta >= 0 ? '+' : ''}${delta} chars`);
  console.log(`        ${c.note}`);
}

/* R4-8: delete the duplicate ASCII site map from Appendix E.
   Appendix E prints the rendered plan and then repeats it as box-drawing art.
   The ASCII version is the placeholder Figure E.1 was built to replace; it
   survived into the manuscript.

   The block is located STRUCTURALLY - the fenced block immediately after the
   Figure E.1 reference - not by matching its contents. Box-drawing glyphs are
   exactly the sort of thing that breaks a literal match on an encoding
   difference, and a fuzzy content match would risk eating a different code
   block elsewhere in the book.

   The prose BENEATH the block is kept. It says the raised beds hold the crops
   Abby fusses over and wants early and the in-ground rows hold the sprawlers.
   That is the reasoning behind the layout, which a site plan cannot show, so it
   is not a duplicate of the figure. */
const FIG_E1 = '![](figure-E-1-site-plan.svg){74%}';
let asciiMapLines = 0;
{
  const l = text.split('\n');
  const figIdx = l.indexOf(FIG_E1);
  if (figIdx < 0) {
    console.error('R4-8: Figure E.1 reference not found');
    process.exit(1);
  }
  let open = figIdx + 1;
  while (open < l.length && l[open]!.trim() === '') open++;
  if (l[open] !== '```') {
    console.error('R4-8: expected a fenced block after Figure E.1, found: ' + l[open]);
    process.exit(1);
  }
  const close = l.indexOf('```', open + 1);
  if (close < 0) {
    console.error('R4-8: unterminated fenced block');
    process.exit(1);
  }
  const body = l.slice(open + 1, close).join('\n');
  const isMap = body.includes('HOUSE') && body.includes('street') && body.includes('compost');
  if (!isMap) {
    console.error('R4-8: the fenced block after Figure E.1 is not the site map - refusing to delete');
    process.exit(1);
  }
  // Take the trailing blank as well, so the figure and the prose end up
  // separated by exactly one blank line rather than two.
  let end = close;
  if ((l[close + 1] ?? '').trim() === '') end = close + 1;
  asciiMapLines = end - open + 1;
  l.splice(open, asciiMapLines);
  text = l.join('\n');
  totalDelta -= body.length;
  console.log('R4-8  L' + String(open + 1).padStart(4) + '  -' + body.length + ' chars');
  console.log('        removed the duplicate ASCII site map (' + asciiMapLines + ' lines); Figure E.1 and the prose beneath kept');
}

// The superseded wording must be gone, and each replacement present exactly once.
console.log('\nPOST-CHECKS');
let ok = true;
for (const c of CORRECTIONS) {
  const goneOld = !text.includes(c.before);
  const countNew = text.split(c.after).length - 1;
  const pass = goneOld && countNew === 1;
  if (!pass) ok = false;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${c.id}  old removed: ${goneOld}, new present: ${countNew}x`);
}
const expectedLines = lines.length - asciiMapLines;
const lineCountRight = text.split('\n').length === expectedLines;
console.log(`  ${lineCountRight ? 'PASS' : 'FAIL'}  line count ${lines.length} - ${asciiMapLines} = ${expectedLines} (got ${text.split('\n').length})`);
if (!lineCountRight) ok = false;
const figureKept = text.includes(FIG_E1);
console.log(`  ${figureKept ? 'PASS' : 'FAIL'}  R4-8  Figure E.1 reference intact`);
if (!figureKept) ok = false;
const proseKept = text.includes('Six raised beds along the south fence');
console.log(`  ${proseKept ? 'PASS' : 'FAIL'}  R4-8  layout-rationale prose kept`);
if (!proseKept) ok = false;
const boxDrawing = /[\u2500-\u257f\u2591-\u2593]/.test(text);
console.log(`  ${!boxDrawing ? 'PASS' : 'FAIL'}  R4-8  box-drawing glyphs absent from the book`);
if (boxDrawing) ok = false;

if (!ok) {
  console.error('\nNOT WRITTEN — post-checks failed.');
  process.exit(1);
}

writeFileSync(OUT, text, 'utf8');
const outSha = createHash('sha256').update(text, 'utf8').digest('hex');
console.log(`\ntotal delta : ${totalDelta >= 0 ? '+' : ''}${totalDelta} chars across ${applied.length} sites`);
console.log(`candidate   : ${OUT}`);
console.log(`sha256      : ${outSha}`);
console.log('\nCANDIDATE WRITTEN — nothing applied to production.');
process.exit(0);
