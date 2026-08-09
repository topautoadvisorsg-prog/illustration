import { describe, expect, it } from 'vitest';
import {
  assertTypesetComplete,
  TypesetIncompleteError,
} from '../pipeline/typeset/render-typeset.js';
import {
  buildTypesetHtml,
  chapterLabel,
  parseTypesetSections,
  spellChapterNumber,
  PAGED_DONE_HOOK,
  TYPESET_DONE_JS,
  typesetMarginsForTrim,
} from '../pipeline/typeset/typeset-book.js';
import { ProjectConfigSchema } from '@wildlands/shared';

/**
 * These guard the defect where a render was accepted as complete because the
 * page count had merely stopped changing for 1.5s. Two consecutive renders of
 * the same book returned 31 and 64 pages, each reporting zero overflow, because
 * every page that HAD been laid out was fine — the book simply stopped early.
 */
describe('typeset completion signalling', () => {
  it('injects the Paged.js completion hook BEFORE the polyfill', () => {
    const sections = parseTypesetSections('# Chapter 1\n\n## Only Chapter\n\nSome body text.\n');
    const config = ProjectConfigSchema.parse({
      volume: 1, title: 'T', authorName: 'A',
      trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
    });
    const html = buildTypesetHtml({
      sections, config, margins: typesetMarginsForTrim(config.trimSize),
      polyfillJs: '/*POLYFILL*/',
    });

    const hookAt = html.indexOf('window.PagedConfig');
    const polyfillAt = html.indexOf('/*POLYFILL*/');
    expect(hookAt).toBeGreaterThan(-1);
    expect(polyfillAt).toBeGreaterThan(-1);
    // Order matters: the polyfill reads window.PagedConfig as it initialises,
    // so a hook defined afterwards is silently ignored and never fires.
    expect(hookAt).toBeLessThan(polyfillAt);
    expect(html).toContain('__wlTypesetDone');
  });

  it('omits the hook when no polyfill is requested', () => {
    const sections = parseTypesetSections('# Chapter 1\n\n## Only Chapter\n\nBody.\n');
    const config = ProjectConfigSchema.parse({
      volume: 1, title: 'T', authorName: 'A',
      trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
    });
    const html = buildTypesetHtml({ sections, config });
    expect(html).not.toContain('window.PagedConfig');
  });

  it('waits on the completion flag, not on a page-count plateau', () => {
    expect(TYPESET_DONE_JS).toContain('__wlTypesetDone');
    expect(PAGED_DONE_HOOK).toContain('after');
    // The old heuristic must not come back.
    expect(TYPESET_DONE_JS).not.toMatch(/streak|pagedjs_page.*length\s*===/);
  });
});

describe('assertTypesetComplete', () => {
  const expected = ['A Note Before You Start', 'Chapter One', 'Sources', 'About the Author'];

  it('accepts a render containing every section', () => {
    expect(() => assertTypesetComplete([...expected], expected)).not.toThrow();
  });

  it('rejects a truncated render even though its pages looked fine', () => {
    const truncated = ['A Note Before You Start', 'Chapter One'];
    expect(() => assertTypesetComplete(truncated, expected)).toThrow(TypesetIncompleteError);
    expect(() => assertTypesetComplete(truncated, expected)).toThrow(/2 of 4 sections/);
  });

  it('names what went missing so the failure is actionable', () => {
    try {
      assertTypesetComplete(['A Note Before You Start'], expected);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('Chapter One');
      expect((error as Error).message).toContain('no overflow');
    }
  });

  it('does not throw for a book with no sections at all', () => {
    expect(() => assertTypesetComplete([], [])).not.toThrow();
  });
});

/** The chapter label is part of the locked spec, so pin it against drift. */
describe('chapter labels follow CHAPTER_BOOK_STANDARD §3', () => {
  it('spells numbers as words', () => {
    expect(spellChapterNumber(1)).toBe('One');
    expect(spellChapterNumber(20)).toBe('Twenty');
    expect(spellChapterNumber(21)).toBe('Twenty-One');
    expect(spellChapterNumber(23)).toBe('Twenty-Three');
  });

  it('falls back to the numeral outside 1-99 rather than inventing a spelling', () => {
    expect(spellChapterNumber(100)).toBe('100');
    expect(spellChapterNumber(0)).toBe('0');
  });

  it('labels chapters and leaves matter unlabelled', () => {
    expect(chapterLabel({ kind: 'chapter', number: 21 })).toBe('Chapter Twenty-One');
    expect(chapterLabel({ kind: 'front', number: null })).toBe('');
    expect(chapterLabel({ kind: 'back', number: null })).toBe('');
    // Uppercasing is the .kicker stylesheet's job, never the formatter's.
    expect(chapterLabel({ kind: 'chapter', number: 1 })).toBe('Chapter One');
  });
});
