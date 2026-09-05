/**
 * TRAIN THE DOG YOU'VE GOT — geometry resolution, and the KDP diff.
 *
 * This script decides NOTHING. It calls the platform's one geometry resolver,
 * reads the page count out of the interior that is actually shipping, and diffs
 * every resolved figure against a reading taken from Amazon's own Cover
 * Calculator for this exact configuration.
 *
 * WHY THE DIFF EXISTS. Our spine and wrap come from Amazon's published FORMULA.
 * A formula is a claim about what the template will say; it is not the template.
 * The standing instruction is that where the two disagree, KDP's generated
 * output wins and the resolver is corrected. So the calculator reading is pinned
 * here as a dated fixture and this script exits non-zero if the resolver drifts
 * away from it.
 *
 *   yarn tsx scripts/train-the-dog-cover/geometry-check.ts
 *
 * Local and free: no model, no network. The calculator reading was taken by hand
 * and recorded below rather than re-fetched, so the check is reproducible
 * offline and cannot silently change under us.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolveCoverGeometry } from '../../src/pipeline/cover/compositor/geometry.js';
import { readInteriorPageCount } from '../../src/pipeline/cover/compositor/build-cover.js';
import { BOOK, COVER_DIR, INTERIOR_PDF, KDP_CONFIG } from './book.js';

/**
 * READ FROM https://kdp.amazon.com/en_US/cover-calculator ON 2026-08-31, for
 * Paperback / Black & white / White paper / Left to Right / Inches / 6 x 9 in /
 * 186 pages. Amazon reports to three decimal places.
 *
 * This is the authority. Anything the resolver says that contradicts it is a
 * resolver bug, not a calculator bug.
 */
export const KDP_CALCULATOR_READING = {
  retrieved: '2026-08-31',
  source: 'https://kdp.amazon.com/en_US/cover-calculator',
  configuration: 'PAPERBACK / BLACK_AND_WHITE / WHITE / LEFT_TO_RIGHT / INCHES / 6x9in / 186pp',
  rows: [
    { n: 1, description: 'Full Cover', widthIn: 12.669, heightIn: 9.25 },
    { n: 2, description: 'Front Cover', widthIn: 6, heightIn: 9 },
    { n: 3, description: 'Safe Area', widthIn: 5.875, heightIn: 8.75 },
    { n: 4, description: 'Bleed', widthIn: 0.125, heightIn: 0.125 },
    { n: 5, description: 'Margin', widthIn: 0.125, heightIn: 0.125 },
    { n: 6, description: 'Spine', widthIn: 0.419, heightIn: 9 },
    { n: 7, description: 'Spine Safe Area', widthIn: 0.294, heightIn: 8.75 },
    { n: 8, description: 'Spine Margin', widthIn: 0.062, heightIn: 0.062 },
    { n: 9, description: 'Barcode Margin', widthIn: 0.25, heightIn: 0.25 },
  ],
} as const;

const pageCount = await readInteriorPageCount(readFileSync(INTERIOR_PDF));
const g = resolveCoverGeometry({ ...KDP_CONFIG, pageCount });

/**
 * Amazon prints three decimals, so two figures agree when they cannot be told
 * apart at three decimals — i.e. within half of the last displayed digit.
 *
 * NOT string equality on `toFixed(3)`. The fold variance is exactly 0.0625in,
 * an exact tie at the third decimal, and the calculator prints 0.062 where
 * `toFixed` gives "0.063". Amazon is resolving the tie half-to-even; every
 * other row here is a non-tie and rounds the same way under either rule. A
 * string compare reports that as a disagreement and would have sent someone to
 * "correct" a resolver that is carrying Amazon's own published 0.0625.
 */
const DISPLAY_TOLERANCE_IN = 0.0005 + 1e-9;
const agrees = (ours: number, theirs: number) => Math.abs(ours - theirs) <= DISPLAY_TOLERANCE_IN;
const kdp = (d: string) => KDP_CALCULATOR_READING.rows.find((r) => r.description === d)!;

interface Row {
  item: string;
  ours: string;
  kdp: string;
  verdict: 'MATCH' | 'DIFFERS' | 'STRICTER';
  note: string;
}

const rows: Row[] = [];
const cmp = (item: string, ours: number, theirs: number, note = '') =>
  rows.push({
    item,
    ours: ours.toFixed(6),
    kdp: theirs.toFixed(3),
    verdict: agrees(ours, theirs) ? 'MATCH' : 'DIFFERS',
    note,
  });

cmp('Full cover width', g.fullWidthIn, kdp('Full Cover').widthIn);
cmp('Full cover height', g.fullHeightIn, kdp('Full Cover').heightIn);
cmp('Front cover width', g.panelWidthIn, kdp('Front Cover').widthIn);
cmp('Front cover height', g.panelHeightIn, kdp('Front Cover').heightIn);
cmp('Spine width', g.spineIn, kdp('Spine').widthIn);
cmp('Spine height (panel)', g.panelHeightIn, kdp('Spine').heightIn);
cmp('Bleed', g.outerMarginIn, kdp('Bleed').widthIn);
cmp(
  'Spine margin / fold variance',
  g.foldVarianceIn,
  kdp('Spine Margin').widthIn,
  'Exact tie at three decimals: ours is Amazon’s published 0.0625in (1.6mm), which the calculator displays as 0.062. Same number, shown to fewer places.',
);
cmp('Spine safe width', g.spineSafe.widthIn, kdp('Spine Safe Area').widthIn);

/**
 * DIVERGENCE 1 — the safe area, and it is ours on purpose.
 *
 * The calculator's "Safe Area" is the trim less its 0.125in "Margin": 6 - 0.125
 * = 5.875 wide, taken off the OUTSIDE edge only since the inner edge is a fold
 * and not a cut, and 9 - 0.25 = 8.75 tall. Our resolver insets 0.25in on all
 * four sides of each panel and gets 5.5 x 8.5.
 *
 * Ours is the SMALLER box, and it is not invented: Amazon's paperback
 * submission page says in prose that content you do not intend to be trimmed off
 * should be at least 0.25in from the outside cover edge. The calculator row and
 * the prose guidance are two different Amazon statements, and the prose is the
 * stricter of the two. Adopting 5.875 x 8.75 would move type CLOSER to the
 * knife, so "KDP wins" does not bite here: there is nothing that would make our
 * cover wrong, only something that would make it riskier.
 *
 * Recorded, not silently absorbed.
 */
const kdpSafeW = kdp('Front Cover').widthIn - kdp('Margin').widthIn;
const kdpSafeH = kdp('Front Cover').heightIn - kdp('Margin').heightIn * 2;
rows.push({
  item: 'Front safe area',
  ours: `${g.frontSafe.widthIn.toFixed(3)}x${g.frontSafe.heightIn.toFixed(3)}`,
  kdp: `${kdpSafeW.toFixed(3)}x${kdpSafeH.toFixed(3)}`,
  verdict: 'STRICTER',
  note:
    'We inset 0.25in on all four sides; the calculator insets its 0.125in Margin, and only on the outside edge. ' +
    'Ours is the smaller box. Amazon’s own prose asks for 0.25in from the outside cover edge, so we are holding ' +
    'the tighter of Amazon’s two statements rather than contradicting either.',
});

/**
 * DIVERGENCE 2 — the spine-safe RECT, which is a shared-proof cosmetic and not
 * a production number.
 *
 * `resolveCoverGeometry` gives the paperback spine-safe rectangle the full wrap
 * height, bleed included, where KDP's template shows 8.750in. Nothing sizes type
 * from that rect: `buildCover` confines spine type to panelHeight - 2 x
 * safeInset = 8.500in, which is tighter than KDP's figure. So the effect is
 * confined to a band drawn slightly too long on the shared guided proof.
 *
 * It is the puberty book's repo, and correcting it there is a change to shared
 * code this book was told not to make. It is reported here, and THIS build draws
 * its own band at KDP's 8.750in.
 */
rows.push({
  item: 'Spine safe height (rect)',
  ours: `${g.spineSafe.heightIn.toFixed(3)} (spans bleed)`,
  kdp: kdp('Spine Safe Area').heightIn.toFixed(3),
  verdict: 'DIFFERS',
  note:
    'Shared-proof cosmetic only: no production number is derived from this rect. Spine TYPE is separately confined ' +
    'to 8.500in, tighter than KDP’s 8.750in. This build draws its own spine band at KDP’s 8.750in. ' +
    'Not corrected upstream because that is shared code the puberty book depends on.',
});

/** Only a disagreement on a number something is BUILT from can block. */
const blocking = rows.filter((r) => r.verdict === 'DIFFERS' && r.item !== 'Spine safe height (rect)');

function wrap(s: string, w: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    if (cur && `${cur} ${word}`.length > w) {
      lines.push(cur);
      cur = word;
    } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) lines.push(cur);
  return lines;
}

const out: string[] = [];
out.push('');
out.push(`KDP GEOMETRY CHECK — ${BOOK}`);
out.push('='.repeat(78));
out.push(`  interior       ${INTERIOR_PDF}`);
out.push(`  page count     ${pageCount}  (read from the PDF, not supplied)`);
out.push(`  configuration  ${KDP_CALCULATOR_READING.configuration}`);
out.push(`  KDP reading    ${KDP_CALCULATOR_READING.source}`);
out.push(`                 retrieved ${KDP_CALCULATOR_READING.retrieved}`);
out.push(`  authority      ${g.spineAuthority}`);
out.push(`  source         ${g.spineSource}`);
out.push('');
out.push('  ITEM                            RESOLVER          KDP          VERDICT');
out.push(`  ${'-'.repeat(72)}`);
for (const r of rows) {
  out.push(`  ${r.item.padEnd(30)}  ${r.ours.padEnd(16)}  ${r.kdp.padEnd(11)}  ${r.verdict}`);
  if (r.note) for (const line of wrap(r.note, 66)) out.push(`        ${line}`);
}
out.push('');
out.push(
  blocking.length === 0
    ? '  NO BLOCKING DISAGREEMENT. Every figure the cover is built from matches KDP.'
    : `  RESOLVER MUST BE CORRECTED — ${blocking.length} built-from figure(s) disagree with KDP.`,
);
out.push('');
console.log(out.join('\n'));

mkdirSync(COVER_DIR, { recursive: true });
writeFileSync(
  `${COVER_DIR}/KDP-GEOMETRY-CHECK.json`,
  `${JSON.stringify({ pageCount, kdp: KDP_CALCULATOR_READING, resolver: g, comparison: rows }, null, 2)}\n`,
);
console.log(`  written -> ${COVER_DIR}/KDP-GEOMETRY-CHECK.json\n`);
process.exit(blocking.length === 0 ? 0 : 1);
