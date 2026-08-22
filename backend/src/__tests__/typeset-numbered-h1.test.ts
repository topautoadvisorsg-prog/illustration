/**
 * C3 — the numbered-H1 chapter convention, and the components 7 NATIONAL PARKS
 * WITHOUT THE ROOKIE MISTAKES needs.
 *
 * The defects these lock down, all six measured on the real manuscript before
 * the fix and all six SILENT — the build reported success every time:
 *
 *   D1  0 of 12 chapters recognised. 126 sections instead of 21, because every
 *       H2 was promoted to a top-level section and took a forced page break.
 *   D2  the composite-narrator disclosure and both author notes dropped, with
 *       177 non-blank lines, because `# FRONT MATTER` was followed by an H3 and
 *       an H3 opened nothing.
 *   D3  46 table rows reaching the paragraph branch and printing as pipes.
 *   D4  16 skip boxes printing `### SKIP IT / DO THIS INSTEAD` literally.
 *   D5  16 warning marks deleted at ingestion (see sanitize-manuscript.test.ts).
 *   D6  the copyright sign deleted from the copyright page (ditto).
 *
 * HALF OF THIS FILE IS ABOUT WHAT MUST NOT CHANGE. Three books have shipped
 * through this parser and two standards are approved and printed. Every
 * addition here is gated so that it can only fire where the old code dropped
 * content on the floor, and the pins below are what makes that checkable rather
 * than merely claimed.
 */
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import {
  buildTypesetHtml,
  detectHeadingConvention,
  parseTypesetSections,
  subheadOffsetFor,
} from '../pipeline/typeset/typeset-book.js';
import { NATIONAL_PARKS_GUIDE_TYPESET_V1 } from '../pipeline/typeset/layout-standards/national-parks-guide-v1.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V1 } from '../pipeline/typeset/layout-standards/trade-nonfiction-guide-v1.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from '../pipeline/typeset/layout-standards/educational-nonfiction-v1.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V2 } from '../pipeline/typeset/layout-standards/educational-nonfiction-v2.js';

/** The shape both Wildlands volumes and NO ONE TOLD ME THAT use. */
const MARKED_SHAPE = `# TITLE BLOCK

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

/** The shape DIRT RICH uses. */
const SELF_NUMBERED_SHAPE = `# DIRT RICH

Title block prose.

## A Note Before We Start

Front body.

## Chapter 1: Backyard Me

Chapter one body.

## Chapter 2: Composting

Chapter two body.

# Appendix A

Appendix body.
`;

/** The shape 7 NATIONAL PARKS uses. */
const NUMBERED_H1_SHAPE = `# 7 NATIONAL PARKS WITHOUT THE ROOKIE MISTAKES

### A First-Timer's Deep Guide

**Tom Everett**

# CONTENTS

- Chapter one

# FRONT MATTER

### A note on how this book was written

First note body.

### The other note, the legal one

Second note body.

# INTRODUCTION

Introduction body.

# PART 1 — BEFORE YOU GO

# 1 — WHICH OF THESE SEVEN IS ACTUALLY YOURS

## Question one

Body under a section.

### A sub-question

Deeper body.

# PART 2 — THE SEVEN PARKS

# 4 — Great Smoky Mountains

## Getting there

More body.

# BACK MATTER

# APPENDIX — FEES

Appendix body.
`;

const CONFIG = ProjectConfigSchema.parse({
  volume: 1,
  title: '7 National Parks Without the Rookie Mistakes',
  authorName: 'Tom Everett',
  trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0 },
  typography: { bodyPt: 11, lineHeight: 1.35, headingFont: 'Archivo', bodyFont: 'EB Garamond' },
});

const render = (markdown: string, standard = NATIONAL_PARKS_GUIDE_TYPESET_V1): string =>
  buildTypesetHtml({
    sections: parseTypesetSections(markdown),
    config: CONFIG,
    margins: { topIn: 0.75, bottomIn: 0.75, outsideIn: 0.625, gutterIn: 0.75 },
    layoutStandard: standard,
  });

// ───────────────────────────────────────────────────────────────────────────
describe('heading convention — the shipped shapes cannot move', () => {
  it('reads `# Chapter N` as the original marked convention', () => {
    expect(detectHeadingConvention(MARKED_SHAPE)).toBe('marked');
  });

  it('reads `## Chapter N: Title` as self-numbered', () => {
    expect(detectHeadingConvention(SELF_NUMBERED_SHAPE)).toBe('self-numbered');
  });

  it('a real chapter marker beats numbered H1s that happen to be present', () => {
    // A book with BOTH must take the original path: `# Chapter N` is decisive.
    const both = `${MARKED_SHAPE}\n# 9 — A Numbered Divider\n\nBody.\n\n# 10 — Another\n\nBody.\n`;
    expect(detectHeadingConvention(both)).toBe('marked');
  });

  it('one lone numbered H1 does not flip a manuscript to the new convention', () => {
    const stray = `# FRONT MATTER\n\n## A Note\n\nBody.\n\n# 3 — Notes\n\nBody.\n`;
    expect(detectHeadingConvention(stray)).toBe('marked');
  });
});

describe('heading convention — numbered-h1', () => {
  it('is detected despite the manuscript also carrying matter markers', () => {
    // This is the case that used to return `marked` and lose every chapter:
    // `# FRONT MATTER` is a structure marker, so detection settled on the first
    // one it saw and never looked for the chapters.
    expect(detectHeadingConvention(NUMBERED_H1_SHAPE)).toBe('numbered-h1');
  });

  it('recognises every numbered chapter, with its number and short title', () => {
    const secs = parseTypesetSections(NUMBERED_H1_SHAPE);
    const chapters = secs.filter((s) => s.kind === 'chapter');
    expect(chapters.map((c) => [c.number, c.title])).toEqual([
      [1, 'WHICH OF THESE SEVEN IS ACTUALLY YOURS'],
      [4, 'Great Smoky Mountains'],
    ]);
    // The authored heading survives for a standard that wants to set it whole.
    expect(chapters[1]!.sourceTitle).toBe('4 — Great Smoky Mountains');
  });

  it('keeps H2 as a subhead INSIDE the chapter rather than a section of its own', () => {
    const secs = parseTypesetSections(NUMBERED_H1_SHAPE);
    const ch1 = secs.find((s) => s.number === 1)!;
    expect(ch1.bodyLines).toContain('## Question one');
    expect(secs.some((s) => s.title === 'Question one')).toBe(false);
  });

  it('does not read the title block as chapter 7', () => {
    // `# 7 NATIONAL PARKS WITHOUT THE ROOKIE MISTAKES` opens with a numeral. The
    // required separator is what stops it becoming a chapter, which would have
    // typeset the title page twice and renumbered the book.
    const secs = parseTypesetSections(NUMBERED_H1_SHAPE);
    expect(secs.some((s) => s.number === 7)).toBe(false);
    expect(secs.some((s) => s.title.includes('NATIONAL PARKS WITHOUT'))).toBe(false);
  });

  it('opens a section for each front-matter H3, as peers', () => {
    const secs = parseTypesetSections(NUMBERED_H1_SHAPE);
    const notes = secs.filter((s) => s.title.startsWith('A note') || s.title.startsWith('The other note'));
    expect(notes).toHaveLength(2);
    expect(notes[0]!.bodyLines.join(' ')).toContain('First note body.');
    expect(notes[1]!.bodyLines.join(' ')).toContain('Second note body.');
    // The second must not be swallowed as a subhead of the first.
    expect(notes[0]!.bodyLines.join(' ')).not.toContain('Second note body.');
  });

  it('does not call a mid-book part divider back matter', () => {
    // `PART 2` arrives after three chapters but four chapters BEFORE the book's
    // own `# BACK MATTER`. A declared marker outranks the inference.
    const secs = parseTypesetSections(NUMBERED_H1_SHAPE);
    expect(secs.find((s) => s.title.startsWith('PART 2'))!.kind).toBe('front');
    expect(secs.find((s) => s.title.startsWith('APPENDIX'))!.kind).toBe('back');
  });

  it('loses nothing: every non-blank body line lands in some section', () => {
    const secs = parseTypesetSections(NUMBERED_H1_SHAPE);
    for (const body of ['First note body.', 'Second note body.', 'Introduction body.', 'Body under a section.', 'Deeper body.', 'More body.', 'Appendix body.']) {
      expect(secs.some((s) => s.bodyLines.includes(body))).toBe(true);
    }
  });
});

describe('subhead demotion', () => {
  it('is derived from the parse, not configured', () => {
    expect(subheadOffsetFor(parseTypesetSections(NUMBERED_H1_SHAPE))).toBe(1);
    // An H2 can never reach bodyLines in the other conventions — the parser
    // always consumes it into a section — so the offset is provably 0 there.
    expect(subheadOffsetFor(parseTypesetSections(MARKED_SHAPE))).toBe(0);
    expect(subheadOffsetFor(parseTypesetSections(SELF_NUMBERED_SHAPE))).toBe(0);
  });

  it('sets the manuscript H2 as h3 and its H3 as h4', () => {
    const html = render(NUMBERED_H1_SHAPE);
    expect(html).toContain('<h3>Question one</h3>');
    expect(html).toContain('<h4>A sub-question</h4>');
    expect(html).not.toContain('## Question one');
  });

  it('leaves the shipped conventions at their original mapping', () => {
    const html = render(`# Chapter 1\n\n## T\n\n### A Sub\n\nBody.\n`, EDUCATIONAL_NONFICTION_TYPESET_V1);
    expect(html).toContain('<h3>A Sub</h3>');
    expect(html).not.toContain('<h4>A Sub</h4>');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('skip boxes — a heading is a callout label (D4)', () => {
  const SKIP = `# 1 — A Chapter

## A Section

> ### SKIP IT / DO THIS INSTEAD
> **Skip:** the crowded loop at ten a.m.
> **Do this instead:** go at dawn.

# 2 — Another

Body.
`;

  it('lifts the heading out as the label instead of printing the hashes', () => {
    const html = render(SKIP);
    expect(html).toContain('<p class="callout-label">SKIP IT / DO THIS INSTEAD</p>');
    expect(html).not.toContain('### SKIP IT');
    expect(html).not.toMatch(/callout">\s*<p>#/);
  });

  it('still lifts a fully-bold first line, as it always did', () => {
    const html = render(`# 1 — A\n\n## S\n\n> **LABEL**\n> Body.\n\n# 2 — B\n\nBody.\n`);
    expect(html).toContain('<p class="callout-label">LABEL</p>');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('warning marks (D5)', () => {
  const WARN = `# 1 — A Chapter

## A Section

⚠ **Check the water level and flash flood forecast before you go in.** Conditions govern this hike.

An ordinary paragraph.

# 2 — Another

Body.
`;

  it('draws the mark and flags the paragraph as a warning', () => {
    const html = render(WARN);
    expect(html).toContain('class="gl gl-warn"');
    // The first paragraph after a heading also carries `first`, and a paragraph
    // nested inside a keep-with-next group is not the block that gets stamped
    // with the id — so assert the class list exactly as it is emitted.
    expect(html).toContain('<p class="first warn">');
    // The manuscript's own words are untouched around it.
    expect(html).toContain('Conditions govern this hike.');
  });

  it('does not box it — the operator ruled against panels for these', () => {
    const html = render(WARN);
    expect(html).not.toMatch(/<aside class="alert-panel">[\s\S]{0,200}flash flood/);
  });

  it('leaves an ordinary paragraph alone', () => {
    expect(render(WARN)).toContain('<p>An ordinary paragraph.</p>');
  });
});

describe('NOBODY WARNED ME is the component that IS boxed', () => {
  const NWM = `# 4 — Great Smoky Mountains

## Getting there

Body.

## NOBODY WARNED ME

Mid-October is the worst possible week to come.

## How I'd spend the time

More body.

# 5 — Zion

Body.
`;

  it('becomes a panel with the heading as its label', () => {
    const html = render(NWM);
    expect(html).toMatch(/<aside [^>]*class="alert-panel">/);
    expect(html).toContain('<p class="alert-label">NOBODY WARNED ME</p>');
    expect(html).toContain('Mid-October is the worst possible week to come.');
  });

  it('does not swallow the section that follows it', () => {
    const html = render(NWM);
    const panel = html.slice(html.search(/<aside [^>]*class="alert-panel">/), html.indexOf('</aside>'));
    expect(panel).not.toContain('More body.');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('structural rules at headings', () => {
  const RULES = `# 1 — A Chapter

## A Section

---

Body one.

---

Body two.

---

## Next Section

Body three.

# 2 — Another Chapter

Body four.
`;

  it('drops a rule touching a heading and keeps a real scene break', () => {
    const html = render(RULES);
    // Three rules authored; only the one between two passages of prose prints.
    // Count ELEMENTS, not occurrences: the stylesheet also names .scene-break,
    // so a bare string count reports one more than the page actually sets.
    expect(html.match(/<p[^>]*class="scene-break"/g) ?? []).toHaveLength(1);
  });

  it('leaves the shipped standards printing every rule, as approved', () => {
    for (const standard of [
      EDUCATIONAL_NONFICTION_TYPESET_V1,
      EDUCATIONAL_NONFICTION_TYPESET_V2,
      TRADE_NONFICTION_GUIDE_TYPESET_V1,
    ]) {
      expect(standard.blocks.sceneBreakAtHeading ?? 'print').toBe('print');
      const html = render(`# Chapter 1\n\n## T\n\n---\n\nBody.\n\n### Sub\n\nMore.\n`, standard);
      expect(html).toMatch(/<p[^>]*class="scene-break"/);
    }
  });
});
