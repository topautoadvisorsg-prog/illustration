/**
 * C1 — section structure recognition, and the canonical completeness invariant
 * that has to catch it when it goes wrong.
 *
 * The bug this locks down: a manuscript that numbers chapters in its H2
 * (`## Chapter 1: Title`) and uses bare H1s for back matter had every H1 treated
 * as the title block and discarded with all its body text. On DIRT RICH that was
 * 8 of 24 sections — The Practical Bits, Appendices A-F and the Glossary —
 * lost silently, with the every-section invariant reporting success because it
 * compared the parse against itself.
 *
 * Half of these tests are therefore about what must NOT change. Two books ship
 * through this parser.
 */
import { describe, expect, it } from 'vitest';
import { detectHeadingConvention, parseTypesetSections } from '../pipeline/typeset/typeset-book.js';
import {
  assertCanonicalCompleteness,
  scanCanonicalHeadings,
  type BuiltSectionView,
} from '../pipeline/typeset/canonical-inventory.js';

/** The shape both shipped books use. This must parse exactly as it always did. */
const SHIPPED_SHAPE = `# TITLE BLOCK

Dropped: the title page is generated matter.

# FRONT MATTER

## A Note

Front body.

# Chapter 1

## The First One

Chapter one body.

# Chapter 2

## The Second One

Chapter two body.

# BACK MATTER

## Sources

Back body.
`;

/** The shape DIRT RICH uses, and that used to lose most of its back matter. */
const SELF_NUMBERED_SHAPE = `# DIRT RICH

Title block prose.

## A Note Before We Start

Front body.

## Chapter 1: Backyard Me v1.0

Chapter one body.

## Chapter 11: Backyard Me Now

Chapter eleven body.

# The Practical Bits

Practical body.

# Appendix A — The First Year

Appendix body.

# Glossary

Glossary body.

## Where I Checked

Sources body.

## About the Author

Bio body.
`;

const view = (s: ReturnType<typeof parseTypesetSections>[number]): BuiltSectionView => ({
  title: s.title,
  sourceTitle: s.sourceTitle,
  words: s.bodyLines.join(' ').split(/\s+/).filter(Boolean).length,
});

describe('parseTypesetSections — the shipped two-line shape is untouched', () => {
  const s = parseTypesetSections(SHIPPED_SHAPE);

  it('drops the leading title block and keeps every other section', () => {
    expect(s.map((x) => x.title)).toEqual(['A Note', 'The First One', 'The Second One', 'Sources']);
  });

  it('still reads chapter numbers from the H1 and titles from the H2', () => {
    const chapters = s.filter((x) => x.kind === 'chapter');
    expect(chapters.map((x) => [x.number, x.title])).toEqual([
      [1, 'The First One'],
      [2, 'The Second One'],
    ]);
  });

  it('still honours explicit FRONT MATTER / BACK MATTER markers', () => {
    expect(s.map((x) => x.kind)).toEqual(['front', 'chapter', 'chapter', 'back']);
  });

  it('reports sourceTitle equal to title where no number was split out', () => {
    for (const x of s) expect(x.sourceTitle).toBe(x.title);
  });
});

describe('parseTypesetSections — self-numbered chapters and bare-H1 back matter', () => {
  const s = parseTypesetSections(SELF_NUMBERED_SHAPE);

  it('keeps every section instead of discarding the bare H1s', () => {
    expect(s.map((x) => x.title)).toEqual([
      'A Note Before We Start',
      'Backyard Me v1.0',
      'Backyard Me Now',
      'The Practical Bits',
      'Appendix A — The First Year',
      'Glossary',
      'Where I Checked',
      'About the Author',
    ]);
  });

  it('splits the number out of the heading and recognises the chapter', () => {
    const chapters = s.filter((x) => x.kind === 'chapter');
    expect(chapters.map((x) => [x.number, x.title])).toEqual([
      [1, 'Backyard Me v1.0'],
      [11, 'Backyard Me Now'],
    ]);
  });

  it('preserves the author\'s original heading alongside the split (amendment 4)', () => {
    const chapters = s.filter((x) => x.kind === 'chapter');
    expect(chapters.map((x) => x.sourceTitle)).toEqual([
      'Chapter 1: Backyard Me v1.0',
      'Chapter 11: Backyard Me Now',
    ]);
  });

  it('files post-chapter sections as back matter, not front', () => {
    const byTitle = Object.fromEntries(s.map((x) => [x.title, x.kind]));
    expect(byTitle['A Note Before We Start']).toBe('front');
    expect(byTitle['The Practical Bits']).toBe('back');
    expect(byTitle['Appendix A — The First Year']).toBe('back');
    expect(byTitle['Glossary']).toBe('back');
    expect(byTitle['Where I Checked']).toBe('back');
    expect(byTitle['About the Author']).toBe('back');
  });

  it('carries body text for the sections that used to be dropped', () => {
    const practical = s.find((x) => x.title === 'The Practical Bits');
    expect(practical?.bodyLines.join(' ')).toContain('Practical body.');
  });

  it('still drops the manuscript title block', () => {
    expect(s.map((x) => x.title)).not.toContain('DIRT RICH');
  });
});

describe('parseTypesetSections — the additions do not fire where they would double-count', () => {
  it('an H2 under an explicit "# Chapter N" is not re-read as self-numbered', () => {
    const s = parseTypesetSections('# Chapter 4\n\n## Chapter 4: Belt And Braces\n\nBody.\n');
    expect(s).toHaveLength(1);
    expect(s[0]!.number).toBe(4);
    // The H1 supplied the number, so the H2 stays the title verbatim.
    expect(s[0]!.title).toBe('Chapter 4: Belt And Braces');
  });

  it('a heading that merely opens with the word "chapter" is not a chapter', () => {
    const s = parseTypesetSections('# Chapter 1\n\n## One\n\nBody.\n\n## Chapter And Verse\n\nMore.\n');
    const last = s[s.length - 1]!;
    expect(last.number).toBeNull();
    expect(last.title).toBe('Chapter And Verse');
  });

  it('a numbered chapter with no separator is left alone rather than guessed at', () => {
    const s = parseTypesetSections('# FRONT MATTER\n\n## Chapter 4 What To Plant\n\nBody.\n');
    expect(s[0]!.number).toBeNull();
    expect(s[0]!.kind).toBe('front');
  });

  it('accepts the separators a manuscript actually uses', () => {
    for (const sep of [':', ' —', ' -', '.']) {
      const s = parseTypesetSections(`## Chapter 7${sep} Preserving\n\nBody.\n`);
      expect(s[0]!.number, `separator "${sep}"`).toBe(7);
      expect(s[0]!.title).toBe('Preserving');
    }
  });
});

describe('heading convention — the regression guarantee for shipped books', () => {
  it('any structural H1 marker settles the manuscript as the original convention', () => {
    expect(detectHeadingConvention(SHIPPED_SHAPE)).toBe('marked');
    expect(detectHeadingConvention(SELF_NUMBERED_SHAPE)).toBe('self-numbered');
  });

  it('a marked manuscript that ALSO contains "## Chapter N:" H2s stays marked', () => {
    // The live case that regressed two Wildlands books: `# CHAPTER 1: ...`
    // markers plus stray `## Chapter N: ...` entry headings further down. A
    // per-heading rule promoted seven entries to chapters; the up-front decision
    // is what stops that.
    const md = `# CHAPTER 1: KNOW YOUR REGION

## An Entry

Body.

## Chapter 2: Not Really A Chapter

Body.
`;
    expect(detectHeadingConvention(md)).toBe('marked');
    const s = parseTypesetSections(md);
    expect(s.filter((x) => x.number !== null)).toHaveLength(1);
    expect(s[1]!.title).toBe('Chapter 2: Not Really A Chapter');
    expect(s[1]!.number).toBeNull();
  });

  it('a marked manuscript never gets back-matter inferred for it', () => {
    // Unmarked sections after a chapter stay `front` in the original convention,
    // exactly as they always did — wrong or not, it is what shipped.
    const md = '# Chapter 1\n\n## One\n\nBody.\n\n## Loose Section\n\nBody.\n';
    expect(parseTypesetSections(md).map((x) => x.kind)).toEqual(['chapter', 'front']);
  });
});

describe('canonical completeness invariant', () => {
  it('scans headings straight from the manuscript, ignoring fenced content', () => {
    const inv = scanCanonicalHeadings(
      '# Book\n\nProse.\n\n## Real\n\n```\n# not a heading\n```\n\n## Also Real\n\nMore.\n',
    );
    expect(inv.headings.map((h) => h.title)).toEqual(['Book', 'Real', 'Also Real']);
    expect(inv.titleBlock?.title).toBe('Book');
  });

  it('passes when every canonical section survived the parse', () => {
    const inv = scanCanonicalHeadings(SELF_NUMBERED_SHAPE);
    const r = assertCanonicalCompleteness(inv, parseTypesetSections(SELF_NUMBERED_SHAPE).map(view));
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.expectedSections).toBe(8);
    expect(r.builtSections).toBe(8);
  });

  it('CATCHES the exact failure that shipped past the old invariant', () => {
    const inv = scanCanonicalHeadings(SELF_NUMBERED_SHAPE);
    // Simulate the pre-fix parse: bare-H1 sections silently discarded.
    const truncated = parseTypesetSections(SELF_NUMBERED_SHAPE)
      .filter((x) => !['The Practical Bits', 'Appendix A — The First Year', 'Glossary'].includes(x.title))
      .map(view);
    const r = assertCanonicalCompleteness(inv, truncated);
    expect(r.ok).toBe(false);
    expect(r.failures.filter((f) => f.kind === 'missing-section')).toHaveLength(3);
    expect(r.failures.some((f) => f.message.includes('The Practical Bits'))).toBe(true);
    // And it must notice the words that went with them.
    expect(r.failures.some((f) => f.kind === 'word-loss')).toBe(true);
  });

  it('accepts a section matched by its preserved source heading', () => {
    // The canonical file says "Chapter 1: The Title"; the parse reports the title
    // as "The Title" with number 1. Splitting a number out is not a loss.
    const md = '# Book\n\nProse.\n\n## Chapter 1: The Title\n\nBody here.\n';
    const r = assertCanonicalCompleteness(scanCanonicalHeadings(md), parseTypesetSections(md).map(view));
    expect(r.ok).toBe(true);
  });

  it('is independent of the parser it validates', async () => {
    // Amendment 6: the invariant must not be able to agree with a broken parse
    // because it asked that parse what to expect. Enforced structurally rather
    // than by convention, because "don't wire these together" is exactly the
    // kind of rule a later cleanup deletes as duplication.
    //
    // Checks IMPORTS and CALLS, not mentions — the module's own doc comment
    // names the parser at length, explaining why it refuses to import it.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../pipeline/typeset/canonical-inventory.ts', import.meta.url), 'utf8'),
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    const imports = [...code.matchAll(/^\s*import\s[\s\S]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
    expect(imports, 'the invariant must import nothing from the pipeline it checks').toEqual([]);
    expect(code).not.toMatch(/parseTypesetSections\s*\(/);
    expect(code).not.toMatch(/\brequire\s*\(/);
  });
});
