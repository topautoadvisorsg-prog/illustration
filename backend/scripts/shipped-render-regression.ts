/**
 * SHIPPED-BOOK RENDER REGRESSION — the engine changes must not move a page.
 *
 * `c1-regression.ts` proves the PARSE did not move. This proves the RENDER did
 * not, which is the claim that actually matters: it re-renders the shipped
 * typeset book on its own pinned standard and compares against the numbers that
 * standard was approved on.
 *
 * SPEC amendment 3: the criterion is structural, not a PDF hash. Page count,
 * parity blanks, overflow and section coverage are what a reader would notice;
 * a byte difference from a timestamp is not.
 *
 *   yarn tsx scripts/shipped-render-regression.ts
 *
 * Needs CHROMIUM_PATH on Windows. Local and free.
 */
import { readFileSync, existsSync } from 'node:fs';
import { ProjectConfigSchema } from '@wildlands/shared';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from '../src/pipeline/typeset/layout-standards/educational-nonfiction-v1.js';

/*
 * MEASURED on the PRISTINE tree (engine changes stashed) with THIS harness, on
 * 2026-08-16. That is the honest baseline for a before/after.
 *
 * It is NOT 155/14. The v1 header records "155 pages, 14 parity blanks" for the
 * APPROVED build, which was produced with the book's real publication metadata;
 * this harness passes a minimal config, so the generated front matter differs
 * and the page count and parity blanks move with it. Verified by rendering the
 * pristine tree and getting 163/10 as well, so the difference is the harness,
 * not the engine.
 *
 * What this script proves is before == after. It is not a re-approval of the
 * book, and it must not be read as one.
 */
const APPROVED = { pages: 163, blanks: 10, overflow: 0, sections: 28 };

const PATH = 'C:/Users/jovan/Downloads/puberty boy book/no-one-told-me-that-MANUSCRIPT.md';
if (!existsSync(PATH)) {
  console.log(`SKIPPED — manuscript not on disk: ${PATH}`);
  process.exit(0);
}

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'NO ONE TOLD ME THAT',
  authorName: 'Nolan Whitlow',
  trimSize: EDUCATIONAL_NONFICTION_TYPESET_V1.trim,
  typography: {
    bodyPt: EDUCATIONAL_NONFICTION_TYPESET_V1.type.bodyPt,
    lineHeight: EDUCATIONAL_NONFICTION_TYPESET_V1.type.lineHeight,
    headingFont: EDUCATIONAL_NONFICTION_TYPESET_V1.type.headingFont,
    bodyFont: EDUCATIONAL_NONFICTION_TYPESET_V1.type.bodyFont,
  },
  typesetLayoutStandardId: EDUCATIONAL_NONFICTION_TYPESET_V1.id,
});

console.log(`NO ONE TOLD ME THAT — re-render on ${EDUCATIONAL_NONFICTION_TYPESET_V1.id}\n`);
const r = await renderTypesetBook({
  markdown: readFileSync(PATH, 'utf8'),
  config,
  layoutStandard: EDUCATIONAL_NONFICTION_TYPESET_V1,
  chaptersStartRecto: EDUCATIONAL_NONFICTION_TYPESET_V1.chaptersStartRecto,
  frontMatter: {},
});

const got = {
  pages: r.report.totalPages,
  blanks: r.report.blankPages.length,
  overflow: r.report.verticalOverflowPages.length,
  sections: r.report.sectionStarts.length,
};

let bad = 0;
for (const k of Object.keys(APPROVED) as (keyof typeof APPROVED)[]) {
  const ok = got[k] === APPROVED[k];
  if (!ok) bad++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${k.padEnd(9)} approved ${APPROVED[k]}  ->  now ${got[k]}`);
}

/**
 * The new capabilities must leave no trace in a book whose standard declares
 * none of them.
 *
 * Scoped to the stylesheet WE generate, not the whole document: the rendered
 * HTML inlines the Paged.js polyfill, which contains the string `overflow-wrap`
 * three times in its own source. Checking the full document reported a rule we
 * never emitted.
 */
const styleStart = r.html.indexOf('<style');
const ourCss = r.html.slice(styleStart, r.html.indexOf('</style>', styleStart));
const traces: [string, boolean][] = [
  ['<wbr> break opportunities', r.html.includes('<wbr>')],
  ['overflow-wrap rule', ourCss.includes('overflow-wrap')],
  ['table markup', r.html.includes('tset-table')],
  ['preformatted markup', r.html.includes('tset-pre')],
  ['DejaVu Sans Mono embedded', r.html.includes("font-family:'DejaVu Sans Mono'")],
];
console.log('');
for (const [what, present] of traces) {
  if (present) bad++;
  console.log(`  ${present ? 'FAIL' : 'PASS'}  no ${what}`);
}

// Horizontal overflow is a NEW measurement. It does not change the page, but if
// it fires on an already-approved book that is worth knowing about — reported,
// not failed, because the book shipped and the check did not exist then.
console.log(
  `\n  note: horizontal-overflow check (new) reports ${r.report.horizontalOverflow.length} element(s)` +
    (r.report.horizontalOverflow.length
      ? `: ${r.report.horizontalOverflow.slice(0, 3).map((h) => `p${h.page} ${h.tag} +${h.overflowPx}px "${h.preview.slice(0, 40)}"`).join('; ')}`
      : ''),
);

console.log(`\n${bad === 0 ? 'RENDER REGRESSION: NONE' : `RENDER REGRESSION: ${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);
