/**
 * REGRESSION TESTS FOR THE TWO DEFECTS THAT SHIPPED IN FOUR BOOKS.
 *
 * Defect 1: headings stranded at the foot of a Kindle screen, because the
 *           stylesheet relied on `page-break-after: avoid`, which Kindle
 *           ignores.
 * Defect 2: the title page emitted as a bare left-aligned h1 at the top of the
 *           screen, indistinguishable from the first paragraph of a chapter.
 *
 * The tests that matter here are the ones that would have FAILED before the
 * fix, so each is written against the defect rather than against the
 * implementation.
 */
import { describe, expect, it } from 'vitest';
import {
  applyKindleLayout,
  keepHeadingsWithContent,
  wrapFrontMatter,
  visibleLength,
  KEEP_MAX_CHARS,
  KINDLE_LAYOUT_CSS,
} from '../kindle-layout.js';

/** Visible text of a fragment, which must survive every transform untouched. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('defect 1 — headings must not strand', () => {
  it('binds a heading to the paragraph under it', () => {
    const out = keepHeadingsWithContent('<h2>Why it matters</h2>\n<p>Because it does.</p>');
    expect(out).toContain('<div class="keep">');
    expect(out.indexOf('<div class="keep">')).toBeLessThan(out.indexOf('<h2>'));
    expect(out).toContain('</div>');
  });

  it('binds every heading level, not just h2', () => {
    for (const h of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      const out = keepHeadingsWithContent(`<${h}>T</${h}>\n<p>body</p>`);
      expect(out, `${h} should bind`).toContain('<div class="keep">');
    }
  });

  it('binds a heading to a list, not only to a paragraph', () => {
    const out = keepHeadingsWithContent('<h3>Steps</h3>\n<ul>\n  <li>one</li>\n  <li>two</li>\n</ul>');
    expect(out).toContain('<div class="keep">');
    expect(text(out)).toBe('Steps one two');
  });

  it('keeps consecutive headings together with the content that finally arrives', () => {
    const out = keepHeadingsWithContent('<h2>Part</h2>\n<h3>Chapter</h3>\n<p>text</p>');
    // one wrapper holding all three, not two wrappers or a stranded h2
    expect(out.match(/<div class="keep">/g)).toHaveLength(1);
    const inner = out.slice(out.indexOf('<div class="keep">'), out.lastIndexOf('</div>'));
    expect(inner).toContain('<h2>Part</h2>');
    expect(inner).toContain('<h3>Chapter</h3>');
    expect(inner).toContain('<p>text</p>');
  });

  it('leaves a heading unbound when the block under it is longer than a screen', () => {
    const long = `<p>${'word '.repeat(KEEP_MAX_CHARS)}</p>`;
    expect(visibleLength(long)).toBeGreaterThan(KEEP_MAX_CHARS);
    const out = keepHeadingsWithContent(`<h3>Source</h3>\n${long}`);
    // binding an unsatisfiable block buys nothing and risks a screen of white
    expect(out).not.toContain('<div class="keep">');
  });

  it('binds a heading to a safety callout — the worst heading in the book to strand', () => {
    // Found in the girls' book: <h2>Tampons — the one that needs speed</h2> sat
    // alone at the foot of a screen with a "Do this now" emergency notice
    // overleaf, because callouts were excluded from binding.
    const aside =
      '<aside class="safety safety-immediate" epub:type="notice"><p class="safety-label">Do this now</p><p>Take it out and tell an adult straight away.</p></aside>';
    const out = keepHeadingsWithContent(`<h2>Tampons — the one that needs speed</h2>\n${aside}`);
    expect(out).toContain('<div class="keep">');
    expect(text(out)).toBe('Tampons — the one that needs speed Do this now Take it out and tell an adult straight away.');
  });

  it('does not bind a heading to a figure or table, which carry their own rules', () => {
    for (const block of ['<figure class="fig"><img src="a.png"/></figure>', '<table><tr><td>x</td></tr></table>']) {
      const out = keepHeadingsWithContent(`<h3>Look</h3>\n${block}`);
      expect(out).not.toContain('<div class="keep">');
    }
  });

  it('NEVER changes a word, whatever the block shape', () => {
    const cases = [
      '<h2>A</h2>\n<p>one</p>\n<p>two</p>',
      '<h2>A</h2>\n<h3>B</h3>\n<p>one</p>',
      '<p>lead</p>\n<h4>B</h4>\n<ol>\n  <li>i</li>\n</ol>\n<p>t</p>',
      '<h3>Alone</h3>',
      '<p>no headings here at all</p>',
      '<h3>Q</h3>\n<p>' + 'w '.repeat(800) + '</p>',
    ];
    for (const c of cases) {
      expect(text(keepHeadingsWithContent(c)), c.slice(0, 30)).toBe(text(c));
    }
  });

  it('is idempotent — running the repair twice changes nothing further', () => {
    const once = keepHeadingsWithContent('<h2>A</h2>\n<p>one</p>\n<h3>B</h3>\n<p>two</p>');
    expect(keepHeadingsWithContent(once)).toBe(once);
  });

  it('ships a rule Kindle actually honours, and not only break-after', () => {
    const css = KINDLE_LAYOUT_CSS.join('\n');
    expect(css).toMatch(/div\.keep\s*\{[^}]*page-break-inside:\s*avoid/);
  });
});

describe('defect 2 — the title page must read as a title page', () => {
  it('wraps the title page so the stylesheet can reach it', () => {
    const out = wrapFrontMatter('TITLE', '<h1>Book</h1>\n<p class="author">A</p>');
    expect(out).toContain('<div class="titlepage">');
  });

  it('wraps generated front matter', () => {
    expect(wrapFrontMatter('COPYRIGHT', '<p>c</p>')).toContain('<div class="frontmatter">');
  });

  it('leaves ordinary chapters alone', () => {
    const body = '<h1>Chapter 1</h1>\n<p>text</p>';
    expect(wrapFrontMatter('CHAPTER', body)).toBe(body);
    expect(wrapFrontMatter(undefined, body)).toBe(body);
  });

  it('centres the title page and gives it room, instead of the bare left-aligned h1 that shipped', () => {
    const css = KINDLE_LAYOUT_CSS.join('\n');
    expect(css).toMatch(/div\.titlepage\s*\{[^}]*text-align:\s*center/);
    expect(css).toMatch(/div\.titlepage\s*\{[^}]*padding-top/);
    // the shipped h1 was 1.6em and read as body copy
    const size = css.match(/div\.titlepage h1\s*\{[^}]*font-size:\s*([\d.]+)em/);
    expect(size).not.toBeNull();
    expect(Number(size![1])).toBeGreaterThan(1.6);
  });

  it('STAYS REFLOWABLE — no viewport units, no fixed heights, no absolute positioning', () => {
    const css = KINDLE_LAYOUT_CSS.join('\n');
    expect(css).not.toMatch(/\d(vh|vw)\b/);
    expect(css).not.toMatch(/position:\s*(absolute|fixed)/);
    expect(css).not.toMatch(/(^|[;{\s])height:\s*\d/);
    // every dimension that scales must be in em or %
    const px = css.match(/:\s*-?\d+(\.\d+)?px/g)?.filter((m) => !/0px/.test(m)) ?? [];
    expect(px).toEqual([]);
  });
});

describe('both repairs together', () => {
  it('applies the front-matter container and the heading binding', () => {
    const out = applyKindleLayout('TITLE', '<h1>Book</h1>\n<p class="subtitle">S</p>');
    expect(out).toContain('<div class="titlepage">');
    expect(out).toContain('<div class="keep">');
    expect(text(out)).toBe('Book S');
  });

  it('preserves document order exactly', () => {
    const src = '<p>a</p>\n<h2>B</h2>\n<p>c</p>\n<p>d</p>\n<h3>E</h3>\n<p>f</p>';
    expect(text(applyKindleLayout('CHAPTER', src))).toBe('a B c d E f');
  });
});
