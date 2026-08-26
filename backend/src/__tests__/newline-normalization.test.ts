/**
 * WHAT A FAILURE HERE MEANS
 *
 * A manuscript's line-ending convention must not change what the book IS.
 *
 * This was a real defect, and a subtle one: the repository stores blobs with
 * CRLF and every checkout runs `core.autocrlf=true`, so two working trees at the
 * SAME COMMIT held byte-different copies of the same tracked fixture — 218,750
 * bytes in one, 221,030 in the other. A test asking "can the vendored face draw
 * every character in this manuscript?" then failed in one checkout and passed in
 * the other, reporting U+000D as an undrawable glyph. It is not a glyph.
 *
 * The fix is one normalization point, not a repository-wide rewrite. These tests
 * pin both halves of that: LF and CRLF must produce identical semantics, and the
 * normalizer must not become a general text-sanitising pass that hides real
 * defects.
 */
import { describe, expect, it } from 'vitest';
import {
  hasCarriageReturn,
  normalizeManuscriptNewlines,
} from '../pipeline/stage-1-ingestion/normalize-newlines.js';
import { parseManuscriptOutline } from '../pipeline/stage-1-ingestion/parse-manuscript-outline.js';

const LF = [
  '# A BOOK',
  '',
  '## Chapter 1: The First',
  '',
  'A paragraph of body text.',
  '',
  '- a list item',
  '- another',
  '',
  '> **A callout**',
  '> with a body line.',
  '',
  '## Chapter 2: The Second',
  '',
  'More body text.',
  '',
].join('\n');

const CRLF = LF.replace(/\n/g, '\r\n');
const CR_ONLY = LF.replace(/\n/g, '\r');

describe('newline normalization', () => {
  it('the two inputs really do differ, so this test is exercising something', () => {
    expect(hasCarriageReturn(LF)).toBe(false);
    expect(hasCarriageReturn(CRLF)).toBe(true);
    expect(CRLF.length).toBeGreaterThan(LF.length);
  });

  it('collapses CRLF to LF', () => {
    expect(normalizeManuscriptNewlines(CRLF)).toBe(LF);
  });

  it('collapses a lone CR to LF, which is the older Mac convention', () => {
    expect(normalizeManuscriptNewlines(CR_ONLY)).toBe(LF);
  });

  it('leaves LF alone', () => {
    expect(normalizeManuscriptNewlines(LF)).toBe(LF);
  });

  it('is idempotent', () => {
    const once = normalizeManuscriptNewlines(CRLF);
    expect(normalizeManuscriptNewlines(once)).toBe(once);
  });

  it('leaves NO carriage return behind for a character-level check to trip on', () => {
    expect(normalizeManuscriptNewlines(CRLF)).not.toContain('\r');
    expect([...normalizeManuscriptNewlines(CRLF)].filter((c) => c === '\r')).toEqual([]);
  });
});

describe('normalization does not become a general text sanitiser', () => {
  /**
   * Every character below is a REAL content defect that a QA layer is supposed
   * to find. If the normalizer starts eating them, those layers go quiet and the
   * defects ship.
   */
  const KEEP: Array<[string, string]> = [
    ['zero-width space', '​'],
    ['non-breaking space', ' '],
    ['soft hyphen', '­'],
    ['left double quote', '“'],
    ['em dash', '—'],
    ['tab', '\t'],
    ['form feed', '\f'],
    ['vertical tab', '\v'],
    ['BOM', '﻿'],
  ];

  for (const [name, ch] of KEEP) {
    it(`preserves the ${name}`, () => {
      expect(normalizeManuscriptNewlines(`before${ch}after`)).toContain(ch);
    });
  }

  it('does not collapse blank lines, which carry paragraph structure', () => {
    expect(normalizeManuscriptNewlines('a\r\n\r\n\r\nb')).toBe('a\n\n\nb');
  });

  it('does not trim leading or trailing whitespace', () => {
    expect(normalizeManuscriptNewlines('  a  ')).toBe('  a  ');
  });
});

describe('the parser produces the same book from either convention', () => {
  it('parses LF and CRLF to an identical outline', () => {
    const a = parseManuscriptOutline(LF);
    const b = parseManuscriptOutline(CRLF);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('reports no carriage-return artefacts in any heading title', () => {
    for (const chapter of parseManuscriptOutline(CRLF).chapters) {
      expect(chapter.title).not.toContain('\r');
    }
  });

  it('agrees on warnings, so CRLF cannot invent or hide a structural problem', () => {
    expect(parseManuscriptOutline(CRLF).warnings).toEqual(parseManuscriptOutline(LF).warnings);
  });
});
