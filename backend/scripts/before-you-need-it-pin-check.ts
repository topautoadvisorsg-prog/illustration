/**
 * BEFORE YOU NEED IT — is @3 safe to pin for this book?
 *
 * The first proof run showed @2 and @3 produce DIFFERENT HTML at the same page
 * count. The cause is 2 `<wbr>` marks in one token — the email address
 * `info@allianceforeatingdisorders.com.`, 36 characters, over @3's 28-character
 * long-token threshold. rev-16 has no bare URLs, so this is the only token in
 * the book the policy touches.
 *
 * Same page count is not the same book. A `<wbr>` is a break OPPORTUNITY: if the
 * line it sits on was already tight, the line can break there instead of at the
 * previous space, moving text without moving the page total.
 *
 * So this compares the two renders with `deepProbe`, which reports every block's
 * line BOXES after pagination — the platform's own instrument for proving that
 * a change touching text metrics did not move a single line.
 *
 * PASS means @3 is @2 for this manuscript, plus one inert break opportunity, and
 * the pin is safe. FAIL names the blocks that moved.
 *
 *   yarn tsx scripts/before-you-need-it-pin-check.ts
 *
 * Local and free. No database, no network, no model calls.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { ProjectConfigSchema } from '@wildlands/shared';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V2 } from '../src/pipeline/typeset/layout-standards/educational-nonfiction-v2.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V3 } from '../src/pipeline/typeset/layout-standards/educational-nonfiction-v3.js';

const BOOK = 'C:/Users/jovan/Downloads/before-you-need-it';
const MANUSCRIPT = `${BOOK}/BEFORE-YOU-NEED-IT_FINAL.md`;
const EXPECTED_SHA = 'b9cdbae4787f38f2052a5c4081306287d5ab7f116468a5871c74a87e5e959846';

const md = readFileSync(MANUSCRIPT, 'utf8');
const sha = createHash('sha256').update(readFileSync(MANUSCRIPT)).digest('hex');
if (sha !== EXPECTED_SHA) {
  console.error(`ABORT: not rev-16 (${sha})`);
  process.exit(2);
}

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'Before You Need It',
  subtitle: "A Mother's Honest Guide to Periods, Puberty, and Everything Nobody Explains",
  authorName: 'Margo Teale',
  productionProfileId: 'bw-educational-nonfiction',
  trimSize: EDUCATIONAL_NONFICTION_TYPESET_V3.trim,
  typography: {
    bodyPt: EDUCATIONAL_NONFICTION_TYPESET_V3.type.bodyPt,
    lineHeight: EDUCATIONAL_NONFICTION_TYPESET_V3.type.lineHeight,
    headingFont: EDUCATIONAL_NONFICTION_TYPESET_V3.type.headingFont,
    bodyFont: EDUCATIONAL_NONFICTION_TYPESET_V3.type.bodyFont,
  },
  typesetLayoutStandardId: EDUCATIONAL_NONFICTION_TYPESET_V3.id,
});

const run = async (standard: typeof EDUCATIONAL_NONFICTION_TYPESET_V3) => {
  console.log(`rendering ${standard.id} with deepProbe...`);
  return renderTypesetBook({
    markdown: md,
    config,
    layoutStandard: standard,
    chaptersStartRecto: standard.chaptersStartRecto,
    frontMatter: {},
    deepProbe: true,
  });
};

const a = await run(EDUCATIONAL_NONFICTION_TYPESET_V2);
const b = await run(EDUCATIONAL_NONFICTION_TYPESET_V3);

const key = (p: { blockId: string; frag: number }) => `${p.blockId}#${p.frag}`;
const ap = new Map((a.probe ?? []).map((p) => [key(p), p]));
const bp = new Map((b.probe ?? []).map((p) => [key(p), p]));

const moved: string[] = [];
const textChanged: string[] = [];
const onlyIn: string[] = [];

for (const [k, pa] of ap) {
  const pb = bp.get(k);
  if (!pb) {
    onlyIn.push(`@2 only: ${k}`);
    continue;
  }
  if (pa.textSha !== pb.textSha) textChanged.push(`${k} (p${pa.page} -> p${pb.page})`);
  const la = JSON.stringify(pa.lines);
  const lb = JSON.stringify(pb.lines);
  if (la !== lb || pa.page !== pb.page) {
    moved.push(
      `${k} kind=${pa.kind} p${pa.page}->p${pb.page} ` +
        `lines ${pa.lines.length}->${pb.lines.length}`,
    );
  }
}
for (const k of bp.keys()) if (!ap.has(k)) onlyIn.push(`@3 only: ${k}`);

console.log('\n─── @2 vs @3, this manuscript ───');
console.log(`  pages:            ${a.report.totalPages} vs ${b.report.totalPages}`);
console.log(`  blocks probed:    ${ap.size} vs ${bp.size}`);
console.log(`  blocks only in one: ${onlyIn.length}`);
console.log(`  text differs:     ${textChanged.length}`);
console.log(`  line boxes moved: ${moved.length}`);

if (moved.length) {
  console.log('\n  moved blocks (first 20):');
  for (const m of moved.slice(0, 20)) console.log(`    ${m}`);
  /**
   * Tell a REAL line move from a probe artifact.
   *
   * `<wbr>` is a zero-width element, and `getClientRects()` splits a range at
   * inline element boundaries whether or not the line actually breaks there. So
   * inserting two `<wbr>` can raise the rect COUNT by two while every distinct
   * line TOP, and the block's bottom edge, stay exactly where they were. That is
   * a measurement change, not a typography change.
   */
  console.log('\n  ─ geometry of moved blocks ─');
  for (const m of moved.slice(0, 3)) {
    const k = m.split(' ')[0]!;
    const pa = ap.get(k)!;
    const pb = bp.get(k)!;
    const tops = (p: typeof pa): number[] =>
      [...new Set(p.lines.map((l) => l[0]))].sort((x, y) => x - y);
    const ta = tops(pa);
    const tb = tops(pb);
    console.log(`    ${k}`);
    console.log(`      @2 rects=${pa.lines.length} distinctTops=${ta.length} bottomPx=${pa.bottomPx}`);
    console.log(`      @3 rects=${pb.lines.length} distinctTops=${tb.length} bottomPx=${pb.bottomPx}`);
    console.log(`      identical distinct tops: ${JSON.stringify(ta) === JSON.stringify(tb)}`);
    console.log(`      identical bottom edge:   ${pa.bottomPx === pb.bottomPx}`);
  }
}
if (textChanged.length) {
  console.log('\n  text-changed blocks (first 20):');
  for (const m of textChanged.slice(0, 20)) console.log(`    ${m}`);
}

const ok =
  a.report.totalPages === b.report.totalPages &&
  onlyIn.length === 0 &&
  moved.length === 0 &&
  textChanged.length === 0;

console.log(
  `\n  ${ok ? 'PASS' : 'FAIL'} — @3 ${ok ? 'is line-for-line identical to @2 here; the pin is safe' : 'MOVES TYPE relative to @2; the pin needs a decision'}`,
);

writeFileSync(
  `${BOOK}/06-PRODUCTION/pin-check-v2-vs-v3.json`,
  JSON.stringify(
    {
      manuscriptSha: sha,
      pagesV2: a.report.totalPages,
      pagesV3: b.report.totalPages,
      blocksV2: ap.size,
      blocksV3: bp.size,
      onlyIn,
      textChanged,
      moved,
      ok,
    },
    null,
    2,
  ),
);
console.log(`report -> ${BOOK}/06-PRODUCTION/pin-check-v2-vs-v3.json`);
process.exit(ok ? 0 : 1);
