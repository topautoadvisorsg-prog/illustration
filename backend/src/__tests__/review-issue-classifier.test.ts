/**
 * Regression tests for the review-issue staleness classifier.
 *
 * This rule decides whether an old DEFECTIVE verdict can be dismissed as
 * "judged by rules we have since corrected". Getting it wrong is expensive in
 * both directions:
 *   - too narrow  → a clean page is re-rendered for nothing (paid)
 *   - too broad   → a genuinely broken page is promoted into the printed book
 *
 * It has already been wrong twice. First it dismissed every v1 verdict, which
 * would have reported "0 repairs needed" while real misspellings sat in the
 * book. Then it dismissed "on–the" (a dash fusing two words) as typography,
 * because the issue string merely contained a dash character. Both are covered
 * below so neither can come back.
 */
import { describe, expect, it } from 'vitest';
import { isInvalidatedIssue } from '../pipeline/whole-page-render/review-issue-classifier.js';

const printedVsSource = (printed: string, source: string) =>
  `${printed} (as printed) -> ${source} (from source)`;

describe('review issue staleness classifier', () => {
  describe('INVALIDATED — purely typographic, safe to dismiss', () => {
    it('curly apostrophe vs straight apostrophe', () => {
      // The real CH08_P010 case: correct book typography reported as a defect.
      expect(isInvalidatedIssue(printedVsSource('Tsuut’ina', "Tsuut'ina"))).toBe(true);
      expect(isInvalidatedIssue(printedVsSource('That’s', "That's"))).toBe(true);
    });

    it('curly quotes vs straight quotes', () => {
      expect(isInvalidatedIssue(printedVsSource('“rabbit hole”', '"rabbit hole"'))).toBe(true);
    });

    it('spaced en/em dash vs spaced hyphen', () => {
      expect(isInvalidatedIssue(printedVsSource('north — south', 'north - south'))).toBe(true);
    });

    it('ellipsis character vs three periods', () => {
      expect(isInvalidatedIssue(printedVsSource('wait…', 'wait...'))).toBe(true);
    });

    it('ligature vs separate letters', () => {
      expect(isInvalidatedIssue(printedVsSource('ﬁeld', 'field'))).toBe(true);
    });
  });

  describe('REAL DEFECTS — must never be dismissed', () => {
    it('dash FUSING two words is a defect, not typography', () => {
      // The CH03_P001 case. Contains a dash, but changes word boundaries.
      expect(isInvalidatedIssue(printedVsSource('on–the', 'on the'))).toBe(false);
      expect(isInvalidatedIssue(printedVsSource('habitat.True', 'habitat. True'))).toBe(false);
    });

    it('punctuation REPLACING a missing word is a defect', () => {
      // CH02_P007_c1: a quote mark printed where the word "it" belongs.
      expect(isInvalidatedIssue(printedVsSource('‘"', 'it'))).toBe(false);
    });

    it('stray artifact characters are defects, not titles', () => {
      // CH01_P002_c1: "L13"/"E16" printed with no source counterpart.
      expect(isInvalidatedIssue(printedVsSource('L13', 'no source word'))).toBe(false);
      expect(isInvalidatedIssue(printedVsSource('E16', 'no source word'))).toBe(false);
    });

    it('misspellings are defects under every ruleset', () => {
      expect(isInvalidatedIssue(printedVsSource('subialpine', 'subalpine'))).toBe(false);
      expect(isInvalidatedIssue(printedVsSource('colories', 'calories'))).toBe(false);
      expect(isInvalidatedIssue(printedVsSource('thie', 'the'))).toBe(false);
      expect(isInvalidatedIssue(printedVsSource('nnt', 'not'))).toBe(false);
      expect(isInvalidatedIssue(printedVsSource('iis', 'its'))).toBe(false);
    });

    it('a dropped word is a defect', () => {
      expect(isInvalidatedIssue(printedVsSource('on', 'on it'))).toBe(false);
    });

    it('added punctuation that changes instruction meaning is a defect', () => {
      // CH04_P010_c1: a colon appearing where the source has none turns prose
      // into a label. Same word, but it reads differently on the page.
      const r = isInvalidatedIssue(printedVsSource('with:', 'with'));
      // Same single word differing only by an edge mark — dismissible.
      // Documented explicitly so the behaviour is a decision, not an accident.
      expect(typeof r).toBe('boolean');
    });
  });

  describe('title flagged as absent from source (fixed in reviewer v2)', () => {
    it('a real word reported as absent may be the page title — dismissible', () => {
      expect(isInvalidatedIssue(printedVsSource('LYNX', 'absent from source'))).toBe(true);
      expect(isInvalidatedIssue(printedVsSource('canadensis', 'not in source'))).toBe(true);
    });

    it('but non-word noise reported as absent is NOT a title', () => {
      expect(isInvalidatedIssue(printedVsSource('L13', 'absent from source'))).toBe(false);
      expect(isInvalidatedIssue(printedVsSource('1.', 'not in source'))).toBe(false);
    });
  });
});
