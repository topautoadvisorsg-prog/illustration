import { describe, expect, it } from 'vitest';
import {
  COMPACT_MARGINS,
  DEFAULT_MARGINS,
  computePageGeometry,
  defaultMarginsForTrim,
} from '../pipeline/stage-6-layout/page-geometry.js';

describe('computePageGeometry', () => {
  it('computes an 8.5x11 premium page with bleed and default margins', () => {
    const g = computePageGeometry({ widthIn: 8.5, heightIn: 11, bleedIn: 0.125 }, DEFAULT_MARGINS);
    expect(g.pageWidthIn).toBe(8.625); // print page box (bound page) — unchanged
    expect(g.pageHeightIn).toBe(11.25);
    // Content frame derives from the TRIM box (8.5×11), never the bleed page.
    expect(g.textWidthIn).toBe(6.25); // 8.5 - 1.25 gutter - 1 right
    expect(g.textHeightIn).toBe(9); // 11 - 1 - 1
    expect(g.textWidthPt).toBe(450); // 6.25 * 72
    expect(g.textHeightPt).toBe(648); // 9 * 72
    expect(g.safeZoneIn).toBe(0.25);
  });

  it('computes a 6x9 compact page (L-1 symmetric 0.5 in margins)', () => {
    const g = computePageGeometry({ widthIn: 6, heightIn: 9, bleedIn: 0.125 }, COMPACT_MARGINS);
    expect(g.pageWidthIn).toBe(6.125);
    expect(g.pageHeightIn).toBe(9.25);
    expect(g.textWidthIn).toBe(5); // trim 6 - 0.5 gutter - 0.5 right
    expect(g.textHeightIn).toBe(8); // trim 9 - 0.5 - 0.5
  });

  it('computes a 7x10 compact page (L-1 symmetric 0.5 in margins)', () => {
    const g = computePageGeometry({ widthIn: 7, heightIn: 10, bleedIn: 0.125 }, COMPACT_MARGINS);
    expect(g.textWidthIn).toBe(6); // trim 7 - 0.5 gutter - 0.5 right
    expect(g.textHeightIn).toBe(9); // trim 10 - 0.5 - 0.5
    expect(g.textWidthPt).toBe(432); // 6 * 72
    expect(g.textHeightPt).toBe(648); // 9 * 72
  });

  it('picks compact margins for small trims and default for large', () => {
    expect(defaultMarginsForTrim({ widthIn: 6, heightIn: 9, bleedIn: 0.125 })).toBe(COMPACT_MARGINS);
    expect(defaultMarginsForTrim({ widthIn: 8.5, heightIn: 11, bleedIn: 0.125 })).toBe(DEFAULT_MARGINS);
  });

  it('throws when margins exceed the page', () => {
    expect(() =>
      computePageGeometry(
        { widthIn: 2, heightIn: 2, bleedIn: 0 },
        { topIn: 1.5, rightIn: 1.5, bottomIn: 1.5, gutterIn: 1.5 },
      ),
    ).toThrow(/margins exceed/);
  });
});
