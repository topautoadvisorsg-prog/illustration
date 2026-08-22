/**
 * C4 — the wide-table stacked fallback.
 *
 * A grid divides one fixed measure between its columns, so past a certain count
 * each column is narrower than the words in it. 7 NATIONAL PARKS carries a
 * five-column permit table whose widest cell reads "Timed Entry + Bear Lake Road
 * if your day touches the Bear Lake corridor; plain Timed Entry for everywhere
 * else". At the 4.625in measure of a 6x9 that column is under an inch — about
 * eleven characters — and the row sets as a vertical smear of one-word lines.
 * There is no trim at which it works.
 *
 * The alternative was sending the table back to be reworded. That is the wrong
 * direction of travel: the manuscript is verified text with a claim record
 * behind every sentence, so the transformation happens in PRESENTATION.
 *
 * THE CONTRACT THESE TESTS DEFEND
 *   1. every authored cell survives, verbatim — this is a presentation change
 *      and nothing else;
 *   2. it is deterministic, so a book cannot stack on one build and grid on the
 *      next;
 *   3. it is OPT-IN per standard, so the approved 7-column table in a book that
 *      has already printed cannot restack itself.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { buildTypesetHtml, parseTypesetSections } from '../pipeline/typeset/typeset-book.js';
import { NATIONAL_PARKS_GUIDE_TYPESET_V1 } from '../pipeline/typeset/layout-standards/national-parks-guide-v1.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V1 } from '../pipeline/typeset/layout-standards/trade-nonfiction-guide-v1.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V2 } from '../pipeline/typeset/layout-standards/trade-nonfiction-guide-v2.js';
import type { TypesetLayoutStandard } from '../pipeline/typeset/layout-standards/types.js';

const CONFIG = ProjectConfigSchema.parse({
  volume: 1,
  title: '7 National Parks Without the Rookie Mistakes',
  authorName: 'Tom Everett',
  trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0 },
  typography: { bodyPt: 11, lineHeight: 1.35, headingFont: 'Archivo', bodyFont: 'EB Garamond' },
});

/**
 * Element matchers, not string matchers.
 *
 * Two traps, both of which produced a false result while the code was correct:
 * the stylesheet names `.tset-table` and `.tset-table-stacked` on every page
 * that declares a table policy, so a bare `toContain` is always true; and
 * `stampBlockIds` inserts `data-block-id` BEFORE the class attribute, so
 * `'<table class="tset-table"'` never appears literally.
 */
const GRID = /<table[^>]*class="tset-table"/g;
const STACKED = /<div[^>]*class="tset-table-stacked"/g;
const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;

const render = (markdown: string, standard: TypesetLayoutStandard): string =>
  buildTypesetHtml({
    sections: parseTypesetSections(markdown),
    config: CONFIG,
    margins: { topIn: 0.75, bottomIn: 0.75, outsideIn: 0.625, gutterIn: 0.75 },
    layoutStandard: standard,
  });

/** Two chapters, so the numbered-H1 convention is declared. Three-column table. */
const NARROW = `# 1 — A Chapter

## Fees

| Park | Fee |
|---|---|
| Zion | $35 |
| Acadia | $35 |

# 2 — Another

Body.
`;

/** The real shape: five columns, one very long cell. */
const WIDE = `# 1 — A Chapter

## Permits

| Park | What | When | Cost | Where |
|---|---|---|---|---|
| Rocky Mountain | Timed Entry + Bear Lake Road if your day touches the Bear Lake corridor; plain Timed Entry for everywhere else | May 22–mid-Oct 2026 | $2 processing | recreation.gov only — **not sold in person** |
| Yellowstone | None | — | — | — |

# 2 — Another

Body.
`;

describe('wide-table fallback — when it fires', () => {
  it('leaves a table at or under the threshold as a real grid', () => {
    const html = render(NARROW, NATIONAL_PARKS_GUIDE_TYPESET_V1);
    expect(count(html, GRID)).toBe(1);
    expect(count(html, STACKED)).toBe(0);
  });

  it('stacks a table past the threshold', () => {
    const html = render(WIDE, NATIONAL_PARKS_GUIDE_TYPESET_V1);
    expect(count(html, STACKED)).toBe(1);
    expect(count(html, GRID)).toBe(0);
  });

  it('is decided on the authored column count, so it is deterministic', () => {
    const a = render(WIDE, NATIONAL_PARKS_GUIDE_TYPESET_V1);
    const b = render(WIDE, NATIONAL_PARKS_GUIDE_TYPESET_V1);
    expect(a).toBe(b);
    expect(a).toMatch(/data-columns="5" data-rows="2"/);
  });
});

describe('wide-table fallback — nothing is lost', () => {
  it('emits every cell of every row, verbatim', () => {
    const html = render(WIDE, NATIONAL_PARKS_GUIDE_TYPESET_V1);
    // The long cell that made a grid impossible, intact and unabbreviated.
    expect(html).toContain(
      'Timed Entry + Bear Lake Road if your day touches the Bear Lake corridor; plain Timed Entry for everywhere else',
    );
    // The first column names the unit; the rest become labelled fields.
    expect(html).toContain('<p class="tst-lead">Rocky Mountain</p>');
    for (const label of ['What', 'When', 'Cost', 'Where']) {
      expect(html).toContain(`<span class="tst-label">${label}</span>`);
    }
    // 2 rows x 4 non-lead columns = 8 fields, including the em-dash placeholders
    // a "nothing to report" row uses. An empty cell is still a cell.
    expect(html.match(/class="tst-field"/g) ?? []).toHaveLength(8);
    expect(html).toMatch(/data-cells="10"/);
  });

  it('keeps inline emphasis inside a stacked cell', () => {
    const html = render(WIDE, NATIONAL_PARKS_GUIDE_TYPESET_V1);
    expect(html).toContain('<strong>not sold in person</strong>');
  });

  it('keeps each unit whole on one page', () => {
    const html = render(WIDE, NATIONAL_PARKS_GUIDE_TYPESET_V1);
    expect(html).toMatch(/\.tst-unit \{[^}]*break-inside: avoid/);
  });
});

describe('wide-table fallback — the shipped standards cannot restack', () => {
  it('is off on both trade standards, which a printed book is pinned to', () => {
    // DIRT RICH's Table C.1 is SEVEN columns and is approved as a grid. Any
    // threshold low enough to be useful would restack the most-consulted page of
    // a book that has already shipped, so the fallback is opt-in.
    expect(TRADE_NONFICTION_GUIDE_TYPESET_V1.tables?.stackWhenColumnsExceed).toBeNull();
    expect(TRADE_NONFICTION_GUIDE_TYPESET_V2.tables?.stackWhenColumnsExceed).toBeNull();
  });

  it('renders the five-column table as a grid under the trade standard', () => {
    const html = render(WIDE, TRADE_NONFICTION_GUIDE_TYPESET_V1);
    expect(count(html, GRID)).toBe(1);
    expect(count(html, STACKED)).toBe(0);
  });
});

describe('the real manuscript', () => {
  const PATH =
    'C:/Users/jovan/Downloads/national parks book/LAYOUT-7-national-parks-without-the-rookie-mistakes.md';
  let md = '';
  try {
    md = readFileSync(PATH, 'utf8');
  } catch {
    /* not on this machine — the cases below skip themselves */
  }
  const maybe = md ? it : it.skip;

  maybe('accounts for all 46 authored table rows across grids and stacked units', () => {
    const html = render(md, NATIONAL_PARKS_GUIDE_TYPESET_V1);
    // 46 authored pipe rows = 5 header + 5 delimiter + 36 body rows.
    const gridBodyRows =
      count(html, /<tr>/g) - count(html, /<thead><tr>/g);
    const stackedRows = [...html.matchAll(/class="tset-table-stacked" data-columns="\d+" data-rows="(\d+)"/g)]
      .reduce((n, m) => n + Number(m[1]), 0);
    expect(gridBodyRows + stackedRows).toBe(36);
    // Four grids and one stacked unit-list — the five-column permits table.
    expect(count(html, GRID)).toBe(4);
    expect(count(html, STACKED)).toBe(1);
  });
});
