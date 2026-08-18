/**
 * C2 — Markdown tables.
 *
 * The typesetter had no table capability: a pipe row fell through to the
 * paragraph branch and printed as literal `|` characters. DIRT RICH carries
 * three tables, one of them 7 columns x 22 rows, described in its own text as
 * the most-consulted page in the book.
 *
 * "Preserve all table cells verbatim" is an operator requirement, so the tests
 * that matter most here count cells against the real manuscript rather than
 * eyeballing a fixture.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import {
  alignmentsFrom,
  buildTypesetHtml,
  isDelimiterRow,
  parseTypesetSections,
  splitTableRow,
} from '../pipeline/typeset/typeset-book.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from '../pipeline/typeset/layout-standards/educational-nonfiction-v1.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V2 } from '../pipeline/typeset/layout-standards/educational-nonfiction-v2.js';
import type { TypesetLayoutStandard, TypesetTableStyles } from '../pipeline/typeset/layout-standards/types.js';

const TABLES: TypesetTableStyles = {
  typePt: 9,
  cellPaddingEm: 0.3,
  headerRulePt: 1,
  rowRulePt: 0.25,
  breakPolicy: 'keep-together',
  repeatHeader: false,
};

const CONFIG = ProjectConfigSchema.parse({
  volume: 1,
  title: 'DIRT RICH',
  authorName: 'Abby Fenwick',
  trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0 },
  typography: { bodyPt: 11, lineHeight: 1.35, headingFont: 'Archivo', bodyFont: 'EB Garamond' },
});

const standard = (tables?: TypesetTableStyles): TypesetLayoutStandard => ({
  ...EDUCATIONAL_NONFICTION_TYPESET_V1,
  id: 'test-standard@1',
  ...(tables ? { tables } : {}),
});

const render = (md: string, tables?: TypesetTableStyles): string =>
  buildTypesetHtml({
    sections: parseTypesetSections(md),
    config: CONFIG,
    layoutStandard: standard(tables),
  });

const SIMPLE = `# Book

Title block.

## Data

| Crop | Sun | Days |
|---|:---:|---:|
| Tomatoes | Full | 60–70 |
| Lettuce | Part OK | 30–50 |

Following prose.
`;

describe('C2 — row and alignment parsing', () => {
  it('splits rows with and without outer pipes', () => {
    expect(splitTableRow('| a | b | c |')).toEqual(['a', 'b', 'c']);
    expect(splitTableRow('a | b | c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps empty cells rather than collapsing them', () => {
    expect(splitTableRow('| a |  | c |')).toEqual(['a', '', 'c']);
  });

  it('treats an escaped pipe as content, not a separator', () => {
    expect(splitTableRow('| a \\| b | c |')).toEqual(['a | b', 'c']);
  });

  it('recognises delimiter rows and rejects ordinary rows', () => {
    expect(isDelimiterRow('|---|---|')).toBe(true);
    expect(isDelimiterRow('| :--- | ---: | :---: |')).toBe(true);
    expect(isDelimiterRow('| Crop | Sun |')).toBe(false);
    expect(isDelimiterRow(undefined)).toBe(false);
  });

  it('reads alignment from the delimiter row', () => {
    expect(alignmentsFrom('|---|:---:|---:|', 3)).toEqual(['left', 'center', 'right']);
  });

  it('pads alignment when the delimiter row is short', () => {
    expect(alignmentsFrom('|---|', 3)).toEqual(['left', 'left', 'left']);
  });
});

describe('C2 — a standard without a table policy is unchanged', () => {
  it('does not emit a table', () => {
    const html = render(SIMPLE);
    expect(html).not.toContain('<table');
    expect(html).not.toContain('tset-table');
  });

  it('emits no table CSS', () => {
    expect(render(SIMPLE)).not.toContain('border-collapse');
  });

  it('the two SHIPPED standards declare no table policy', () => {
    expect(EDUCATIONAL_NONFICTION_TYPESET_V1.tables).toBeUndefined();
    expect(EDUCATIONAL_NONFICTION_TYPESET_V2.tables).toBeUndefined();
  });
});

describe('C2 — rendering', () => {
  const html = render(SIMPLE, TABLES);

  it('emits a real table with a header and body', () => {
    // The block stamper inserts data-block-id into the open tag, so match the
    // class rather than an exact prefix — and note the table DOES get a block
    // id, which is what lets an override or an illustration anchor to it.
    expect(html).toMatch(/<table[^>]*class="tset-table"/);
    expect(html).toMatch(/<table[^>]*data-block-id="[0-9a-f]+"/);
    expect(html).toContain('<thead>');
    expect(html).toContain('<th class="ta-left">Crop</th>');
    expect(html).toContain('<td class="ta-center">Full</td>');
    expect(html).toContain('<td class="ta-right">60–70</td>');
  });

  it('does not leave literal pipes in the output', () => {
    const section = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
    expect(section).not.toContain('|');
  });

  it('keeps prose after the table as prose', () => {
    expect(html).toContain('Following prose.');
    expect(html).not.toContain('<p>| Tomatoes');
  });

  it('honours the keep-together break policy', () => {
    expect(html).toContain('break-inside: avoid');
  });

  it('pads a ragged row instead of dropping cells', () => {
    const ragged = render('# B\n\nT.\n\n## D\n\n| a | b | c |\n|---|---|---|\n| 1 |\n', TABLES);
    const row = ragged.slice(ragged.indexOf('<tbody>'), ragged.indexOf('</tbody>'));
    expect((row.match(/<td/g) ?? []).length).toBe(3);
  });

  it('emits every cell of an over-wide row rather than truncating', () => {
    const wide = render('# B\n\nT.\n\n## D\n\n| a | b |\n|---|---|\n| 1 | 2 | 3 |\n', TABLES);
    const body = wide.slice(wide.indexOf('<tbody>'), wide.indexOf('</tbody>'));
    expect((body.match(/<td/g) ?? []).length).toBe(3);
  });
});

describe('C2 — the real DIRT RICH tables, cell for cell', () => {
  const md = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/dirt-rich-manuscript.md'), 'utf8');

  /** Count pipe-table rows in the manuscript, independently of the renderer. */
  const manuscriptRows = md
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'));
  const delimiterRows = manuscriptRows.filter((l) => isDelimiterRow(l));
  const dataRows = manuscriptRows.length - delimiterRows.length;

  const html = render(md, TABLES);

  it('the manuscript carries the 47 pipe rows the handoff describes', () => {
    expect(manuscriptRows).toHaveLength(47);
  });

  it('renders one table per delimiter row in the manuscript', () => {
    expect((html.match(/<table[^>]*class="tset-table"/g) ?? []).length).toBe(delimiterRows.length);
  });

  it('preserves every data row — header rows included, none dropped', () => {
    const rendered = (html.match(/<tr>/g) ?? []).length;
    expect(rendered).toBe(dataRows);
  });

  it('preserves every authored cell', () => {
    const authored = manuscriptRows
      .filter((l) => !isDelimiterRow(l))
      .reduce((a, l) => a + splitTableRow(l).length, 0);
    const rendered = (html.match(/<t[hd] /g) ?? []).length;
    // Rendered may exceed authored only by padding of ragged rows, never fall short.
    expect(rendered).toBeGreaterThanOrEqual(authored);
  });

  it('reads the three tables at the shapes the manuscript actually has', () => {
    // Counted straight from the file: A.1 is 3x13, B.1 is 2x7, C.1 is 7x21 body
    // rows. The handoff calls C.1 "7 columns, 22 rows" — that is the 21 body rows
    // plus its header. Recorded here so the two descriptions cannot drift.
    expect(html).toContain('data-columns="3" data-rows="13"');
    expect(html).toContain('data-columns="2" data-rows="7"');
    expect(html).toContain('data-columns="7" data-rows="21"');
  });

  it('sets the crop chart as ONE table that cannot break across a page turn', () => {
    const at = html.indexOf('data-columns="7"');
    const c1 = html.slice(at, html.indexOf('</table>', at));
    // 21 body rows + 1 header = the 22 the handoff counts.
    expect((c1.match(/<tr>/g) ?? []).length).toBe(22);
    expect(html).toContain('break-inside: avoid');
  });

  it('keeps a bolded cell bold instead of printing the asterisks', () => {
    // Table C.1 has "**1 plant.** Possibly 2" in the family-of-four column.
    expect(html).toContain('<strong>1 plant.</strong>');
  });

  it('leaves no literal pipe rows anywhere in the body', () => {
    expect(html).not.toMatch(/<p[^>]*>\|/);
  });
});
