import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, LayoutOverrideSchema } from '@wildlands/shared';
import { buildTypesetHtml, parseTypesetSections } from '../pipeline/typeset/typeset-book.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from '../pipeline/typeset/layout-standards/educational-nonfiction-v1.js';
import {
  blockKindOf,
  computeBlockId,
  normaliseBlockText,
  slugifySection,
  stampBlockIds,
  type TypesetBlockRef,
} from '../pipeline/typeset/block-identity.js';
import { declarationsFor, overrideCss } from '../pipeline/typeset/layout-overrides.js';

const configFor = (overrides: Record<string, unknown> = {}) =>
  ProjectConfigSchema.parse({
    volume: 1,
    title: 'NO ONE TOLD ME THAT',
    authorName: 'Nolan Whitlow',
    trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
    typography: { bodyPt: 12, lineHeight: 1.3, headingFont: 'Archivo', bodyFont: 'EB Garamond' },
    ...overrides,
  });

const MD = `# Chapter 1

## Your Timeline Is Your Own

Opening paragraph of the chapter.

Second paragraph, which continues.

### A subsection

> **THE LIE YOUR BRAIN IS TELLING YOU**
> Whatever this is, it's worse for me.

- first item
- second item

### The one thing to remember

You are not behind.
`;

type HtmlInput = Parameters<typeof buildTypesetHtml>[0];

const render = (opts: Partial<HtmlInput> = {}): string =>
  buildTypesetHtml({
    sections: parseTypesetSections(MD),
    config: configFor(),
    layoutStandard: EDUCATIONAL_NONFICTION_TYPESET_V1,
    ...opts,
  });

const blocksOf = (): TypesetBlockRef[] => {
  const collect: TypesetBlockRef[] = [];
  render({ collectBlocks: collect });
  return collect;
};

/**
 * The whole point of block identity: an override must survive repagination.
 * Page numbers do not — this book moved 153 -> 157 -> 159 -> 156 during QA.
 */
describe('stable block identity', () => {
  it('derives an id from manuscript content, not from position', () => {
    const a = computeBlockId('your-timeline-is-your-own', 'p', 'Opening paragraph of the chapter.');
    const b = computeBlockId('your-timeline-is-your-own', 'p', 'Opening paragraph of the chapter.');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is unchanged by punctuation, case and whitespace differences', () => {
    expect(normaliseBlockText('You are NOT behind.')).toBe(normaliseBlockText('you  are — not behind!'));
  });

  it('separates blocks that differ only in section, kind or text', () => {
    const base = computeBlockId('sec-a', 'p', 'Same words here.');
    expect(computeBlockId('sec-b', 'p', 'Same words here.')).not.toBe(base);
    expect(computeBlockId('sec-a', 'h3', 'Same words here.')).not.toBe(base);
    expect(computeBlockId('sec-a', 'p', 'Different words.')).not.toBe(base);
  });

  it('distinguishes two identical blocks in the same section by occurrence', () => {
    const stamped = stampBlockIds(['<p>Keep going.</p>', '<p>Keep going.</p>'], 'sec', 'Sec');
    const ids = stamped.map((h) => /data-block-id="([0-9a-f]{8})"/.exec(h)?.[1]);
    expect(ids[0]).not.toBe(ids[1]);
    expect(new Set(ids).size).toBe(2);
  });

  it('slugifies from the title, so inserting a section does not renumber ids', () => {
    expect(slugifySection('The Smell Situation: Sweat, Deodorant, and the New Rules')).toBe(
      'the-smell-situation-sweat-deodorant-and-the-new',
    );
    // The cut must never leave a dangling hyphen.
    expect(slugifySection('A Very Long Title That Gets Cut Right Here Word')).not.toMatch(/-$/);
  });

  it('classifies each block by what it IS, wrappers before the tags they contain', () => {
    expect(blockKindOf('<div class="takeaway"><p class="takeaway-label">X</p><p>y</p></div>')).toBe('takeaway');
    expect(blockKindOf('<aside class="alert-panel"><p class="alert-label">X</p></aside>')).toBe('alert-panel');
    expect(blockKindOf('<blockquote class="callout"><p>x</p></blockquote>')).toBe('callout');
    expect(blockKindOf('<header class="opener"><h2>T</h2></header>')).toBe('opener');
    expect(blockKindOf('<h3>Heading</h3>')).toBe('h3');
    expect(blockKindOf('<ul><li>a</li></ul>')).toBe('ul');
    expect(blockKindOf('<p class="scene-break">* * *</p>')).toBe('scene-break');
    expect(blockKindOf('<p>Body.</p>')).toBe('p');
  });

  it('stamps every rendered block, including the chapter opener', () => {
    const html = render();
    const ids = [...html.matchAll(/data-block-id="([0-9a-f]{8})"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(5);
    expect(new Set(ids).size).toBe(ids.length); // no collisions in a real chapter
    const blocks = blocksOf();
    expect(blocks.map((b) => b.kind)).toContain('opener');
    expect(blocks.map((b) => b.kind)).toContain('callout');
    expect(blocks.map((b) => b.kind)).toContain('takeaway');
    expect(blocks.every((b) => b.sectionTitle === 'Your Timeline Is Your Own')).toBe(true);
  });

  it('gives the same block the same id across unrelated layout changes', () => {
    const before = blocksOf().find((b) => b.kind === 'takeaway')!;
    const collect: TypesetBlockRef[] = [];
    // A different trim, different body size, wider paragraph spacing: none of it
    // touches WHAT the block is, so its identity must not move.
    buildTypesetHtml({
      sections: parseTypesetSections(MD),
      config: configFor({
        trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0 },
        typography: { bodyPt: 11, lineHeight: 1.45, headingFont: 'Oswald', bodyFont: 'Lora' },
      }),
      layoutStandard: {
        ...EDUCATIONAL_NONFICTION_TYPESET_V1,
        paragraphs: { ...EDUCATIONAL_NONFICTION_TYPESET_V1.paragraphs, spacingEm: 0.6 },
      },
      collectBlocks: collect,
    });
    expect(collect.find((b) => b.kind === 'takeaway')!.blockId).toBe(before.blockId);
  });
});

describe('override compilation', () => {
  const known = new Set(['a1b2c3d4', 'deadbeef']);

  it('compiles each closed property to exactly one declaration', () => {
    expect(declarationsFor({ spaceBeforeEm: 0.4 })).toEqual(['margin-top: 0.4em;']);
    expect(declarationsFor({ spaceAfterEm: 1 })).toEqual(['margin-bottom: 1em;']);
    expect(declarationsFor({ keepWithNext: true })).toEqual(['break-after: avoid;']);
    expect(declarationsFor({ keepTogether: true })).toEqual(['break-inside: avoid;']);
    expect(declarationsFor({ breakBefore: 'page' })).toEqual(['break-before: page;']);
  });

  it('lets an explicit nudge refine a variant rather than fight it', () => {
    const d = declarationsFor({ variant: 'compact', spaceBeforeEm: 0.2 });
    expect(d[0]).toContain('margin-top: 0.4em');
    expect(d[d.length - 1]).toBe('margin-top: 0.2em;'); // the nudge wins, by order
  });

  it('emits rules targeting the block id, never a page', () => {
    const { css, applied } = overrideCss({ a1b2c3d4: { keepTogether: true } }, known);
    expect(css).toContain('[data-block-id="a1b2c3d4"] { break-inside: avoid; }');
    // Nothing in an override may select a PAGE. That is the failure mode this
    // whole design exists to prevent.
    expect(css).not.toMatch(/pagedjs_page|nth-child|:first|page-\d/);
    expect(applied).toEqual(['a1b2c3d4']);
  });

  it('names an override that matches no block instead of dropping it', () => {
    const { css, orphaned, applied } = overrideCss({ '0badc0de': { keepTogether: true } }, known);
    expect(orphaned).toEqual(['0badc0de']);
    expect(applied).toEqual([]);
    expect(css).toBe('');
  });

  it('is byte-stable regardless of object key order', () => {
    const a = overrideCss({ deadbeef: { spaceBeforeEm: 1 }, a1b2c3d4: { spaceAfterEm: 2 } }, known).css;
    const b = overrideCss({ a1b2c3d4: { spaceAfterEm: 2 }, deadbeef: { spaceBeforeEm: 1 } }, known).css;
    expect(a).toBe(b);
  });

  it('treats a note-only override as a comment, not a style', () => {
    expect(overrideCss({ a1b2c3d4: { note: 'watch this one' } }, known).css).toBe('');
  });

  it('carries the note into the stylesheet for the next reviewer', () => {
    const { css } = overrideCss({ a1b2c3d4: { keepTogether: true, note: 'thin chapter ending' } }, known);
    expect(css).toContain('/* thin chapter ending */');
  });

  it('cannot be used to inject arbitrary CSS', () => {
    // The schema is the guard: anything not in the closed set is rejected
    // outright rather than passed through to the stylesheet.
    expect(() => LayoutOverrideSchema.parse({ css: 'body { display: none }' })).toThrow();
    expect(() => LayoutOverrideSchema.parse({ variant: 'whatever' })).toThrow();
    expect(() => LayoutOverrideSchema.parse({ spaceBeforeEm: 99 })).toThrow();
    // A note lands inside a CSS comment, so it must not be able to close it and
    // escape into live declarations.
    const { css } = overrideCss({ a1b2c3d4: { keepTogether: true, note: 'x */ body{display:none} /*' } }, known);
    const rule = css.trim().split('\n').pop()!;
    expect(rule.match(/\*\//g)).toHaveLength(1); // the note closes its comment exactly once
    expect(rule.endsWith('*/')).toBe(true);
  });
});

describe('overrides in the rendered document', () => {
  it('applies a project override to the block it names, last in the stylesheet', () => {
    const takeaway = blocksOf().find((b) => b.kind === 'takeaway')!;
    const html = render({
      config: configFor({
        layoutOverrides: { [takeaway.blockId]: { spaceBeforeEm: 0.3, keepWithNext: true } },
      }),
    });
    const rule = `[data-block-id="${takeaway.blockId}"] { margin-top: 0.3em; break-after: avoid; }`;
    expect(html).toContain(rule);
    // Source order is what makes an override win, so it must come after the
    // standard's own rules and before the stylesheet closes.
    expect(html.indexOf(rule)).toBeGreaterThan(html.indexOf('.takeaway {'));
    expect(html.indexOf(rule)).toBeLessThan(html.indexOf('</style>'));
    expect(html).not.toContain('!important');
  });

  it('changes nothing when a project has no overrides', () => {
    const withEmpty = render({ config: configFor({ layoutOverrides: {} }) });
    expect(withEmpty).toBe(render());
    expect(withEmpty).not.toContain('LOCAL OVERRIDES');
  });
});
