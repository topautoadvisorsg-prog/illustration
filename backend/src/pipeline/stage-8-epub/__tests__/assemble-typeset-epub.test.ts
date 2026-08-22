import { describe, expect, it } from 'vitest';
import { plainTitleOf, typesetBodyToHtml, type EpubFigure } from '../assemble-typeset-epub.js';

const fig = (src: string): EpubFigure => ({ src, alt: '' });

describe('typesetBodyToHtml', () => {
  describe('heading depth', () => {
    it('pins the shallowest in-body heading to h2, whatever marker it used', () => {
      // The chapter title is set as <h1> by the caller, so the body must start
      // at h2. A book whose shallowest in-body heading is `###` used to emit
      // <h4> and skip two levels.
      const deep = typesetBodyToHtml(['### Section', 'Text.', '#### Sub', 'More.']);
      expect(deep.html).toContain('<h2>Section</h2>');
      expect(deep.html).toContain('<h3>Sub</h3>');

      const shallow = typesetBodyToHtml(['## Section', 'Text.', '### Sub', 'More.']);
      expect(shallow.html).toContain('<h2>Section</h2>');
      expect(shallow.html).toContain('<h3>Sub</h3>');
    });

    it('never emits an h1 from the body — that level belongs to the chapter title', () => {
      const { html } = typesetBodyToHtml(['###### Deepest', 'Text.']);
      expect(html).not.toContain('<h1>');
      expect(html).toContain('<h2>Deepest</h2>');
    });

    it('caps at h6 rather than emitting an invalid level', () => {
      const { html } = typesetBodyToHtml([
        '## A',
        'x',
        '### B',
        'x',
        '#### C',
        'x',
        '##### D',
        'x',
        '###### E',
        'x',
      ]);
      expect(html).toContain('<h6>E</h6>');
      expect(html).not.toMatch(/<h[7-9]>/);
    });
  });

  describe('horizontal rules', () => {
    it('keeps a rule between text as a scene ornament', () => {
      const { html } = typesetBodyToHtml(['Before.', '', '---', '', 'After.']);
      expect(html).toContain('<p class="ornament">* * *</p>');
    });

    it('drops rules that only separate a section from its heading', () => {
      const { html } = typesetBodyToHtml(['---', '', 'Only paragraph.', '', '---']);
      expect(html).not.toContain('ornament');
      expect(html).toBe('<p>Only paragraph.</p>');
    });
  });

  describe('figures', () => {
    it('embeds a resolved figure with its caption and width', () => {
      const figures = new Map([['plate.png', fig('file:///tmp/plate.png')]]);
      const { html, figuresUsed } = typesetBodyToHtml(
        ['![**Figure 1.** A plate.](plate.png){70%}'],
        figures,
      );
      expect(figuresUsed).toEqual(['plate.png']);
      expect(html).toContain('style="width:70%"');
      expect(html).toContain('<p class="caption"><strong>Figure 1.</strong> A plate.</p>');
      // Alt drops the markdown so a screen reader does not read asterisks aloud.
      expect(html).toContain('alt="Figure 1. A plate."');
    });

    it('falls back to a filename-derived label rather than an empty alt', () => {
      // An empty alt is filled by epub-gen-memory with the literal string
      // "image-placeholder", which a screen reader reads out.
      const figures = new Map([['p13-soil-profile.png', fig('file:///tmp/a.png')]]);
      const { html } = typesetBodyToHtml(['![](p13-soil-profile.png){70%}'], figures);
      expect(html).toContain('alt="Illustration: soil profile"');
      expect(html).not.toContain('image-placeholder');
    });

    it('reports an unresolved figure instead of dropping it silently', () => {
      const { html, missingFigures } = typesetBodyToHtml(['![](gone.png)'], new Map());
      expect(missingFigures).toEqual(['gone.png']);
      expect(html).toBe('');
    });
  });

  describe('blocks', () => {
    it('merges consecutive lines into one paragraph, as Markdown does', () => {
      const { html } = typesetBodyToHtml(['One line', 'and its continuation.']);
      expect(html).toBe('<p>One line and its continuation.</p>');
    });

    it('builds a table with per-column alignment', () => {
      const { html } = typesetBodyToHtml([
        '| When | Spend |',
        '| :--- | ----: |',
        '| April | $15 |',
      ]);
      expect(html).toContain('<th style="text-align:left">When</th>');
      expect(html).toContain('<th style="text-align:right">Spend</th>');
      expect(html).toContain('<td style="text-align:right">$15</td>');
    });

    it('closes a bullet list before opening a numbered one', () => {
      const { html } = typesetBodyToHtml(['- one', '1. two']);
      expect(html).toContain('</ul>');
      expect(html).toContain('<ol>');
    });

    it('counts words from prose, lists and tables', () => {
      const { words } = typesetBodyToHtml(['two words', '', '- three more words']);
      expect(words).toBe(5);
    });
  });

  describe('callouts', () => {
    // 7 NATIONAL PARKS writes all sixteen of its skip boxes as
    // `> ### SKIP IT / DO THIS INSTEAD`. `inline()` has no heading branch, so
    // that line reached the shipped ebook with its hashes intact — sixteen
    // callouts opening with literal markdown on the reader's screen.
    it('lifts a heading on the first line into the callout label', () => {
      const { html } = typesetBodyToHtml(['> ### SKIP IT / DO THIS INSTEAD', '> **Skip:** the queue.']);
      expect(html).toContain('<p class="callout-label">SKIP IT / DO THIS INSTEAD</p>');
      expect(html).not.toContain('###');
    });

    it('lifts a fully bold first line into the label too', () => {
      const { html } = typesetBodyToHtml(['> **NOBODY WARNED ME**', '> The shuttle stops at four.']);
      expect(html).toContain('<p class="callout-label">NOBODY WARNED ME</p>');
    });

    // Every `>` line used to become its own <blockquote>, so a three-line aside
    // came out as three separate boxes and a blank `>` line produced an empty
    // one.
    it('keeps a run of quote lines as ONE callout', () => {
      const { html } = typesetBodyToHtml(['> First line', '> and its continuation.', '', 'After.']);
      expect(html.match(/<blockquote/g)).toHaveLength(1);
      expect(html).toContain('<p>First line and its continuation.</p>');
    });

    it('treats a blank quote line as a paragraph break, not the end of the quote', () => {
      const { html } = typesetBodyToHtml(['> One.', '>', '> Two.']);
      expect(html.match(/<blockquote/g)).toHaveLength(1);
      expect(html.match(/<p>/g)).toHaveLength(2);
      expect(html).not.toContain('<p></p>');
    });

    // Two skip boxes run back to back with no blank line between them. The
    // label rule only looks at a quote's first line, so without a break the
    // second heading would be buried in the first callout's body and print raw.
    it('starts a new callout when a heading follows quote content', () => {
      const { html } = typesetBodyToHtml([
        '> ### FIRST BOX',
        '> Body one.',
        '> ### SECOND BOX',
        '> Body two.',
      ]);
      expect(html.match(/<blockquote/g)).toHaveLength(2);
      expect(html).toContain('<p class="callout-label">FIRST BOX</p>');
      expect(html).toContain('<p class="callout-label">SECOND BOX</p>');
      expect(html).not.toContain('###');
    });
  });

  describe('inline emphasis', () => {
    it('escapes before emphasising, so the manuscript cannot inject markup', () => {
      const { html } = typesetBodyToHtml(['A <script> and **bold** and *italic*.']);
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<em>italic</em>');
    });
  });
});

describe('plainTitleOf', () => {
  // `EpubChapter.title` becomes the <title> element, the nav.xhtml link text and
  // the NCX label at once. None of the three can hold markup, so a heading with
  // emphasis printed its asterisks on the Kindle contents screen: the appendix
  // banner of 7 NATIONAL PARKS listed itself as
  // "…CURRENT AS OF: **August 2026**" while the <h1> below it set the same words
  // in proper bold.
  it('strips emphasis from a title that carries it', () => {
    expect(plainTitleOf({ title: 'CURRENT AS OF: **August 2026**', number: null })).toBe(
      'CURRENT AS OF: August 2026',
    );
    expect(plainTitleOf({ title: 'A *quiet* morning', number: null })).toBe('A quiet morning');
  });

  // Print transliterates the drawn warning mark to `->` for the running head,
  // which sits in the margin beside body copy. A contents entry has no such
  // context and a leading arrow there reads as a stray character.
  it('drops a leading warning mark rather than transliterating it', () => {
    expect(plainTitleOf({ title: '⟶ ALL FIGURES ARE CURRENT', number: null })).toBe(
      'ALL FIGURES ARE CURRENT',
    );
  });

  it('keeps the chapter number, which is what makes the entry navigable', () => {
    expect(plainTitleOf({ title: 'Zion', number: 5 })).toBe('Chapter 5: Zion');
  });

  it('leaves an ordinary title exactly as written', () => {
    expect(plainTitleOf({ title: 'PART 2 — THE SEVEN PARKS', number: null })).toBe(
      'PART 2 — THE SEVEN PARKS',
    );
  });
});
