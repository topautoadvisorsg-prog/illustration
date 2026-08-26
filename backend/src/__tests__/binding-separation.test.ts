/**
 * WHAT A FAILURE HERE MEANS
 *
 * Paperback and hardcover are different objects. A paperback cover is the same
 * size as its page and is described by trim, bleed, spine, safe area, barcode
 * region and fold variance. A hardcover is a case: a board LARGER than the trim,
 * a wrap folded around it, a hinge where it bends, and safe regions the Cover
 * Calculator states rather than derives.
 *
 * Every cover defect this platform has had came from treating one as the other:
 * a hardcover wrap computed from paperback trim arithmetic, a barcode rule
 * published for hardcover applied as though it were published for paperback.
 *
 * These tests assert the two models stay separate and that neither borrows the
 * other's numbers.
 */
import { describe, expect, it } from 'vitest';
import {
  HARDCOVER_RULES,
  NOT_PUBLISHED,
  PAPERBACK_RULES,
  SUPPORTED_TRIMS,
  pageCountLimit,
} from '../pipeline/publishing-standard/kdp-spec.js';
import { VERIFIED_SPECS } from '../pipeline/publishing-standard/kdp-cover-specs.js';

describe('paperback and hardcover are modelled separately', () => {
  it('the paperback model carries everything a paperback wrap needs', () => {
    expect(PAPERBACK_RULES.bleedIn.value).toBe(0.125);
    expect(PAPERBACK_RULES.safeFromOutsideEdgeIn.value).toBe(0.25);
    expect(PAPERBACK_RULES.foldVarianceIn.value).toBe(0.0625);
    expect(PAPERBACK_RULES.spineTextSafeIn.value).toBe(0.0625);
    expect(PAPERBACK_RULES.spineTextMinPages.value).toBe(80);
    expect(PAPERBACK_RULES.barcodeReserve.value.widthIn).toBeGreaterThan(0);
  });

  it('the hardcover model carries everything a case needs, and none of it is paperback', () => {
    expect(HARDCOVER_RULES.caseWrapIn.value).toBe(0.51);
    expect(HARDCOVER_RULES.hingeIn.value).toBe(0.4);
    expect(HARDCOVER_RULES.safeFromEdgeIn.value).toBe(0.635);
    // the three figures that must never be borrowed from the paperback model
    expect(HARDCOVER_RULES.safeFromEdgeIn.value).not.toBe(PAPERBACK_RULES.safeFromOutsideEdgeIn.value);
    expect(HARDCOVER_RULES.caseWrapIn.value).not.toBe(PAPERBACK_RULES.bleedIn.value);
    expect(HARDCOVER_RULES.hingeIn.value).not.toBe(PAPERBACK_RULES.foldVarianceIn.value);
  });

  it('the barcode regions are separate definitions, not one shared rectangle', () => {
    const pb = PAPERBACK_RULES.barcodeReserve;
    const hc = HARDCOVER_RULES.barcode;
    // Amazon publishes the barcode rectangle for hardcover. It does not publish
    // one for paperback, so ours is labelled as ours.
    expect(hc.authority).toBe('OFFICIAL_STATIC_RULE');
    expect(pb.authority).toBe('HOUSE_POLICY');
    // and the hardcover rule carries placement the paperback one does not
    expect(hc.value.fromBottomIn).toBeGreaterThan(0);
    expect(hc.value.fromSpineHingeIn).toBeGreaterThan(0);
  });

  it('hardcover spine text is NOT_PUBLISHED, never a borrowed paperback number', () => {
    expect(HARDCOVER_RULES.spineTextMinPages.value).toBe(NOT_PUBLISHED);
    expect(HARDCOVER_RULES.spineTextMinPages.authority).toBe('UNVERIFIED');
    expect(HARDCOVER_RULES.spineTextMinPages.value).not.toBe(PAPERBACK_RULES.spineTextMinPages.value);
  });

  it('the two bindings offer different trims and different page ranges', () => {
    expect(SUPPORTED_TRIMS.HARDCOVER.length).toBeLessThan(SUPPORTED_TRIMS.PAPERBACK.length);
    const hc = pageCountLimit('HARDCOVER', 'BLACK_AND_WHITE', 'WHITE')!;
    const pb = pageCountLimit('PAPERBACK', 'BLACK_AND_WHITE', 'WHITE')!;
    expect(hc.min).toBeGreaterThan(pb.min);
    expect(hc.max).toBeLessThan(pb.max);
  });

  it('a hardcover spine is never equal to the paperback spine for the same book', () => {
    // The board adds real thickness. If these ever match, something has started
    // computing a hardcover from paperback arithmetic.
    const bw = VERIFIED_SPECS.filter(
      (s) => s.config.binding === 'HARDCOVER' && s.config.interiorType === 'BLACK_AND_WHITE',
    );
    expect(bw.length).toBeGreaterThan(0);
    for (const s of bw) {
      const factor = s.config.paperType === 'CREAM' ? 0.0025 : 0.002252;
      const paperbackSpine = s.config.pageCount * factor;
      expect(s.spineIn).toBeGreaterThan(paperbackSpine + 0.1);
    }
  });
});
