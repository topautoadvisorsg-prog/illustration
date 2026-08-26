/**
 * THE FIXTURE BOOK — the portable contract.
 *
 * `fixtures/fixture-book/manuscript.md` is a small synthetic book this
 * repository owns. It exists because the test baseline used to depend on two
 * things no CI machine has: a commercial manuscript in an operator's Downloads
 * folder, and whichever line endings that operator's checkout happened to
 * produce.
 *
 * Every structure asserted below is in the fixture ON PURPOSE. If you delete one
 * from the manuscript, a test here fails, and that is the fixture doing its job:
 * it is a contract, not sample content.
 *
 * The real-manuscript equivalents live in `real-manuscript.operator.test.ts`,
 * outside the portable gate.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { buildTypesetHtml, parseTypesetSections } from '../pipeline/typeset/typeset-book.js';
import { NATIONAL_PARKS_GUIDE_TYPESET_V1 } from '../pipeline/typeset/layout-standards/national-parks-guide-v1.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V2 } from '../pipeline/typeset/layout-standards/trade-nonfiction-guide-v2.js';
import { normalizeManuscriptNewlines } from '../pipeline/stage-1-ingestion/normalize-newlines.js';
import type { TypesetLayoutStandard } from '../pipeline/typeset/layout-standards/types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_MANUSCRIPT = path.join(HERE, 'fixtures/fixture-book/manuscript.md');

/** Read through the normalizer, so a CRLF checkout cannot change the result. */
const MD = normalizeManuscriptNewlines(readFileSync(FIXTURE_MANUSCRIPT, 'utf8'));

/** A 1x1 black PNG. Content is irrelevant; the engine only needs a real asset. */
const PLATE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export const FIXTURE_CONFIG = ProjectConfigSchema.parse({
  volume: 1,
  title: 'The Fixture Field Guide',
  authorName: 'The Fixture Standards Board',
  trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0.125 },
  paperStock: 'white',
});

function render(standard: TypesetLayoutStandard, images?: Record<string, string>): string {
  return buildTypesetHtml({
    sections: parseTypesetSections(MD),
    config: FIXTURE_CONFIG,
    margins: { topIn: 0.75, bottomIn: 0.75, outsideIn: 0.625, gutterIn: 0.75 },
    layoutStandard: standard,
    images,
  } as never);
}

const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

describe('the fixture manuscript parses into the structure it declares', () => {
  const sections = parseTypesetSections(MD);

  it('produces the expected sections', () => {
    expect(sections).toHaveLength(7);
  });

  it('splits front matter from back matter at the BACK MATTER marker', () => {
    expect(sections.filter((s) => s.kind === 'front')).toHaveLength(5);
    expect(sections.filter((s) => s.kind === 'back')).toHaveLength(2);
  });

  it('carries the three chapters, the appendix and the sources section', () => {
    const titles = sections.map((s) => s.title);
    expect(titles).toContain('Chapter 1: Openers, Body and Lists');
    expect(titles).toContain('Chapter 2: Tables, Plates and Preformatted Text');
    expect(titles).toContain('Chapter 3: A Chapter That Forces a Parity Blank');
    expect(titles).toContain('Appendix A: Reference Values');
    expect(titles).toContain('Sources');
  });

  it('parses identically from a CRLF copy', () => {
    const crlf = parseTypesetSections(normalizeManuscriptNewlines(MD.replace(/\n/g, '\r\n')));
    expect(JSON.stringify(crlf)).toBe(JSON.stringify(sections));
  });
});

describe('the blocks the engine is most likely to break', () => {
  const html = render(TRADE_NONFICTION_GUIDE_TYPESET_V2, { 'fixture-plate': PLATE });

  it('renders every section', () => {
    expect(count(html, /class="tsec /g)).toBe(7);
  });

  it('renders a labelled callout', () => {
    expect(count(html, /class="callout"/g)).toBe(1);
    expect(count(html, /class="callout-label"/g)).toBe(1);
  });

  it('renders both list kinds', () => {
    expect(count(html, /<ul/g)).toBeGreaterThan(0);
    expect(count(html, /<ol/g)).toBeGreaterThan(0);
    expect(count(html, /<li/g)).toBeGreaterThanOrEqual(9);
  });

  it('renders the preformatted block rather than leaving the fence as text', () => {
    expect(count(html, /<pre/g)).toBe(1);
    expect(html).not.toContain('```');
  });

  it('renders the plate as a figure with the supplied asset', () => {
    expect(count(html, /<figure/g)).toBe(1);
    expect(count(html, /<img /g)).toBe(1);
    expect(html).toContain(PLATE.slice(0, 40));
  });

  it('leaves figure syntax as literal text when no asset is supplied', () => {
    const without = render(TRADE_NONFICTION_GUIDE_TYPESET_V2);
    expect(count(without, /<figure/g)).toBe(0);
  });

  it('renders all three tables as grids under a standard with a wide measure', () => {
    expect(count(html, /class="tset-table"/g)).toBe(3);
    expect(count(html, /class="tset-table-stacked"/g)).toBe(0);
  });
});

describe('the wide-table fallback', () => {
  /**
   * The eight-column table exists to be too wide for a narrow measure. Under the
   * National Parks standard it must become a stacked unit rather than run off
   * the page or lose columns silently; under the trade standard the measure is
   * wide enough to keep it a grid.
   *
   * If both numbers become equal, the fallback has stopped discriminating and
   * the fixture is no longer testing anything.
   */
  it('stacks the wide table under a narrow measure and keeps it a grid under a wide one', () => {
    const narrow = render(NATIONAL_PARKS_GUIDE_TYPESET_V1);
    const wide = render(TRADE_NONFICTION_GUIDE_TYPESET_V2);
    expect(count(narrow, /class="tset-table-stacked"/g)).toBe(1);
    expect(count(narrow, /class="tset-table"/g)).toBe(2);
    expect(count(wide, /class="tset-table-stacked"/g)).toBe(0);
    expect(count(wide, /class="tset-table"/g)).toBe(3);
  });

  it('loses no authored rows to the fallback', () => {
    const narrow = render(NATIONAL_PARKS_GUIDE_TYPESET_V1);
    const gridBodyRows = count(narrow, /<tr>/g) - count(narrow, /<thead><tr>/g);
    const stackedRows = [...narrow.matchAll(/class="tset-table-stacked" data-columns="\d+" data-rows="(\d+)"/g)].reduce(
      (n, m) => n + Number(m[1]),
      0,
    );
    // 3 body rows (narrow) + 4 body rows (wide) + 3 body rows (appendix) = 10.
    expect(gridBodyRows + stackedRows).toBe(10);
  });
});

describe('the drawn-mark heading', () => {
  /**
   * `headingDrawnMarks` governs the RUNNING HEAD and the CONTENTS entry, not the
   * body heading. An arrow in a body heading is a real cross-reference and draws
   * under every standard — as an inline SVG, not as the literal character.
   */
  it('draws the mark in the body heading under both standards', () => {
    for (const std of [TRADE_NONFICTION_GUIDE_TYPESET_V2, NATIONAL_PARKS_GUIDE_TYPESET_V1]) {
      const html = render(std);
      const heading = html.match(/<h3[^>]*>.{0,400}?All Figures Here Are Synthetic/s);
      expect(heading, 'the drawn-mark heading must exist').toBeTruthy();
      expect(heading![0]).toContain('<svg');
    }
  });

  it('keeps the plain form out of the section identity attribute', () => {
    const html = render(NATIONAL_PARKS_GUIDE_TYPESET_V1);
    expect(html).toMatch(/data-title="[^"]*Appendix A: Reference Values[^"]*"/);
    expect(html).not.toMatch(/data-title="[^"]*<svg[^"]*"/);
  });
});
