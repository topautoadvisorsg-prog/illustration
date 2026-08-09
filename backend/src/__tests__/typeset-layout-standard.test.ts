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
    expect(css).toContain('padding-top: 2.417in'); // the one-third sink
    expect(css).toContain('font-size: 19pt'); // chapter title = 12 * 1.6
    expect(css).toContain('font-size: 10pt'); // kicker = 8.5 + 1.5
    expect(css).toContain('orphans: 2; widows: 2');
    expect(css).toContain('hyphens: auto');
    expect(css).toContain('text-indent: 1.2em');
    expect(css).toContain('text-transform: uppercase');
  });

  it('keeps running heads and the drop folio on opening pages', () => {
    const css = html();
    expect(css).toContain('content: string(booktitle)'); // verso
    expect(css).toContain('content: string(sectitle)'); // recto
    expect(css).toContain('content: counter(page)');
    // Openers drop the running head but keep the folio.
    expect(css).toMatch(/@page opener \{ @top-left \{ content: none; \} @top-right \{ content: none; \}\s*\}/);
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

describe('chapter label formats', () => {
  it('spells by default and never pre-uppercases', () => {
    expect(chapterLabel({ kind: 'chapter', number: 21 })).toBe('Chapter Twenty-One');
    expect(chapterLabel({ kind: 'chapter', number: 21 }, 'chapter-numeral')).toBe('Chapter 21');
    expect(chapterLabel({ kind: 'chapter', number: 21 }, 'none')).toBe('');
    expect(chapterLabel({ kind: 'front', number: null })).toBe('');
  });
});
