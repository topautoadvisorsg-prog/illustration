/**
 * OPERATOR REGRESSION TESTS — NOT PART OF THE PORTABLE CI GATE.
 *
 * These assert against real commercial manuscripts that live OUTSIDE this
 * repository, on one operator's machine. They are excluded from the default
 * `vitest run` by `vitest.config.ts`, and that exclusion is deliberate:
 *
 *   - the files are edited as the books are edited, so the numbers below drift
 *     legitimately and a drift is not a code regression;
 *   - on any other machine, and in CI, the files simply do not exist.
 *
 * They earn their keep anyway. A real 12-chapter book with 46 authored table
 * rows exercises the parser and the wide-table fallback in ways a small fixture
 * never will, and this suite caught a parse that produced 126 sections and zero
 * chapters.
 *
 * RUN THEM DELIBERATELY, against the machine that holds the books:
 *
 *   npx vitest run src/__tests__/real-manuscript.operator.test.ts
 *
 * WHEN ONE FAILS: check the manuscript first. If a book legitimately gained a
 * table, update the number here and say so in the commit. Do not weaken the
 * assertion to a range — a count that cannot be wrong tells you nothing.
 *
 * The portable equivalents of these live in `fixture-book.test.ts`, against a
 * synthetic manuscript this repository owns.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { auditManuscriptParse } from '../pipeline/typeset/manuscript-parse-gate.js';
import { buildTypesetHtml, parseTypesetSections } from '../pipeline/typeset/typeset-book.js';
import { NATIONAL_PARKS_GUIDE_TYPESET_V1 } from '../pipeline/typeset/layout-standards/national-parks-guide-v1.js';
import { normalizeManuscriptNewlines } from '../pipeline/stage-1-ingestion/normalize-newlines.js';
import type { TypesetLayoutStandard } from '../pipeline/typeset/layout-standards/types.js';

const NATIONAL_PARKS =
  'C:/Users/jovan/Downloads/national parks book/LAYOUT-7-national-parks-without-the-rookie-mistakes.md';

let md = '';
try {
  md = normalizeManuscriptNewlines(readFileSync(NATIONAL_PARKS, 'utf8'));
} catch {
  /* not on this machine — every case below skips itself */
}
const maybe = md ? it : it.skip;

const GRID = /class="tset-table-grid"/g;
const STACKED = /class="tset-table-stacked"/g;
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

function render(markdown: string, standard: TypesetLayoutStandard): string {
  const config = ProjectConfigSchema.parse({
    trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0.125 },
    paperStock: 'white',
  });
  return buildTypesetHtml({
    sections: parseTypesetSections(markdown),
    layoutStandard: standard,
    config,
  } as never);
}

describe('7 NATIONAL PARKS — the real manuscript', () => {
  maybe('parses whole', () => {
    const a = auditManuscriptParse(md);
    expect(a.convention).toBe('numbered-h1');
    expect(a.parsed.chapters).toBe(12);
    expect(a.parsed.tableRows).toBe(46);
    expect(a.droppedAfterStructure).toBe(0);
    expect(a.ok).toBe(true);
    // Before the fix this book produced 126 sections and zero chapters.
    expect(a.parsed.sections).toBe(21);
  });

  maybe('accounts for all 46 authored table rows across grids and stacked units', () => {
    const html = render(md, NATIONAL_PARKS_GUIDE_TYPESET_V1);
    // 46 authored pipe rows = 5 header + 5 delimiter + 36 body rows.
    const gridBodyRows = count(html, /<tr>/g) - count(html, /<thead><tr>/g);
    const stackedRows = [...html.matchAll(/class="tset-table-stacked" data-columns="\d+" data-rows="(\d+)"/g)].reduce(
      (n, m) => n + Number(m[1]),
      0,
    );
    expect(gridBodyRows + stackedRows).toBe(36);
    // Four grids and one stacked unit-list — the five-column permits table.
    expect(count(html, GRID)).toBe(4);
    expect(count(html, STACKED)).toBe(1);
  });
});
