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
    //
    // Rendered with a standard that KEEPS drawn marks on the display heading —
    // the default, and what every book did before `headingDrawnMarks` existed.
    // National Parks now sets `strip`, so it is no longer the fixture for this
    // particular rule. See the `headingDrawnMarks` block below.
    const html = render(BANNER, EDUCATIONAL_NONFICTION_TYPESET_V1);
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

/**
 * `headingDrawnMarks` — the one thing a standard may decide about a display
 * heading, and the reason it is a standard field rather than a renderer rule.
 *
 * The running head and the contents entry ALWAYS drop drawn marks; a CSS string
 * cannot hold an SVG. The display heading is the one place where either answer
 * is defensible:
 *
 *   7 NATIONAL PARKS wants the arrow off, so its display heading agrees with the
 *   running head and the contents about the same title.
 *   Every other book wants it on, and must not change because of that.
 *
 * These assert the POLICY, not the sentence. A book that never sets the field
 * behaves exactly as it did before the field existed.
 */
describe('headingDrawnMarks — per-standard, defaulting to draw', () => {
  it('a standard that does not set it keeps drawing the mark', () => {
    expect(EDUCATIONAL_NONFICTION_TYPESET_V1.headingDrawnMarks).toBeUndefined();
    const html = render(BANNER, EDUCATIONAL_NONFICTION_TYPESET_V1);
    expect(html).toContain('class="gl gl-arrow"');
  });

  it('National Parks strips the mark from the display heading', () => {
    expect(NATIONAL_PARKS_GUIDE_TYPESET_V1.headingDrawnMarks).toBe('strip');
    const html = render(BANNER, NATIONAL_PARKS_GUIDE_TYPESET_V1);
    expect(html).not.toContain('class="gl gl-arrow"');
    // The words survive; only the mark goes.
    expect(html).toContain('ALL FIGURES ARE CURRENT AS OF:');
  });

  it('the two standards disagree only about the mark', () => {
    const drawn = render(BANNER, EDUCATIONAL_NONFICTION_TYPESET_V1);
    const stripped = render(BANNER, NATIONAL_PARKS_GUIDE_TYPESET_V1);
    // 'BACK MATTER' is deliberately absent: the parser consumes it as the
    // divider that switches following sections to kind 'back'. It is never a
    // rendered heading, so it is not a witness for anything here.
    for (const heading of ['A Chapter', 'Another Chapter', 'ALL FIGURES ARE CURRENT AS OF:']) {
      expect(drawn).toContain(heading);
      expect(stripped).toContain(heading);
    }
    // Emphasis in a heading is untouched by the policy, under both standards.
    expect(drawn).toContain('<strong>August 2026</strong>');
    expect(stripped).toContain('<strong>August 2026</strong>');
  });

  it('leaves body text alone — an arrow in a paragraph is a cross-reference', () => {
    // The policy is about DISPLAY HEADINGS only. A mark inside a sentence points
    // at the words beside it and still draws under either standard.
    //
    // Uses the BANNER shape on purpose: a lone chapter with no second chapter and
    // no back-matter divider parses to zero sections, so a smaller fixture would
    // assert nothing while appearing to pass.
    const withArrow = BANNER.replace('Appendix body.', 'See the table ⟶ page 40.');
    for (const standard of [EDUCATIONAL_NONFICTION_TYPESET_V1, NATIONAL_PARKS_GUIDE_TYPESET_V1]) {
      const html = render(withArrow, standard);
      expect(html).toContain('See the table');
      expect(html).toContain('page 40.');
    }
  });

  it('the running head and contents drop the mark regardless of the policy', () => {
    for (const standard of [EDUCATIONAL_NONFICTION_TYPESET_V1, NATIONAL_PARKS_GUIDE_TYPESET_V1]) {
      const html = render(BANNER, standard);
      expect(html).toMatch(/data-title="[^"]*ALL FIGURES ARE CURRENT AS OF: August 2026"/);
      expect(html).not.toMatch(/data-title="[^"]*⟶/);
    }
  });
});
