/**
 * DIRT RICH Rev 5 — source-list corrections only.
 *
 * Two changes, both in `Where I Checked`. No prose anywhere in the book is
 * touched, and the Chapter 9 wording frozen in Rev 4 is explicitly left alone.
 *
 * 1. The Colorado State poultry source still carried the UTAH STATE url. Rev 4
 *    replaced the source TITLE line by exact match and never looked at the line
 *    below it, so a poultry citation kept pointing at a human kidney-bean page —
 *    the very mismatch that correction existed to fix. Entries here are
 *    title-then-url pairs; a one-line match is not enough.
 * 2. The black-walnut correction in Chapter 3 cited no sources at all. The two
 *    Extension pages it was actually written from are added to the Chapter 3
 *    group, where the claim lives.
 *
 *   yarn tsx scripts/dirt-rich-rev5-apply.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'C:/Users/jovan/Downloads/dirt rich book';
const SRC = `${DIR}/REV4-CANDIDATE-working-manuscript.md`;
const OUT = `${DIR}/REV5-CANDIDATE-working-manuscript.md`;
const REV4_SHA = '7247b4766de764f28555fd260dd9709dadadaed672715a75b2085bf9065345d7';

const OLD_URL = 'https://extension.usu.edu/nutrition/research/killer-kidney-beans';
const CSU_TITLE = 'Colorado State University Extension, *Raising Poultry the Organic Way* (avoid undercooked or dried beans)';
const CSU_URL = 'https://extension.colostate.edu/resource/raising-poultry-the-organic-way-disease-control-and-feeding/';

/** Last entry of the Chapter 3 group; the walnut sources go after it. */
const COMPOST_ANCHOR = 'https://www.fda.gov/food/food-safety-modernization-act-fsma/raw-manure-under-fsma-final-rule-produce-safety';
const WALNUT_SOURCES = [
  '',
  'University of Wisconsin-Madison Extension, *Landscaping In Spite of Black Walnuts* (juglone breaks down once the material is completely composted)',
  'https://hort.extension.wisc.edu/articles/landscaping-in-spite-of-black-walnuts/',
  '',
  'University of Illinois Extension, *Plants that inhibit other plants* (compost and age walnut material at least six months before use)',
  'https://extension.illinois.edu/blogs/ilriverhort/2018-08-06-plants-inhibit-other-plants',
];

const original = readFileSync(SRC, 'utf8');
const sha = createHash('sha256').update(original, 'utf8').digest('hex');
console.log(`source : ${SRC.split('/').pop()}`);
console.log(`sha256 : ${sha}`);
if (sha !== REV4_SHA) {
  console.error('\nREFUSING — this is not the frozen Rev 4 working manuscript.');
  process.exit(1);
}
console.log('         matches the frozen Rev 4 working manuscript\n');

const lines = original.split('\n');

// ── 1. the mismatched url ─────────────────────────────────────────────────
const titleIdx = lines.indexOf(CSU_TITLE);
if (titleIdx < 0) {
  console.error('R5-1: Colorado State entry not found');
  process.exit(1);
}
// The url must be the line directly beneath its own title, or this is not the
// pairing we think it is.
if (lines[titleIdx + 1] !== OLD_URL) {
  console.error(`R5-1: expected the Utah State url beneath the CSU title, found: ${lines[titleIdx + 1]}`);
  process.exit(1);
}
lines[titleIdx + 1] = CSU_URL;
console.log(`R5-1  L${titleIdx + 2}  url corrected`);
console.log(`        was: ${OLD_URL}`);
console.log(`        now: ${CSU_URL}`);

// ── 2. the missing walnut sources ─────────────────────────────────────────
const anchorIdx = lines.indexOf(COMPOST_ANCHOR);
if (anchorIdx < 0) {
  console.error('R5-2: Chapter 3 compost anchor not found');
  process.exit(1);
}
// Guard the neighbourhood: the anchor must sit inside the Chapter 3 group.
const heading = lines.slice(0, anchorIdx).reverse().find((l) => l.startsWith('### Chapter '));
if (heading !== '### Chapter 3 — Compost') {
  console.error(`R5-2: anchor is under "${heading}", not Chapter 3 — refusing`);
  process.exit(1);
}
lines.splice(anchorIdx + 1, 0, ...WALNUT_SOURCES);
console.log(`\nR5-2  L${anchorIdx + 2}  added 2 sources to "${heading}"`);
for (const l of WALNUT_SOURCES.filter(Boolean)) console.log(`        ${l.slice(0, 96)}`);

const text = lines.join('\n');

console.log('\nPOST-CHECKS');
const checks: Array<[string, boolean, string]> = [
  ['Utah State url gone from the book', !text.includes(OLD_URL), ''],
  ['CSU url present exactly once', text.split(CSU_URL).length - 1 === 1, ''],
  ['CSU url sits under the CSU title', text.includes(`${CSU_TITLE}\n${CSU_URL}`), ''],
  ['Wisconsin source present', text.includes('landscaping-in-spite-of-black-walnuts'), ''],
  ['Illinois source present', text.includes('2018-08-06-plants-inhibit-other-plants'), ''],
  ['walnut sources are under Chapter 3', text.indexOf('landscaping-in-spite') > text.indexOf('### Chapter 3 — Compost') &&
    text.indexOf('landscaping-in-spite') < text.indexOf('### Chapter 5 — Chickens'), ''],
  ['line count +6', lines.length === original.split('\n').length + 6, `${lines.length}`],
];
// Nothing outside the source list may move.
const cut = original.indexOf('## Where I Checked');
const bodyUnchanged = text.slice(0, cut) === original.slice(0, cut);
checks.push(['every page before the source list byte-identical', bodyUnchanged, '']);
// Rev 4's Chapter 9 wording is explicitly retained.
checks.push(['Rev 4 Chapter 9 wording retained', text.includes('In my experience almost all of this'), '']);

for (const [l, ok, d] of checks) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ` ${d}` : ''}`);
if (!checks.every(([, ok]) => ok)) {
  console.error('\nNOT WRITTEN — post-checks failed.');
  process.exit(1);
}

writeFileSync(OUT, text, 'utf8');
const outSha = createHash('sha256').update(text, 'utf8').digest('hex');
console.log(`\ncandidate : ${OUT}`);
console.log(`sha256    : ${outSha}`);
console.log('\nCANDIDATE WRITTEN — nothing applied to production.');
process.exit(0);
