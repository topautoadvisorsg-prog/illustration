/**
 * C5 — inline emphasis in a SECTION TITLE.
 *
 * Section titles went through `escapeHtml` and nothing else, while body text has
 * always had a full inline pass. So a heading carrying any emphasis printed its
 * markdown syntax on the page. Found on the appendix banner of 7 NATIONAL
 * PARKS, which set as
 *
 *     ⟶ ALL FIGURES IN THIS APPENDIX ARE CURRENT AS OF: **August 2026**
 *
 * asterisks and all, at chapter-opener size, and listed the same way in the
 * contents.
 *
 * THE DEFECT IS GENERAL, and so is the fix. Any title with emphasis in any book
 * was going to print raw; that banner is simply the first heading in three books
 * to have any. These tests therefore assert the RULE, not the sentence.
 *
 * ─── THE PART THAT IS EASY TO GET WRONG ───────────────────────────────────
 * A title lands in three places with different capabilities:
 *
 *   the opener <h2>   markup, so emphasis renders
 *   the contents      markup, so emphasis renders
 *   the running head  `string-set: sectitle attr(data-title)` — a CSS string,
 *                     which can hold CHARACTERS ONLY
 *
 * Putting the rendered form in the attribute would print literal `<strong>` tags
 * in the page margin, which is worse than the asterisks it replaced. So the
 * attribute carries a plain-text form and the two display sites carry markup.
 */
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import {
  buildTypesetHtml,
  inlineHeadingHtml,
  parseTypesetSections,
  plainHeadingText,
} from '../pipeline/typeset/typeset-book.js';
import { buildFrontMatterHtml } from '../pipeline/typeset/front-matter.js';
import { NATIONAL_PARKS_GUIDE_TYPESET_V1 } from '../pipeline/typeset/layout-standards/national-parks-guide-v1.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from '../pipeline/typeset/layout-standards/educational-nonfiction-v1.js';
import type { TypesetLayoutStandard } from '../pipeline/typeset/layout-standards/types.js';

const CONFIG = ProjectConfigSchema.parse({
  volume: 1,
  title: 'A Book',
  authorName: 'An Author',
  trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0 },
  typography: { bodyPt: 11, lineHeight: 1.35, headingFont: 'Archivo', bodyFont: 'EB Garamond' },
});

const render = (markdown: string, standard: TypesetLayoutStandard = NATIONAL_PARKS_GUIDE_TYPESET_V1): string =>
  buildTypesetHtml({
    sections: parseTypesetSections(markdown),
    config: CONFIG,
    margins: { topIn: 0.75, bottomIn: 0.75, outsideIn: 0.625, gutterIn: 0.75 },
    layoutStandard: standard,
  });

/** The real shape, reduced: a bare H1 title carrying bold and a long arrow. */
const BANNER = `# 1 — A Chapter

## A Section

Body.

# 2 — Another Chapter

Body.

# BACK MATTER

# ⟶ ALL FIGURES ARE CURRENT AS OF: **August 2026**

Appendix body.
`;

describe('section titles render inline emphasis', () => {
  it('sets bold in a chapter opener instead of printing asterisks', () => {
    const html = render(BANNER);
    expect(html).toContain('<strong>August 2026</strong>');
    // The exact defect: markdown syntax reaching the page.
    expect(html).not.toContain('**August 2026**');
  });

  it('renders emphasis in the contents entry too', () => {
    // The contents is generated matter, so it is built by buildFrontMatterHtml
    // rather than by the body pass — and it had the same escape-only defect.
    const entry = {
      slug: 'all-figures',
      label: '',
      title: 'ALL FIGURES ARE CURRENT AS OF: **August 2026**',
      titleHtml: `ALL FIGURES ARE CURRENT AS OF: ${inlineHeadingHtml('**August 2026**')}`,
      kind: 'back' as const,
      page: 115,
    };
    const html = buildFrontMatterHtml({ config: CONFIG, entries: [entry] });
    expect(html).toContain('<strong>August 2026</strong>');
    expect(html).not.toContain('**August 2026**');
  });

  it('falls back to the escaped plain title when no rendered form is supplied', () => {
    // Every entry built before `titleHtml` existed has none, and must still set.
    const html = buildFrontMatterHtml({
      config: CONFIG,
      entries: [{ slug: 'plain', label: 'Chapter 1', title: 'A Plain Title', kind: 'chapter', page: 11 }],
    });
    expect(html).toContain('A Plain Title');
  });

  it('draws an arrow the vendored faces do not carry, rather than printing tofu', () => {
    // U+27F6, the long form. U+2192 was already drawn; the long one was not, and
    // a character the face cannot set prints as an empty box.
    const html = render(BANNER);
    expect(html).toContain('class="gl gl-arrow"');
    expect(html).not.toContain('⟶ ALL FIGURES');
  });

  it('handles italic and bold-italic in a title as well', () => {
    const html = render(`# 1 — A *Quiet* Chapter\n\nBody.\n\n# 2 — A ***Loud*** One\n\nBody.\n`);
    expect(html).toContain('<em>Quiet</em>');
    expect(html).toContain('<strong><em>Loud</em></strong>');
  });

  it('leaves a title with no emphasis byte-identical', () => {
    // The regression guard for three shipped books: nothing changes for a plain
    // heading, which is every heading they have.
    const html = render(`# Chapter 1\n\n## The First One\n\nBody.\n`, EDUCATIONAL_NONFICTION_TYPESET_V1);
    expect(html).toContain('<h2>The First One</h2>');
  });
});

describe('the running head gets plain text, never markup', () => {
  it('strips emphasis from the string-set attribute', () => {
    const html = render(BANNER);
    // `data-title` is read by `string-set: sectitle attr(data-title)`. Markup
    // here would print literal tags in the margin.
    expect(html).toMatch(/data-title="[^"]*ALL FIGURES ARE CURRENT AS OF: August 2026"/);
    expect(html).not.toMatch(/data-title="[^"]*\*\*/);
    expect(html).not.toMatch(/data-title="[^"]*&lt;strong&gt;/);
  });

  it('plainHeadingText removes every form of emphasis and every drawn glyph', () => {
    expect(plainHeadingText('**Bold**')).toBe('Bold');
    expect(plainHeadingText('*Italic*')).toBe('Italic');
    expect(plainHeadingText('***Both***')).toBe('Both');
    expect(plainHeadingText('⚠ Careful')).toBe('Careful');
    // A drawn mark is DROPPED, not spelled out. Transliterating `⟶` to `->`
    // put "-> ALL FIGURES IN THIS APPENDIX..." along the top of two printed
    // pages of 7 NATIONAL PARKS, which reads as a mistake rather than an arrow.
    expect(plainHeadingText('See → there')).toBe('See there');
    expect(plainHeadingText('⟶ Onward')).toBe('Onward');
    expect(plainHeadingText('🚩 Flagged')).toBe('Flagged');
    expect(plainHeadingText('Plain title')).toBe('Plain title');
  });
});
