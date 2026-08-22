/**
 * Manuscript ingestion sanitizer — production safety guard tests.
 *
 * Inputs are built from \u escapes so the test does not depend on the test
 * file's own encoding to reproduce the mojibake / emoji bytes.
 */

import { describe, expect, it } from 'vitest';
import {
  sanitizeManuscript,
  repairMojibake,
  stripDecorativeMarkers,
  strippedPictographs,
} from '../pipeline/stage-1-ingestion/sanitize-manuscript.js';

// Mojibake = UTF-8 punctuation bytes (E2 80 xx) decoded as Windows-1252.
const MJ_EMDASH = 'â€”'; // -> em dash U+2014
const MJ_ENDASH = 'â€“'; // -> en dash U+2013
const MJ_RSQUO = 'â€™'; // -> right single quote U+2019
const MJ_LDQUO = 'â€œ'; // -> left double quote U+201C
const MJ_RDQUO = 'â€'; // -> right double quote U+201D
const MJ_ELLIPSIS = 'â€¦'; // -> ellipsis U+2026

const PINE = '\u{1F332}'; // 🌲 evergreen tree
const WARNING = '⚠️'; // ⚠️ warning sign + variation selector

describe('sanitizer — mojibake repair', () => {
  it('repairs em/en dashes, curly quotes, apostrophes, and ellipsis', () => {
    const dirty = `spruce${MJ_EMDASH}fir; 3${MJ_ENDASH}5 m; it${MJ_RSQUO}s ${MJ_LDQUO}here${MJ_RDQUO}${MJ_ELLIPSIS}`;
    expect(repairMojibake(dirty)).toBe('spruce—fir; 3–5 m; it’s “here”…');
  });

  it('leaves no leftover mojibake artifacts', () => {
    const out = repairMojibake(`a${MJ_EMDASH}b${MJ_RSQUO}c`);
    expect(out).not.toContain('â'); // no a-circumflex
    expect(out).not.toContain('€'); // no euro sign
  });
});

describe('sanitizer — decorative marker removal', () => {
  it('removes literal ICON: markers from a heading, keeping the heading text', () => {
    expect(sanitizeManuscript('### [ICON: pine] Northern Boreal Zone')).toBe('### Northern Boreal Zone');
    expect(sanitizeManuscript('## ICON: mountain Presidential Range')).toBe('## Presidential Range');
    expect(stripDecorativeMarkers('see (ICON: leaf) note')).toContain('see ');
    expect(stripDecorativeMarkers('see (ICON: leaf) note')).not.toContain('ICON');
  });

  it('removes emoji but keeps the surrounding words', () => {
    expect(sanitizeManuscript(`Pine ${PINE} zone`)).toBe('Pine zone');
    // The real case: an emoji zone-marker inside a heading.
    expect(sanitizeManuscript(`## ${PINE} Northern Boreal Zone`)).toBe('## Northern Boreal Zone');
  });
});

/**
 * The allow-list, and why it exists.
 *
 * This block previously asserted the OPPOSITE of the first case below:
 * `Hazard ${WARNING} ahead` was expected to become `Hazard ahead`. That
 * assertion was the defect written down as a contract. The file's own KNOWN
 * LIMIT header had described the problem all along — "decorative is an
 * assumption, not a fact" — while a pictograph carrying meaning was deleted from
 * the stored working copy, silently, before any later stage could see it.
 *
 * Measured on 7 NATIONAL PARKS WITHOUT THE ROOKIE MISTAKES: sixteen safety
 * paragraphs (flash flood, altitude, road status, wildlife distance) lost the
 * one mark separating them from ordinary prose, and the copyright page lost its
 * copyright sign.
 */
describe('sanitizer — semantic pictographs survive', () => {
  it('keeps the warning sign, dropping only its colour-presentation selector', () => {
    // U+FE0F goes: a black-and-white interior must not request emoji colour.
    expect(sanitizeManuscript(`Hazard ${WARNING} ahead`)).toBe('Hazard ⚠ ahead');
    expect(sanitizeManuscript('⚠ Check the forecast.')).toBe('⚠ Check the forecast.');
  });

  it('keeps the copyright and registered signs', () => {
    expect(sanitizeManuscript('Copyright © 2026 by Tom Everett')).toBe(
      'Copyright © 2026 by Tom Everett',
    );
    expect(sanitizeManuscript('Acme® stove')).toBe('Acme® stove');
  });

  it('still strips a decorative pictograph sitting beside a semantic one', () => {
    expect(sanitizeManuscript(`Hazard ${PINE} ⚠ zone`)).toBe('Hazard ⚠ zone');
  });

  it('reports what it would strip, and never reports the allow-listed marks', () => {
    expect(strippedPictographs(`${PINE} ⚠ © ${PINE} zone`)).toEqual([
      { char: PINE, codePoint: 'U+1F332', count: 2 },
    ]);
    expect(strippedPictographs('⚠ © ® only')).toEqual([]);
  });
});

describe('sanitizer — preserves meaningful content', () => {
  it('keeps real words, scientific names, measurements, and symbols', () => {
    // degree, micro, multiplication, en-dash (real) survive untouched.
    const src = 'Red spruce (Picea rubens), 12°C, 5µm, 3×4, 30 m tall.';
    expect(sanitizeManuscript(src)).toBe(src);
  });

  it('keeps headings and safety-warning copy intact', () => {
    const src =
      '# Chapter 1\n\nThe coyote is crepuscular.\n\n## Warning: never approach a moose during the rut.';
    expect(sanitizeManuscript(src)).toBe(src);
  });

  it('does not collapse newlines or drop paragraphs', () => {
    const src = 'Para one.\n\nPara two.\n\nPara three.';
    expect(sanitizeManuscript(src)).toBe(src);
  });
});
