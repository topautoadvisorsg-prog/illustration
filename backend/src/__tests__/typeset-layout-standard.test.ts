import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { buildTypesetHtml, parseTypesetSections, chapterLabel } from '../pipeline/typeset/typeset-book.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from '../pipeline/typeset/layout-standards/educational-nonfiction-v1.js';
import {
  availableUpgrades,
  isKnownTypesetLayoutStandard,
  listTypesetLayoutStandards,
  resolveTypesetLayoutStandard,
  UnknownTypesetLayoutStandardError,
} from '../pipeline/typeset/layout-standards/registry.js';
import { gutterForPageCount, resolveTypesetDesign } from '../pipeline/typeset/layout-standards/resolve-design.js';
import { getProductionProfile } from '../pipeline/production-profiles/registry.js';

/** Only the rendered markup — the stylesheet always names every class. */
const bodyOf = (html: string): string => html.slice(html.indexOf('<body>'));

const configFor = (overrides: Record<string, unknown> = {}) =>
  ProjectConfigSchema.parse({
    volume: 1,
    title: 'NO ONE TOLD ME THAT',
    authorName: 'Nolan Whitlow',
    trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
    typography: { bodyPt: 12, lineHeight: 1.3, headingFont: 'Archivo', bodyFont: 'EB Garamond' },
    ...overrides,
  });

describe('typeset layout standard registry', () => {
  it('resolves the approved v1 standard', () => {
    const s = resolveTypesetLayoutStandard('educational-nonfiction-typeset@1');
    expect(s.id).toBe('educational-nonfiction-typeset@1');
    expect(s.type.headingFont).toBe('Archivo');
    expect(s.type.bodyFont).toBe('EB Garamond');
    expect(s.chaptersStartRecto).toBe(true);
  });

  /**
   * The whole point of pinning. A silent fallback would render an approved book
   * against a different design and report success — the exact failure this
   * registry exists to prevent.
   */
  it('THROWS on an unknown id rather than silently falling back', () => {
    expect(() => resolveTypesetLayoutStandard('educational-nonfiction-typeset@99')).toThrow(
      UnknownTypesetLayoutStandardError,
    );
    expect(() => resolveTypesetLayoutStandard('made-up')).toThrow(/never resolved to "latest"/);
    expect(isKnownTypesetLayoutStandard('made-up')).toBe(false);
  });

  it('exposes no "latest" alias', () => {
    const ids = listTypesetLayoutStandards().map((s) => s.id);
    expect(ids.every((id) => /@\d+$/.test(id))).toBe(true);
    expect(ids).not.toContain('educational-nonfiction-typeset');
    expect(ids).not.toContain('educational-nonfiction-typeset@latest');
  });

  it('reports upgrades without applying them', () => {
    // Only @1 is registered today, so there is nothing to move to.
    expect(availableUpgrades('educational-nonfiction-typeset@1')).toEqual([]);
    expect(availableUpgrades('unversioned')).toEqual([]);
  });
});

describe('design resolution precedence', () => {
  it('lets the project override only the operator-exposed fields', () => {
    const design = resolveTypesetDesign({
      standard: EDUCATIONAL_NONFICTION_TYPESET_V1,
      config: configFor({ typography: { headingFont: 'Oswald', bodyFont: 'Lora', bodyPt: 11, lineHeight: 1.5 } }),
    });
    expect(design.type.headingFont).toBe('Oswald');
    expect(design.type.bodyFont).toBe('Lora');
    expect(design.type.bodyPt).toBe(11);
    expect(design.type.lineHeight).toBe(1.5);
    // ...and nothing else. These belong to the standard.
    expect(design.type.sectionHeadingPt).toBe(EDUCATIONAL_NONFICTION_TYPESET_V1.type.sectionHeadingPt);
    expect(design.type.chapterTitleScale).toBe(EDUCATIONAL_NONFICTION_TYPESET_V1.type.chapterTitleScale);
    expect(design.margins.gutterIn).toBe(0.625);
  });

  it('follows the printer gutter bands when the page count is known', () => {
    const m = EDUCATIONAL_NONFICTION_TYPESET_V1.margins;
    expect(gutterForPageCount(m, 120)).toBe(0.5);
    expect(gutterForPageCount(m, 155)).toBe(0.625);
    expect(gutterForPageCount(m, 400)).toBe(0.75);
    expect(gutterForPageCount(m, 9999)).toBe(0.875);
    // Unknown page count keeps the base value — the previous behaviour.
    expect(gutterForPageCount(m, undefined)).toBe(0.625);
  });
});

describe('bw-educational-nonfiction production profile', () => {
  it('is registered and points at the pinned layout standard', () => {
    const p = getProductionProfile('bw-educational-nonfiction');
    expect(p.id).toBe('bw-educational-nonfiction');
    expect(p.bodyRenderTrack).toBe('typeset');
    expect(p.typesetLayoutStandardId).toBe('educational-nonfiction-typeset@1');
    expect(p.defaultStyleDnaId).toBe('bw-educational-clearline');
    expect(p.illustrationPolicy.mode).toBe('budgeted');
    expect(p.badgesEnabled).toBe(false);
  });

  it('does not guess illustration subjects for a budgeted book', () => {
    const p = getProductionProfile('bw-educational-nonfiction');
    expect(
      p.classification.deriveImageSubject(
        { chapterNumber: 1, chapterTitle: 't', entryTitle: 'e', bodyMarkdown: '', wordCount: 0, isChapterOpener: true, region: '' },
        'REFERENCE_PAGE',
      ),
    ).toBeNull();
  });

  it('leaves the field guide untouched', () => {
    const fg = getProductionProfile('wildlands-field-guide');
    expect(fg.bodyRenderTrack).toBe('ai-whole-page');
    expect(fg.typesetLayoutStandardId).toBeUndefined();
    expect(fg.badgesEnabled).toBe(true);
  });
});

describe('standard drives the rendered CSS (behaviour preserved)', () => {
  const html = () =>
    buildTypesetHtml({
      sections: parseTypesetSections('# Chapter 1\n\n## Only Chapter\n\nBody text here.\n'),
      config: configFor(),
      layoutStandard: EDUCATIONAL_NONFICTION_TYPESET_V1,
    });

  it('emits the approved geometry and type scale', () => {
    const css = html();
    expect(css).toContain('@page { size: 5.5in 8.5in; margin: 0.625in 0.5in 0.625in 0.625in; }');
    // 24% of the 7.25in text block — the approved opener sink.
    expect(css).toContain('padding-top: 1.740in');
    expect(css).toContain('font-size: 19pt'); // chapter title = 12 * 1.6
    expect(css).toContain('font-size: 11pt'); // kicker = 8.5 + 2.5
    expect(css).toContain('orphans: 2; widows: 2');
    expect(css).toContain('hyphens: auto');
    expect(css).toContain('text-indent: 1.2em');
    expect(css).toContain('text-transform: uppercase');
  });

  it('keeps running heads and the drop folio on opening pages', () => {
    const css = html();
    expect(css).toContain('"NO ONE TOLD ME THAT"'); // verso, literal book title
    expect(css).toContain('content: string(sectitle)'); // recto, per-chapter
    expect(css).toContain('content: counter(page)');
    // Openers drop the running head but keep the folio.
    expect(css).toContain("@page opener:first {");
    expect(css).toContain('@top-left { content: none; }');
    expect(css).toContain('@top-right { content: none; }');
  });
});

/**
 * Page furniture. Both defects these cover shipped invisibly: the pages looked
 * correct, and only measuring the PDF revealed that the whole book had no
 * running heads and every folio sat hard against the inside margin.
 */
describe('page furniture', () => {
  const css = () =>
    buildTypesetHtml({
      sections: parseTypesetSections('# Chapter 1\n\n## Only Chapter\n\nBody.\n'),
      config: configFor(),
      layoutStandard: EDUCATIONAL_NONFICTION_TYPESET_V1,
    });

  it('scopes the opener treatment with :first, not by moving the named page', () => {
    const html = css();
    // The section carries the named page and :first selects the first page of
    // that run. Two wrong ways this has already been done:
    //  - suppression on the unqualified @page opener applied to every page the
    //    section spans, removing running heads from the whole book;
    //  - moving `page: opener` onto the header forced a break when the flow
    //    returned to the default context, so each opener held only its heading
    //    and the book grew from 155 to 170 pages.
    expect(/\.tsec \{[^}]*page: opener/.test(html)).toBe(true);
    expect(/\.tsec > \.opener \{[^}]*page:\s*opener/.test(html)).toBe(false);
    expect(html).toContain('@page opener:first {');
    expect(html).not.toMatch(/@page opener \{/);
  });

  it('gives verso the book title and recto the section title', () => {
    const html = css();
    const left = /@page :left \{[\s\S]*?\n\}/.exec(html)?.[0] ?? '';
    const right = /@page :right \{[\s\S]*?\n\}/.exec(html)?.[0] ?? '';
    // Verso carries the book title as a literal string. The named-string route
    // resolved to nothing in the paged pass, so versos had no running head.
    expect(left).toContain('@top-left');
    expect(left).toContain('"NO ONE TOLD ME THAT"');
    expect(left).not.toContain('string(booktitle)');
    // Recto carries the section title, which must stay a named string.
    expect(right).toContain('@top-right');
    expect(right).toContain('string(sectitle)');
  });

  it('suppresses the running head on opener pages but keeps the drop folio', () => {
    const html = css();
    expect(html).toContain('@page opener:first {');
    expect(html).toContain('@top-left { content: none; }');
    expect(html).toContain('@top-right { content: none; }');
    // The drop folio is the one number allowed on an opening page, so the
    // OPENER rule must not blank @bottom-center. (The :blank rule legitimately
    // does — a parity blank carries nothing at all.)
    const openerRule = html.split('\n').find((l) => l.startsWith('@page opener:first')) ?? '';
    expect(openerRule).toContain('@top-left { content: none; }');
    expect(openerRule).not.toContain('@bottom-center');
  });

  it('aligns margin boxes with flex, not text-align', () => {
    const html = css();
    // The folio is a ::after that computes to display:block, so text-align
    // cannot move it. justify-content on a flex content div can.
    expect(html).toContain('.pagedjs_margin-content { display: flex;');
    expect(html).toMatch(/\.pagedjs_margin-bottom-center \.pagedjs_margin-content \{ justify-content: center; \}/);
    expect(html).toMatch(/\.pagedjs_margin-top-right \.pagedjs_margin-content,[\s\S]*?justify-content: flex-end/);
    expect(html).toMatch(/\.pagedjs_margin-top-left \.pagedjs_margin-content,[\s\S]*?justify-content: flex-start/);
  });

  it('emits the folio centred, at the standard size', () => {
    const html = css();
    expect(html).toContain('content: counter(page)');
    expect(html).toContain('font-size: 10pt'); // captionPt 9 + folioPtDelta 1
  });

  it('strips all furniture from parity blanks', () => {
    const html = css();
    // A blank verso inserted so the next chapter opens recto is not a page of
    // the book; a running head and folio on it read as a mistake.
    expect(html).toContain('@page :blank {');
    expect(html).toMatch(/@page :blank \{ @top-left \{ content: none; \} @top-right \{ content: none; \} @bottom-center \{ content: none; \} \}/);
  });

  it('honours a standard that suppresses the folio on openers', () => {
    const html = buildTypesetHtml({
      sections: parseTypesetSections('# Chapter 1\n\n## T\n\nBody.\n'),
      config: configFor(),
      layoutStandard: {
        ...EDUCATIONAL_NONFICTION_TYPESET_V1,
        furniture: { ...EDUCATIONAL_NONFICTION_TYPESET_V1.furniture, suppressFolioOnOpener: true },
      },
    });
    expect(html).toContain('@bottom-center { content: none; }');
  });
});

describe('markdown callouts', () => {
  const render = (md: string) =>
    buildTypesetHtml({
      sections: parseTypesetSections(`# Chapter 1\n\n## T\n\n${md}\n`),
      config: configFor(),
      layoutStandard: EDUCATIONAL_NONFICTION_TYPESET_V1,
    });

  it('renders a blockquote as a callout, not a paragraph with a literal >', () => {
    const html = render('> **THE LIE YOUR BRAIN IS TELLING YOU**\n>\n> Whatever this is, it is worse for me.');
    expect(html).toContain('<blockquote class="callout">');
    // The marker must not survive into the printed text.
    expect(html).not.toMatch(/<p[^>]*>\s*&gt;/);
    expect(html).toContain('THE LIE YOUR BRAIN IS TELLING YOU');
    expect(html).toContain('Whatever this is, it is worse for me.');
  });

  it('keeps blank-line-separated quote lines as separate paragraphs', () => {
    const html = render('> First para.\n>\n> Second para.');
    const block = /<blockquote class="callout">(.*?)<\/blockquote>/s.exec(html)?.[1] ?? '';
    expect((block.match(/<p>/g) ?? []).length).toBe(2);
  });

  it('does not swallow the text that follows a callout', () => {
    const html = render('> A quoted aside.\n\nOrdinary paragraph after.');
    expect(html).toContain('Ordinary paragraph after.');
    expect(html).toContain('<blockquote class="callout">');
  });

  it('styles the callout from the standard', () => {
    expect(render('> x')).toContain('border-left: 1.5pt solid currentColor');
  });
});

/**
 * This manuscript uses a single rule as a real scene break and a DOUBLE rule as
 * a structural marker before every chapter heading. Rendering both literally
 * left pairs of stray asterisk rows at the end of sections — page 4 was blank
 * but for two of them.
 */
describe('scene breaks', () => {
  const render = (md: string) =>
    buildTypesetHtml({
      sections: parseTypesetSections(`# Chapter 1\n\n## T\n\n${md}\n`),
      config: configFor(),
      layoutStandard: EDUCATIONAL_NONFICTION_TYPESET_V1,
    });
  const count = (html: string) => (html.match(/class="scene-break"/g) ?? []).length;

  it('renders a genuine mid-text scene break', () => {
    expect(count(render('First passage.\n\n---\n\nSecond passage.'))).toBe(1);
  });

  it('collapses consecutive rules into one break', () => {
    expect(count(render('Before.\n\n---\n---\n\nAfter.'))).toBe(1);
  });

  it('drops scene breaks left trailing at the end of a section', () => {
    expect(count(render('Only paragraph.\n\n---\n---'))).toBe(0);
    expect(count(render('Only paragraph.\n\n---'))).toBe(0);
  });

  it('keeps the text on either side intact', () => {
    const html = render('Before.\n\n---\n---\n\nAfter.');
    expect(html).toContain('Before.');
    expect(html).toContain('After.');
  });
});

/**
 * Page 15 was a heading plus one line above 85% white space. The unit is kept
 * indivisible so the heading is never stranded, and given one tightened-margin
 * chance to fit where it starts. Deliberately conservative: ordinary closing
 * subsections must be left alone.
 */
describe('terminal micro-section', () => {
  const render = (body: string) =>
    buildTypesetHtml({
      sections: parseTypesetSections(`# Chapter 1\n\n## T\n\n${body}\n`),
      config: configFor(),
      layoutStandard: EDUCATIONAL_NONFICTION_TYPESET_V1,
    });

  it('wraps a heading plus a single short line', () => {
    // Deliberately NOT the takeaway heading — that has its own component and
    // takes precedence. This covers the generic fallback.
    const html = render('Opening paragraph.\n\n### A closing note\n\nThis is not a race.');
    expect(html).toContain('<div class="tail-unit">');
    // The heading must travel WITH its text, never strand at the foot.
    const unit = /<div class="tail-unit">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
    expect(unit).toContain('<h3>');
    expect(unit).toContain('This is not a race.');
  });

  it('leaves an ordinary closing subsection alone', () => {
    const long = 'word '.repeat(120);
    const html = bodyOf(render(`Opening paragraph.\n\n### A normal section\n\n${long}`));
    expect(html).not.toContain('tail-unit');
  });

  it('does not fire when the chapter ends without a heading', () => {
    expect(bodyOf(render('Just a paragraph.\n\nAnd another one.'))).not.toContain('tail-unit');
  });

  it('does not fire on a heading with no body after it', () => {
    // Nothing to keep together; the heading is the section's last element.
    expect(bodyOf(render('Opening.\n\n### Dangling heading'))).not.toContain('tail-unit');
  });

  it('only ever wraps the FINAL heading', () => {
    const html = bodyOf(render('Intro.\n\n### First\n\nSome body here.\n\n### Last\n\nShort tail.'));
    expect((html.match(/tail-unit/g) ?? []).length).toBe(1);
    const unit = /<div class="tail-unit">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
    expect(unit).toContain('Last');
    expect(unit).not.toContain('First');
  });

  it('honours a standard that disables the rule', () => {
    const html = buildTypesetHtml({
      sections: parseTypesetSections('# Chapter 1\n\n## T\n\nP.\n\n### Tail\n\nShort.\n'),
      config: configFor(),
      layoutStandard: {
        ...EDUCATIONAL_NONFICTION_TYPESET_V1,
        terminalMicroSection: { ...EDUCATIONAL_NONFICTION_TYPESET_V1.terminalMicroSection, enabled: false },
      },
    });
    expect(bodyOf(html)).not.toContain('tail-unit');
  });
});

describe('callout labels', () => {
  const render = (md: string) =>
    buildTypesetHtml({
      sections: parseTypesetSections(`# Chapter 1\n\n## T\n\n${md}\n`),
      config: configFor(),
      layoutStandard: EDUCATIONAL_NONFICTION_TYPESET_V1,
    });

  it('lifts an all-bold first paragraph onto its own label line', () => {
    const html = render('> **THE LIE YOUR BRAIN IS TELLING YOU**\n>\n> Whatever this is, it is worse for me.');
    expect(html).toContain('<p class="callout-label">THE LIE YOUR BRAIN IS TELLING YOU</p>');
    expect(html).toContain('<p>Whatever this is, it is worse for me.</p>');
  });

  /**
   * The shape this manuscript actually uses: label, quote and body on
   * CONSECUTIVE quote lines with no blank between. Markdown lazy continuation
   * merges those into one paragraph, so checking the joined paragraph for
   * "entirely bold" never matched and the label printed inline mid-sentence.
   */
  it('lifts the label when it is the first LINE of a lazily-continued quote', () => {
    const html = render(
      "> **THE LIE YOUR BRAIN IS TELLING YOU**\n> *I've gotten worse.*\n> This one gets guys to quit sports.",
    );
    expect(html).toContain('<p class="callout-label">THE LIE YOUR BRAIN IS TELLING YOU</p>');
    // The label must not remain inside the body paragraph.
    expect(html).not.toMatch(/<p>[^<]*THE LIE YOUR BRAIN/);
    expect(html).toContain('This one gets guys to quit sports.');
  });

  it('is structural, not phrase-specific', () => {
    expect(render('> **ANY OTHER LABEL**\n>\n> Body.')).toContain('<p class="callout-label">ANY OTHER LABEL</p>');
  });

  it('leaves an unlabelled callout as plain paragraphs', () => {
    const html = bodyOf(render('> Just a quoted aside with no label.'));
    expect(html).toContain('<blockquote class="callout">');
    expect(html).not.toContain('callout-label');
  });

  it('does not treat a mid-callout bold paragraph as a label', () => {
    const html = bodyOf(render('> Opening line.\n>\n> **Bold but not first.**'));
    expect(html).not.toContain('callout-label');
  });
});

/**
 * bodyToHtml had no ordered-list branch, so 63 numbered lists across the
 * manuscript rendered as paragraphs with the numerals printed as literal text.
 */
describe('lists', () => {
  const render = (md: string) =>
    bodyOf(
      buildTypesetHtml({
        sections: parseTypesetSections(`# Chapter 1\n\n## T\n\n${md}\n`),
        config: configFor(),
        layoutStandard: EDUCATIONAL_NONFICTION_TYPESET_V1,
      }),
    );

  it('renders numbered steps as an ordered list, numerals as markup', () => {
    const html = render('What helps:\n\n1. **Heat.** A warm bath.\n2. **Stretching.** Calves.\n3. **Massage.** Rub it.');
    expect(html).toContain('<ol>');
    expect((html.match(/<li>/g) ?? []).length).toBe(3);
    // The numerals must not survive as text.
    expect(html).not.toMatch(/<li>1\./);
    expect(html).not.toMatch(/<p[^>]*>\s*1\./);
  });

  it('keeps a blank-line-separated (loose) numbered list as ONE list', () => {
    const html = render('Intro:\n\n1. **Slow down.** Rushed speech.\n\n2. **Lower volume.** Not a whisper.\n\n3. **Do not force it.** See above.');
    expect((html.match(/<ol>/g) ?? []).length).toBe(1);
    expect((html.match(/<li>/g) ?? []).length).toBe(3);
  });

  it('still renders bullets as an unordered list', () => {
    const html = render('- First\n- Second');
    expect(html).toContain('<ul>');
    expect((html.match(/<li>/g) ?? []).length).toBe(2);
  });

  it('closes one list when the other kind starts', () => {
    const html = render('- Bullet\n1. Numbered');
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
  });

  it('ends the list at the first non-item line', () => {
    const html = render('1. Step one.\n2. Step two.\n\nA following paragraph.');
    expect((html.match(/<ol>/g) ?? []).length).toBe(1);
    expect(html).toContain('A following paragraph.');
    expect(html).not.toMatch(/<li>A following paragraph/);
  });

  it('accepts the "1)" form', () => {
    expect(render('1) One\n2) Two')).toContain('<ol>');
  });
});

/**
 * 21 of 23 chapters end with the same closing heading plus one sentence. As a
 * normal H3 that landed on its own page filling ~7% whenever the previous page
 * was full. As a component it stays compact and travels with its chapter.
 */
describe('chapter takeaway component', () => {
  const render = (body: string) =>
    bodyOf(
      buildTypesetHtml({
        sections: parseTypesetSections(`# Chapter 1\n\n## T\n\n${body}\n`),
        config: configFor(),
        layoutStandard: EDUCATIONAL_NONFICTION_TYPESET_V1,
      }),
    );

  it('renders the recognised closing heading as a takeaway, not an H3', () => {
    const html = render('Body text.\n\n### The one thing to remember\n\nThis is not a race.');
    expect(html).toContain('<div class="takeaway">');
    expect(html).toContain('<p class="takeaway-label">THE ONE THING TO REMEMBER</p>');
    expect(html).toContain('This is not a race.');
    // It must stop being a heading.
    expect(html).not.toMatch(/<h3>The one thing to remember<\/h3>/i);
  });

  it('preserves the manuscript sentence exactly', () => {
    const html = render('B.\n\n### The one thing to remember\n\nYour body is growing in the wrong order on purpose, and it evens out.');
    expect(html).toContain('Your body is growing in the wrong order on purpose, and it evens out.');
  });

  it('keeps the block with the preceding content and unbroken', () => {
    const css = buildTypesetHtml({
      sections: parseTypesetSections('# Chapter 1\n\n## T\n\nB.\n\n### The one thing to remember\n\nShort.\n'),
      config: configFor(),
      layoutStandard: EDUCATIONAL_NONFICTION_TYPESET_V1,
    });
    expect(css).toMatch(/\.takeaway \{[^}]*break-inside: avoid/);
    expect(css).toMatch(/\.takeaway \{[^}]*break-before: avoid/);
    // The label can never be stranded from its sentence.
    expect(css).toMatch(/\.takeaway-label \{[\s\S]*?break-after: avoid/);
  });

  it('matches case-insensitively but leaves other headings alone', () => {
    expect(render('B.\n\n### THE ONE THING TO REMEMBER\n\nX.')).toContain('<div class="takeaway">');
    const other = render('B.\n\n### Something else entirely\n\nX.');
    expect(other).not.toContain('takeaway');
    expect(other).toContain('<h3>Something else entirely</h3>');
  });

  it('only applies to the FINAL heading of a chapter', () => {
    const html = render('### The one thing to remember\n\nMid-chapter.\n\n### Later section\n\nEnd body.');
    expect(html).not.toContain('<div class="takeaway">');
  });

  it('honours a standard that disables it', () => {
    const html = bodyOf(
      buildTypesetHtml({
        sections: parseTypesetSections('# Chapter 1\n\n## T\n\nB.\n\n### The one thing to remember\n\nShort.\n'),
        config: configFor(),
        layoutStandard: {
          ...EDUCATIONAL_NONFICTION_TYPESET_V1,
          chapterTakeaway: { ...EDUCATIONAL_NONFICTION_TYPESET_V1.chapterTakeaway, enabled: false },
        },
      }),
    );
    expect(html).not.toContain('<div class="takeaway">');
  });
});

/**
 * The book's front matter promises "boxes marked SEE A DOCTOR IF". Rendered as
 * ordinary H3s they were not boxes — on the nine blocks carrying medical
 * guidance, which are the ones most needing to be scannable.
 */
describe('alert panel', () => {
  const render = (md: string) =>
    bodyOf(
      buildTypesetHtml({
        sections: parseTypesetSections(`# Chapter 1\n\n## T\n\n${md}\n`),
        config: configFor(),
        layoutStandard: EDUCATIONAL_NONFICTION_TYPESET_V1,
      }),
    );

  it('boxes a recognised alert heading with its list and closing paragraph', () => {
    const html = render(
      'Body.\n\n### SEE A DOCTOR IF\n\n- One leg only.\n- Swelling or redness.\n\nOrdinary growing pains are both legs.\n\n### Next section\n\nAfter.',
    );
    expect(html).toContain('<aside class="alert-panel">');
    expect(html).toContain('<p class="alert-label">SEE A DOCTOR IF</p>');
    const panel = /<aside class="alert-panel">([\s\S]*?)<\/aside>/.exec(html)?.[1] ?? '';
    expect(panel).toContain('One leg only.');
    expect(panel).toContain('Ordinary growing pains are both legs.');
    // The panel must END at the next heading.
    expect(panel).not.toContain('Next section');
    expect(panel).not.toContain('After.');
    expect(html).toContain('<h3>Next section</h3>');
  });

  it('runs to the end of the section when no heading follows', () => {
    const html = render('Body.\n\n### SEE A DOCTOR IF\n\n- Item.\n\nClosing reassurance.');
    const panel = /<aside class="alert-panel">([\s\S]*?)<\/aside>/.exec(html)?.[1] ?? '';
    expect(panel).toContain('Item.');
    expect(panel).toContain('Closing reassurance.');
  });

  it('stops being a plain heading', () => {
    expect(render('B.\n\n### SEE A DOCTOR IF\n\n- x')).not.toContain('<h3>SEE A DOCTOR IF</h3>');
  });

  it('matches case-insensitively and leaves other headings alone', () => {
    expect(render('B.\n\n### See a doctor if\n\n- x')).toContain('<aside class="alert-panel">');
    expect(render('B.\n\n### Something else\n\n- x')).not.toContain('alert-panel');
  });

  it('boxes every occurrence, not just the first', () => {
    const html = render('B.\n\n### SEE A DOCTOR IF\n\n- a\n\n### Mid\n\nx\n\n### SEE A DOCTOR IF\n\n- b');
    expect((html.match(/<aside class="alert-panel">/g) ?? []).length).toBe(2);
  });

  it('honours a standard that disables it', () => {
    const html = bodyOf(
      buildTypesetHtml({
        sections: parseTypesetSections('# Chapter 1\n\n## T\n\nB.\n\n### SEE A DOCTOR IF\n\n- x\n'),
        config: configFor(),
        layoutStandard: {
          ...EDUCATIONAL_NONFICTION_TYPESET_V1,
          alertPanel: { ...EDUCATIONAL_NONFICTION_TYPESET_V1.alertPanel, enabled: false },
        },
      }),
    );
    expect(html).not.toContain('alert-panel');
    expect(html).toContain('<h3>SEE A DOCTOR IF</h3>');
  });

  it('draws a real border and keeps the box unbroken', () => {
    const css = buildTypesetHtml({
      sections: parseTypesetSections('# Chapter 1\n\n## T\n\nB.\n\n### SEE A DOCTOR IF\n\n- x\n'),
      config: configFor(),
      layoutStandard: EDUCATIONAL_NONFICTION_TYPESET_V1,
    });
    expect(css).toMatch(/\.alert-panel \{[^}]*border: 0\.75pt solid/);
    expect(css).toMatch(/\.alert-panel \{[^}]*break-inside: avoid/);
  });
});

describe('chapter label formats', () => {
  it('spells by default and never pre-uppercases', () => {
    expect(chapterLabel({ kind: 'chapter', number: 21 })).toBe('Chapter Twenty-One');
    expect(chapterLabel({ kind: 'chapter', number: 21 }, 'chapter-numeral')).toBe('Chapter 21');
    expect(chapterLabel({ kind: 'chapter', number: 21 }, 'none')).toBe('');
    expect(chapterLabel({ kind: 'front', number: null })).toBe('');
  });
});
