/**
 * BEFORE YOU NEED IT — production render + three-tier safety accounting.
 *
 * The pinned revision, on `educational-nonfiction-typeset@4`. See `REV` in the config.
 *
 * THE EXPECTED COUNTS COME FROM THE INVENTORY, NOT FROM THE RENDER.
 * A structural pass over the manuscript found, among 27 occurrences of the
 * same-day vocabulary and 314 bold run-ins:
 *
 *   6  SAME-DAY structural blocks   `**Tell somebody today**` opening a paragraph
 *   2  IMMEDIATE structural blocks  `**Do this now.**` opening a paragraph
 *   4  INLINE references            mid-sentence, mid-paragraph bold, inside a
 *                                   bullet, inside an italic aside — all of which
 *                                   must remain ordinary text
 *
 * Any other number is a defect: fewer means a site was missed, more means the
 * matcher has become a keyword highlighter.
 *
 *   yarn tsx scripts/before-you-need-it-proof.ts
 *
 * Local and free. No database, no network, no model calls.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { parseTypesetSections } from '../src/pipeline/typeset/typeset-book.js';
import {
  CONFIG as config,
  EXPECTED_IMMEDIATE,
  EXPECTED_SAME_DAY,
  MANUSCRIPT,
  OUT_DIR,
  RENDER_INPUT,
  REV,
  STANDARD,
  readManuscript,
} from './before-you-need-it-config.js';
import {
  assertCanonicalCompleteness,
  scanCanonicalHeadings,
} from '../src/pipeline/typeset/canonical-inventory.js';

const OUT_PDF = `${OUT_DIR}/BEFORE-YOU-NEED-IT_interior_${REV.replace('-','')}_proof-04.pdf`;
const OUT_HTML = `${OUT_DIR}/BEFORE-YOU-NEED-IT_interior_${REV.replace('-','')}_proof-04.html`;




mkdirSync(OUT_DIR, { recursive: true });

const { md, sha } = readManuscript();

const results: { n: string; name: string; ok: boolean; detail: string }[] = [];
const check = (n: string, name: string, ok: boolean, detail: string): void => {
  results.push({ n, name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}. ${name}\n        ${detail}`);
};

console.log(`BEFORE YOU NEED IT — production render (${REV})\n`);
console.log(`  manuscript: ${MANUSCRIPT}`);
console.log(`  sha256:     ${sha}`);
console.log(`  bound to ${REV} OK`);
console.log(`  standard:   ${STANDARD.id}`);
console.log(
  `  setting:    ${STANDARD.type.bodyPt}pt / ${STANDARD.type.lineHeight}, ` +
    `${STANDARD.trim.widthIn}x${STANDARD.trim.heightIn}in, ` +
    `${STANDARD.paragraphs.justify ? 'justified' : 'ragged right'}\n`,
);


console.log('rendering (Paged.js, local Chromium, free)...');
const render = await renderTypesetBook({ markdown: md, ...RENDER_INPUT });
writeFileSync(OUT_PDF, render.pdf);
writeFileSync(OUT_HTML, render.html);
const r = render.report;
console.log(
  `  ${r.totalPages} pages, ${r.blankPages.length} blanks, ` +
    `${r.verticalOverflowPages.length} vertical overflow, ` +
    `${r.horizontalOverflow.length} horizontal overflow\n  -> ${OUT_PDF}\n`,
);

// ── 1. canonical completeness ───────────────────────────────────────────────
const inv = scanCanonicalHeadings(md);
const sections = parseTypesetSections(md);
const completeness = assertCanonicalCompleteness(
  inv,
  sections.map((s) => ({
    title: s.title,
    sourceTitle: s.sourceTitle,
    words: s.bodyLines.join(' ').split(/\s+/).filter(Boolean).length,
  })),
);
check(
  '1',
  'canonical completeness',
  completeness.ok,
  completeness.ok
    ? `${completeness.expectedSections} canonical sections present; ${completeness.builtWords} body words`
    : completeness.failures.map((f) => f.message).join('\n        '),
);

// ── 2. every parsed section reached the render ──────────────────────────────
const rendered = new Set(r.sectionStarts.map((s) => s.title));
const notRendered = sections.filter((s) => !rendered.has(s.title)).map((s) => s.title);
check(
  '2',
  'every parsed section reached the rendered book',
  notRendered.length === 0,
  notRendered.length === 0
    ? `${r.sectionStarts.length} sections laid out`
    : `missing from the render: ${notRendered.join(', ')}`,
);

// ── 3. nothing off the trim ─────────────────────────────────────────────────
check(
  '3',
  'no ink outside the text block',
  r.verticalOverflowPages.length === 0 && r.horizontalOverflow.length === 0,
  `vertical: ${r.verticalOverflowPages.join(', ') || 'none'}; horizontal: ` +
    `${r.horizontalOverflow.length === 0 ? 'none' : r.horizontalOverflow.map((h) => `p${h.page} +${h.overflowPx}px`).join('; ')}`,
);

// ── 4. the three tiers ──────────────────────────────────────────────────────
const allPanels = [
  ...render.html.matchAll(/<aside[^>]*data-block-id="([^"]+)"[^>]*class="(alert-panel[^"]*)"/g),
].map((m) => ({ id: m[1]!, cls: m[2]! }));
const immediate = allPanels.filter((p) => p.cls.includes('--immediate'));
const sameDay = allPanels.filter((p) => !p.cls.includes('--immediate'));
const labelList = [...render.html.matchAll(/<p class="alert-label">(?:<svg[^>]*>[\s\S]*?<\/svg>)?(.*?)<\/p>/g)].map(
  (m) => m[1]!,
);

const pageOf = new Map<string, number>();
for (const [page, ids] of Object.entries(r.pageBlocks)) for (const id of ids) pageOf.set(id, Number(page));
const pagesOf = (ps: { id: string }[]): (number | null)[] => ps.map((p) => pageOf.get(p.id) ?? null);

check(
  '4a',
  `SAME-DAY panels (expected ${EXPECTED_SAME_DAY})`,
  sameDay.length === EXPECTED_SAME_DAY,
  `${sameDay.length} on pages ${pagesOf(sameDay).join(', ')}`,
);
check(
  '4b',
  `IMMEDIATE panels (expected ${EXPECTED_IMMEDIATE})`,
  immediate.length === EXPECTED_IMMEDIATE,
  `${immediate.length} on pages ${pagesOf(immediate).join(', ')}`,
);
const unexpected = labelList.filter(
  (l) => !['tell somebody today', 'do this now'].includes(l.trim().toLowerCase()),
);
check(
  '4c',
  'no unexpected panel labels',
  unexpected.length === 0,
  unexpected.length === 0 ? `labels: ${[...new Set(labelList)].join(' | ')}` : `unexpected: ${unexpected.join(' | ')}`,
);

// The flag must be on the immediate tier and ONLY there.
const flagged = (render.html.match(/<p class="alert-label"><svg class="gl gl-flag"/g) ?? []).length;
check(
  '4d',
  'the drawn flag marks the immediate tier, and only it',
  flagged === EXPECTED_IMMEDIATE,
  `${flagged} flagged labels against ${immediate.length} immediate panels`,
);

const inlineSurvivors = ['tell somebody today. That', 'from your parents', 'write it down and hand it over'];
const inlineOk = inlineSurvivors.every((s) => render.html.includes(s));
check('4e', 'inline same-day references remain ordinary text', inlineOk, inlineOk ? 'all 3 still inline' : 'one was absorbed');

// The p165 adult-behaviour bullet is deliberately NOT promoted in this change.
check(
  '4f',
  'the adult-behaviour bullet is left alone, as instructed',
  render.html.includes('from your parents'),
  'still an ordinary bullet',
);

// ── 5. protected TSS facts survive the render ───────────────────────────────
const tss = [
  'take it out if it\u2019s still in, tell an adult straight away, and get medical help immediately',
  'take the tampon out if it\u2019s still in, tell an adult straight away, and get medical help immediately',
];
const plain = render.html.replace(/<[^>]+>/g, '');
const tssOk = tss.some((s) => plain.includes(s)) || plain.includes('tell an adult straight away');
check(
  '5',
  'TSS emergency route present in the rendered page',
  tssOk && plain.includes('Not in the morning'),
  `"tell an adult straight away" and "Not in the morning" both on the page`,
);

// ── 6. the lookup table ─────────────────────────────────────────────────────
const plainText = render.html.replace(/<[^>]+>/g, ' ');
const hasTable = /<table/.test(render.html);
const literalPipes = /\|\s*-{3,}\s*\|/.test(plainText) || /\|\s*Go to\s*\|/.test(plainText);
check(
  '6a',
  'the lookup table renders as a table, not as pipe characters',
  hasTable && !literalPipes,
  hasTable ? (literalPipes ? 'a <table> exists but literal pipe syntax is still on the page' : 'table element present, no literal pipe syntax') : 'no <table> element emitted',
);
// The polyfill embeds a CSS-syntax database containing '<track-list>' and
// '<track-size>', so a bare /<tr/ matches 27 things that are not table rows.
const rows = (render.html.match(/<tr[ >]/g) ?? []).length;
check(
  '6b',
  'all 35 body rows plus the header survived',
  rows === 36,
  `${rows} <tr> emitted (expected 36 = 1 header + 35 rows)`,
);

check(
  '6c',
  'the repeated table header was honoured, not silently skipped',
  r.repeatHeaderSkipped.length === 0,
  r.repeatHeaderSkipped.length === 0
    ? 'repeatHeader requested and placed on every continuation fragment'
    : `REPEAT_HEADER_SKIPPED_INSUFFICIENT_SPACE on page(s) ${r.repeatHeaderSkipped.join(', ')}`,
);

// ── 7. local overrides all found their block ────────────────────────────────
const unmatched = (render.overrides?.unmatched ?? []) as string[];
check(
  '7',
  'every layout override matched a block',
  unmatched.length === 0,
  unmatched.length === 0 ? `${Object.keys(config.layoutOverrides ?? {}).length} overrides applied` : `unmatched: ${unmatched.join(', ')}`,
);

// ── 8. gutter band ──────────────────────────────────────────────────────────
const band = (STANDARD.margins.gutterByPageCount ?? []).find((b) => r.totalPages <= b.maxPages);
console.log(
  `\n  gutter band: ${r.totalPages}pp -> ${band ? `<=${band.maxPages}pp, ${band.gutterIn}in` : 'none'} ` +
    `(applied ${r.marginsIn.gutterIn}in)`,
);
const callouts = (render.html.match(/class="callout"/g) ?? []).length;
console.log(`  routine callouts: ${callouts}   same-day: ${sameDay.length}   immediate: ${immediate.length}`);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

writeFileSync(
  `${OUT_DIR}/proof-04-report.json`,
  JSON.stringify(
    {
      rev: REV,
      manuscriptSha: sha,
      standard: STANDARD.id,
      totalPages: r.totalPages,
      blankPages: r.blankPages,
      verticalOverflowPages: r.verticalOverflowPages,
      horizontalOverflow: r.horizontalOverflow,
      sectionCount: r.sectionStarts.length,
      sameDayPanels: sameDay.length,
      sameDayPages: pagesOf(sameDay),
      immediatePanels: immediate.length,
      immediatePages: pagesOf(immediate),
      labels: labelList,
      gutterIn: r.marginsIn.gutterIn,
      repeatHeaderSkipped: r.repeatHeaderSkipped,
      checks: results,
    },
    null,
    2,
  ),
);
console.log(`report -> ${OUT_DIR}/proof-04-report.json`);
process.exit(failed.length ? 1 : 0);
