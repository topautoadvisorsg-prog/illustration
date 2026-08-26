/**
 * KDP SPECIFICATION — the published figures, and the refusals.
 *
 * Every expectation here is quoted from Amazon's live documentation, read
 * 2026-08-26, with the topic recorded beside it. If one of these fails, either
 * KDP changed its specification or someone edited a factor without evidence.
 * Both need a human, and neither is fixed by adjusting the expectation.
 *
 * The refusal tests matter as much as the arithmetic. The platform's worst habit
 * was defaults that looked authoritative, so an unsupported configuration must
 * fail loudly rather than resolve to the nearest factor.
 */
import { describe, expect, it } from 'vitest';
import {
  PAPERBACK_SPINE_FACTOR_IN,
  PAPERBACK_RULES,
  HARDCOVER_RULES,
  PAGE_COUNT_LIMITS,
  SUPPORTED_TRIMS,
  UnverifiedKdpConfigurationError,
  resolvePaperbackSpine,
  pageCountLimit,
} from '../pipeline/publishing-standard/kdp-spec.js';

const spine = (ink: 'BLACK_AND_WHITE' | 'STANDARD_COLOR' | 'PREMIUM_COLOR', paper: 'WHITE' | 'CREAM' | 'GROUNDWOOD', pageCount: number) =>
  resolvePaperbackSpine({ ink, paper, trim: '6x9', pageCount });

describe('paperback spine factors — published by KDP, topic G201953020', () => {
  it('black & white on white paper is 0.002252 in/page', () => {
    expect(PAPERBACK_SPINE_FACTOR_IN.BLACK_AND_WHITE!.WHITE!.value).toBe(0.002252);
    expect(spine('BLACK_AND_WHITE', 'WHITE', 120).spineIn).toBeCloseTo(0.270240, 6);
    expect(spine('BLACK_AND_WHITE', 'WHITE', 300).spineIn).toBeCloseTo(0.675600, 6);
  });

  it('black & white on cream paper is 0.0025 in/page', () => {
    expect(PAPERBACK_SPINE_FACTOR_IN.BLACK_AND_WHITE!.CREAM!.value).toBe(0.0025);
    expect(spine('BLACK_AND_WHITE', 'CREAM', 156).spineIn).toBeCloseTo(0.390000, 6);
    expect(spine('BLACK_AND_WHITE', 'CREAM', 200).spineIn).toBeCloseTo(0.500000, 6);
  });

  it('premium colour is 0.002347 in/page', () => {
    expect(PAPERBACK_SPINE_FACTOR_IN.PREMIUM_COLOR!.WHITE!.value).toBe(0.002347);
    expect(spine('PREMIUM_COLOR', 'WHITE', 200).spineIn).toBeCloseTo(0.469400, 6);
  });

  it('standard colour is 0.002252 in/page — a SEPARATE published line, not premium', () => {
    // Verified 2026-08-26: the page lists Standard Color and Premium Color
    // separately with DIFFERENT multipliers. Treating "colour" as one factor
    // would make every standard-colour spine 0.000095in/page too wide — 0.057in
    // on a 600-page book, which is the whole fold-variance allowance.
    expect(PAPERBACK_SPINE_FACTOR_IN.STANDARD_COLOR!.WHITE!.value).toBe(0.002252);
    expect(PAPERBACK_SPINE_FACTOR_IN.STANDARD_COLOR!.WHITE!.value).not.toBe(
      PAPERBACK_SPINE_FACTOR_IN.PREMIUM_COLOR!.WHITE!.value,
    );
    expect(spine('STANDARD_COLOR', 'WHITE', 400).spineIn).toBeCloseTo(0.900800, 6);
  });

  it('every factor explains its own arithmetic', () => {
    expect(spine('BLACK_AND_WHITE', 'WHITE', 120).explanation).toBe('120 pages x 0.002252 in/page = 0.270240in');
    expect(spine('BLACK_AND_WHITE', 'WHITE', 120).authority).toBe('published-formula');
    expect(spine('BLACK_AND_WHITE', 'WHITE', 120).source.topic).toContain('G201953020');
  });
});

describe('refusals — an unsupported configuration never resolves to the nearest factor', () => {
  it('GROUNDWOOD has no published multiplier and is refused', () => {
    // A value of 0.00235 was believed correct going in. The cover page does not
    // list groundwood at all, and the groundwood help page defers to the Cover
    // Calculator. So it is unsupported until a fixture is read.
    expect(PAPERBACK_SPINE_FACTOR_IN.BLACK_AND_WHITE!.GROUNDWOOD).toBeUndefined();
    expect(() => spine('BLACK_AND_WHITE', 'GROUNDWOOD', 120)).toThrow(UnverifiedKdpConfigurationError);
    try {
      spine('BLACK_AND_WHITE', 'GROUNDWOOD', 120);
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('UNVERIFIED KDP CONFIGURATION');
      expect(msg).toContain('Do NOT approximate it from cream');
    }
  });

  it('cream is not offered in colour, and is refused rather than falling back to white', () => {
    expect(() => spine('PREMIUM_COLOR', 'CREAM', 120)).toThrow(UnverifiedKdpConfigurationError);
  });

  it('a page count below the printable minimum is refused', () => {
    expect(() => spine('BLACK_AND_WHITE', 'WHITE', 20)).toThrow(/outside the printable range 24-828/);
  });

  it('a page count above the printable maximum is refused', () => {
    expect(() => spine('BLACK_AND_WHITE', 'WHITE', 900)).toThrow(/outside the printable range 24-828/);
  });

  it('standard colour has its own narrower range, 72-600', () => {
    expect(() => spine('STANDARD_COLOR', 'WHITE', 60)).toThrow(/outside the printable range 72-600/);
    expect(() => spine('STANDARD_COLOR', 'WHITE', 700)).toThrow(/outside the printable range 72-600/);
    expect(spine('STANDARD_COLOR', 'WHITE', 72).spineIn).toBeGreaterThan(0);
  });

  it('a non-integer or zero page count is refused', () => {
    expect(() => spine('BLACK_AND_WHITE', 'WHITE', 0)).toThrow(UnverifiedKdpConfigurationError);
    expect(() => spine('BLACK_AND_WHITE', 'WHITE', 120.5)).toThrow(UnverifiedKdpConfigurationError);
  });
});

describe('paperback static rules — published constants', () => {
  it('bleed is 0.125in on top, bottom and outside edges', () => {
    expect(PAPERBACK_RULES.bleedIn.value).toBe(0.125);
    expect(PAPERBACK_RULES.bleedIn.authority).toBe('published-constraint');
  });

  it('content stays at least 0.25in inside the outside cover edge', () => {
    expect(PAPERBACK_RULES.safeFromOutsideEdgeIn.value).toBe(0.25);
  });

  it('spine text needs MORE THAN 79 pages, so 80 is the first eligible count', () => {
    // Quoted: "We only print spine text on books with more than 79 pages".
    // The platform previously declared 79 and tested >=, admitting a 79-page
    // book KDP would refuse.
    expect(PAPERBACK_RULES.spineTextMinPages.value).toBe(80);
  });

  it('spine text clears the edge by 0.0625in, and folds vary by the same', () => {
    expect(PAPERBACK_RULES.spineTextSafeIn.value).toBe(0.0625);
    expect(PAPERBACK_RULES.foldVarianceIn.value).toBe(0.0625);
  });

  it('the barcode reserve is labelled a platform decision, because KDP does not publish one for paperback', () => {
    // KDP states only that it places a barcode on the back cover if none is
    // supplied. The 2.0 x 1.2in figure comes from the HARDCOVER page. Calling it
    // published would be the exact habit this layer exists to break.
    expect(PAPERBACK_RULES.barcodeReserve.authority).toBe('platform-decision');
    expect(PAPERBACK_RULES.barcodeReserve.value).toEqual({ widthIn: 2.0, heightIn: 1.2 });
  });
});

describe('hardcover — published rules, and NO invented multiplier', () => {
  it('there is no hardcover spine factor, and the reason is recorded', () => {
    expect(HARDCOVER_RULES.spineFactor.value).toBeNull();
    expect(HARDCOVER_RULES.spineFactor.authority).toBe('calculator-fixture');
    expect(HARDCOVER_RULES.spineFactor.note).toContain('NO PUBLISHED HARDCOVER SPINE MULTIPLIER');
  });

  it('case wrap is 0.51in past the front cover edge', () => {
    expect(HARDCOVER_RULES.caseWrapIn.value).toBe(0.51);
  });

  it('the hinge is 0.4in between spine and safe area', () => {
    expect(HARDCOVER_RULES.hingeIn.value).toBe(0.4);
  });

  it('text and images stay 0.635in from the book edge', () => {
    expect(HARDCOVER_RULES.safeFromEdgeIn.value).toBe(0.635);
  });

  it('the hardcover barcode IS published: 2 x 1.2in, 0.76in up, 0.25in from the hinge', () => {
    expect(HARDCOVER_RULES.barcode.value).toEqual({
      widthIn: 2.0,
      heightIn: 1.2,
      fromBottomIn: 0.76,
      fromSpineHingeIn: 0.25,
    });
    expect(HARDCOVER_RULES.barcode.authority).toBe('published-constraint');
  });

  it('hardcover prints 75-550 pages, a narrower range than paperback', () => {
    const hc = pageCountLimit('HARDCOVER', 'BLACK_AND_WHITE', 'WHITE')!;
    expect([hc.min, hc.max]).toEqual([75, 550]);
    const pb = pageCountLimit('PAPERBACK', 'BLACK_AND_WHITE', 'WHITE')!;
    expect([pb.min, pb.max]).toEqual([24, 828]);
  });
});

describe('wrap equations', () => {
  const wrap = (trimW: number, trimH: number, spineIn: number) => ({
    widthIn: PAPERBACK_RULES.bleedIn.value + trimW + spineIn + trimW + PAPERBACK_RULES.bleedIn.value,
    heightIn: PAPERBACK_RULES.bleedIn.value + trimH + PAPERBACK_RULES.bleedIn.value,
  });

  it('width = bleed + back + spine + front + bleed', () => {
    const s = spine('BLACK_AND_WHITE', 'WHITE', 120).spineIn;
    expect(wrap(6, 9, s).widthIn).toBeCloseTo(12.520240, 6);
  });

  it('height = bleed + trim height + bleed, and does not depend on page count', () => {
    expect(wrap(6, 9, 0.27).heightIn).toBeCloseTo(9.25, 6);
    expect(wrap(6, 9, 0.9).heightIn).toBeCloseTo(9.25, 6);
  });

  it('7x10 reproduces the Wildlands wrap height', () => {
    expect(wrap(7, 10, 0.6).heightIn).toBeCloseTo(10.25, 6);
  });
});

describe('supported trims and limits', () => {
  it('hardcover offers fewer trims than paperback', () => {
    expect(SUPPORTED_TRIMS.HARDCOVER).toEqual(['5.5x8.5', '6x9', '6.14x9.21', '7x10', '8.25x11']);
    expect(SUPPORTED_TRIMS.PAPERBACK.length).toBeGreaterThan(SUPPORTED_TRIMS.HARDCOVER.length);
    expect(SUPPORTED_TRIMS.PAPERBACK).toContain('6x9');
  });

  it('every page-count limit carries a source', () => {
    for (const l of PAGE_COUNT_LIMITS) {
      expect(l.source.url).toMatch(/^https:\/\/kdp\.amazon\.com\//);
      expect(l.source.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(l.min).toBeLessThan(l.max);
    }
  });

  it('every published factor carries a source and a retrieval date', () => {
    for (const byPaper of Object.values(PAPERBACK_SPINE_FACTOR_IN)) {
      for (const factor of Object.values(byPaper!)) {
        expect(factor!.authority).toBe('published-formula');
        expect(factor!.source.url).toMatch(/^https:\/\/kdp\.amazon\.com\//);
        expect(factor!.source.retrieved).toBe('2026-08-26');
        expect(factor!.units).toBe('in/page');
      }
    }
  });
});
