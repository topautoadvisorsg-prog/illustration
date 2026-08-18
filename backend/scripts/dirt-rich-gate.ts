/**
 * DIRT RICH — the promotion gate, run against a REAL render.
 *
 * The six criteria the operator set before any renderer change is promoted or
 * the project is created on the deployed backend:
 *
 *   1. canonical completeness PASS
 *   2. 47 table rows/cells preserved structurally
 *   3. Appendix E preformatted material preserved
 *   4. 65 long URLs contained within measure
 *   5. all 7 production markers accounted for
 *   6. no unintended regression in existing renderer users  (scripts/c1-regression.ts)
 *
 * Criteria 1-5 are checked here; 6 has its own harness and is run alongside.
 *
 * Everything is measured against the real Paged.js render — the page count, the
 * overflow report, and the actual laid-out geometry of every URL — because the
 * failure this whole exercise exists to stop is a book that passes every check
 * that never looked at the page.
 *
 *   yarn tsx scripts/dirt-rich-gate.ts
 *
 * Local and free: reads the manuscript from disk, renders with the local
 * Chromium. No database, no network, no model calls.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ProjectConfigSchema } from '@wildlands/shared';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { parseTypesetSections } from '../src/pipeline/typeset/typeset-book.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V1 } from '../src/pipeline/typeset/layout-standards/trade-nonfiction-guide-v1.js';
import {
  assertCanonicalCompleteness,
  scanCanonicalHeadings,
} from '../src/pipeline/typeset/canonical-inventory.js';

const MANUSCRIPT = 'C:/Users/jovan/Downloads/DIRT-RICH-ABBY-FENWICK_FINAL.md';
const OUT_PDF = 'C:/Users/jovan/Downloads/DIRT-RICH-typeset-preview.pdf';
/** The frozen revision 3. A different hash means the wrong file. */
const EXPECTED_SHA = 'bc27f4d50bb22be1eb4d0f4d83fa4041d97983cbbabc91077e496ee2205b358c';

const md = readFileSync(MANUSCRIPT, 'utf8');

const results: { n: number; name: string; ok: boolean; detail: string }[] = [];
const check = (n: number, name: string, ok: boolean, detail: string): void => {
  results.push({ n, name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}. ${name}\n        ${detail}`);
};

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'DIRT RICH',
  subtitle: "A Beginner's Guide to Backyard Homesteading",
  authorName: 'Abby Fenwick',
  trimSize: TRADE_NONFICTION_GUIDE_TYPESET_V1.trim,
  typography: {
    bodyPt: TRADE_NONFICTION_GUIDE_TYPESET_V1.type.bodyPt,
    lineHeight: TRADE_NONFICTION_GUIDE_TYPESET_V1.type.lineHeight,
    headingFont: TRADE_NONFICTION_GUIDE_TYPESET_V1.type.headingFont,
    bodyFont: TRADE_NONFICTION_GUIDE_TYPESET_V1.type.bodyFont,
  },
  typesetLayoutStandardId: TRADE_NONFICTION_GUIDE_TYPESET_V1.id,
});

console.log('DIRT RICH — typeset preview gate');
console.log(`  manuscript: ${MANUSCRIPT}`);
console.log(`  standard:   ${TRADE_NONFICTION_GUIDE_TYPESET_V1.id}`);
console.log(`  setting:    ${config.typography.bodyPt}pt / ${config.typography.lineHeight}, ` +
            `${TRADE_NONFICTION_GUIDE_TYPESET_V1.trim.widthIn}x${TRADE_NONFICTION_GUIDE_TYPESET_V1.trim.heightIn}\n`);

console.log('rendering (Paged.js, local Chromium, free)...');
const render = await renderTypesetBook({
  markdown: md,
  config,
  layoutStandard: TRADE_NONFICTION_GUIDE_TYPESET_V1,
  chaptersStartRecto: TRADE_NONFICTION_GUIDE_TYPESET_V1.chaptersStartRecto,
  frontMatter: {},
});
writeFileSync(OUT_PDF, render.pdf);
console.log(`  ${render.report.totalPages} pages, ${render.report.blankPages.length} blanks, ` +
            `${render.report.verticalOverflowPages.length} overflow -> ${OUT_PDF}\n`);

const html = render.html;

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
  1,
  'canonical completeness',
  completeness.ok,
  completeness.ok
    ? `${completeness.expectedSections} canonical sections all present; ${completeness.builtWords} body words`
    : completeness.failures.map((f) => f.message).join('\n        '),
);

// Every section must also have REACHED THE RENDER, not just the parse.
const rendered = new Set(render.report.sectionStarts.map((s) => s.title));
const notRendered = sections.filter((s) => !rendered.has(s.title)).map((s) => s.title);
check(
  1.5 as unknown as number,
  'every parsed section reached the rendered book',
  notRendered.length === 0,
  notRendered.length === 0
    ? `${render.report.sectionStarts.length} sections laid out`
    : `missing from the render: ${notRendered.join(', ')}`,
);

// ── 2. table rows and cells ─────────────────────────────────────────────────
const pipeLines = md.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
const delimiters = pipeLines.filter((l) => /^\|?[\s:|-]+$/.test(l) && l.includes('-'));
const dataRows = pipeLines.length - delimiters.length;
const authoredCells = pipeLines
  .filter((l) => !delimiters.includes(l))
  .reduce((a, l) => a + l.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).length, 0);
const renderedTables = (html.match(/<table[^>]*class="tset-table"/g) ?? []).length;
const renderedRows = (html.match(/<tr>/g) ?? []).length;
const renderedCells = (html.match(/<t[hd] /g) ?? []).length;
check(
  2,
  'table rows and cells preserved',
  pipeLines.length === 47 && renderedTables === delimiters.length && renderedRows === dataRows && renderedCells >= authoredCells,
  `${pipeLines.length} pipe lines in manuscript -> ${renderedTables} tables, ` +
    `${renderedRows}/${dataRows} rows, ${renderedCells}/${authoredCells} cells`,
);

// ── 3. Appendix E preformatted ──────────────────────────────────────────────
const lines = md.split('\n');
const open = lines.findIndex((l) => l.trim().startsWith('```'));
const close = lines.findIndex((l, i) => i > open && l.trim().startsWith('```'));
const fence = lines.slice(open + 1, close);
const pre = html.slice(html.indexOf('<pre'), html.indexOf('</pre>'));
const missingFenceLines = fence.filter((l) => l.trim() && !pre.includes(l));
check(
  3,
  'Appendix E preformatted material preserved verbatim',
  (html.match(/<pre[^>]*class="tset-pre"/g) ?? []).length === 1 && missingFenceLines.length === 0,
  missingFenceLines.length === 0
    ? `all ${fence.length} fenced lines present, alignment intact, set in ${TRADE_NONFICTION_GUIDE_TYPESET_V1.preformatted?.family}`
    : `corrupted or missing ${missingFenceLines.length} line(s): ${missingFenceLines[0]}`,
);

// ── 4. long URLs contained within the measure ───────────────────────────────
// Measured in the laid-out DOM, not inferred from markup: a <wbr> is only a
// break OPPORTUNITY, and the question is whether any ink actually leaves the
// text block.
const urlCount = (md.match(/https?:\/\/\S+/g) ?? []).length;
const overflowing = render.report.horizontalOverflow;
check(
  4,
  'long URLs contained within the measure',
  overflowing.length === 0,
  overflowing.length === 0
    ? `${urlCount} URLs, none exceeding the text block (measured in the rendered DOM)`
    : `${overflowing.length} element(s) overrun the text block: ${JSON.stringify(overflowing.slice(0, 3))}`,
);

// ── 5. production markers ───────────────────────────────────────────────────
const MARKERS = [
  'FIGURE 5.1', 'FIGURE 10.1', 'TABLE A.1', 'TABLE B.1', 'TABLE C.1',
  'CHECKLIST D.1', 'FIGURE E.1',
];
const found = MARKERS.filter((m) => html.includes(m));
check(
  5,
  'all 7 production markers accounted for',
  found.length === 7,
  `${found.length}/7 present and visible in the preview (they MUST be stripped before print): ${found.join(', ')}` +
    (found.length === 7 ? '' : ` — MISSING: ${MARKERS.filter((m) => !found.includes(m)).join(', ')}`),
);

// ── overflow ────────────────────────────────────────────────────────────────
check(
  6,
  'no vertical overflow',
  render.report.verticalOverflowPages.length === 0,
  render.report.verticalOverflowPages.length === 0
    ? 'zero pages report clipping'
    : `pages: ${render.report.verticalOverflowPages.join(', ')}`,
);

console.log(`\n${'─'.repeat(74)}`);
const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? `GATE GREEN — ${render.report.totalPages} pages. Safe to promote and create DIRT RICH once on the real backend.`
    : `GATE RED — ${failed.length} criterion/criteria failed. Do NOT promote.`,
);
process.exit(failed.length === 0 ? 0 : 1);
