/**
 * WHAT A FAILURE HERE MEANS
 *
 * A paperback cover is the same size as its page, so its wrap can be computed
 * from the trim. A hardcover cover is NOT: the case board is larger than the
 * trim on every edge. Anything that derives a hardcover wrap from the trim
 * understates it, and KDP rejects the file.
 *
 * This was a real defect. `scripts/qa/cover-spec.ts` computed the hardcover
 * wrap as `trim * 2 + spine + wrap * 2` and reported 13.523 x 10.02in for the
 * Seed Packet hardcover, whose calculator reading is 14.079 x 10.417in — short
 * by 0.556in across and 0.397in down.
 *
 * These tests lock the two facts that fix depends on:
 *   1. the board really is larger than the trim, and
 *   2. the fixture's own figures are internally consistent, so a consumer may
 *      lay panels out from them and land exactly on the reported wrap.
 *
 * If one fails, do NOT adjust the expectation. Re-read the KDP Cover Calculator
 * for that configuration and correct the fixture in `kdp-cover-specs.ts`.
 */
import { describe, expect, it } from 'vitest';
import { VERIFIED_SPECS, getKdpCoverDimensions } from '../pipeline/publishing-standard/kdp-cover-specs.js';

const HARDCOVERS = VERIFIED_SPECS.filter((s) => s.config.binding === 'HARDCOVER');

describe('hardcover case board geometry', () => {
  it('there is at least one verified hardcover reading to test against', () => {
    expect(HARDCOVERS.length).toBeGreaterThan(0);
  });

  for (const spec of HARDCOVERS) {
    const [trimW, trimH] = spec.config.trimSize.split('x').map(Number) as [number, number];
    const label = `${spec.config.trimSize}in ${spec.config.pageCount}pp ${spec.config.paperType}`;

    it(`${label}: the board is larger than the trim in both directions`, () => {
      expect(spec.frontWidthIn).toBeGreaterThan(trimW);
      expect(spec.frontHeightIn).toBeGreaterThan(trimH);
    });

    it(`${label}: wrap + board + spine + board + wrap equals the reported width`, () => {
      const built = spec.wrapIn * 2 + spec.frontWidthIn * 2 + spec.spineIn;
      expect(built).toBeCloseTo(spec.fullWidthIn, 2);
    });

    it(`${label}: wrap + board + wrap equals the reported height`, () => {
      const built = spec.wrapIn * 2 + spec.frontHeightIn;
      expect(built).toBeCloseTo(spec.fullHeightIn, 2);
    });

    it(`${label}: a trim-derived wrap would be materially wrong`, () => {
      const naive = trimW * 2 + spec.spineIn + spec.wrapIn * 2;
      expect(Math.abs(naive - spec.fullWidthIn)).toBeGreaterThan(0.05);
    });

    it(`${label}: the spine-safe area fits inside the spine`, () => {
      expect(spec.spineSafeWidthIn).toBeLessThan(spec.spineIn);
      expect(spec.spineSafeHeightIn).toBeLessThan(spec.fullHeightIn);
    });

    it(`${label}: the resolver hands back that reading unchanged`, () => {
      const dims = getKdpCoverDimensions(spec.config);
      expect(dims.provenance).toBe('verified');
      expect(dims.fullWidthIn).toBe(spec.fullWidthIn);
      expect(dims.fullHeightIn).toBe(spec.fullHeightIn);
      expect(dims.frontWidthIn).toBe(spec.frontWidthIn);
      expect(dims.wrapIn).toBe(spec.wrapIn);
    });
  }
});
