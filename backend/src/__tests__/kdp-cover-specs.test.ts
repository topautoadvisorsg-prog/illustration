import { describe, expect, it } from 'vitest';
import {
  VERIFIED_SPECS,
  getKdpCoverDimensions,
  type KdpCoverConfig,
} from '../pipeline/publishing-standard/kdp-cover-specs.js';

const ROCKIES: KdpCoverConfig = {
  binding: 'HARDCOVER',
  coverType: 'CASE_LAMINATE',
  interiorType: 'PREMIUM_COLOR',
  paperType: 'WHITE',
  trimSize: '7x10',
  pageCount: 269,
};

describe('KDP cover dimensions', () => {
  it('returns the exact verified reading for Canadian Rockies (269pp hardcover)', () => {
    const d = getKdpCoverDimensions(ROCKIES);
    // These are Amazon's numbers, read from the Cover Calculator on 2026-08-06.
    expect(d.fullWidthIn).toBe(16.395);
    expect(d.fullHeightIn).toBe(11.417);
    expect(d.spineIn).toBe(0.82);
    expect(d.provenance).toBe('verified');
  });

  it('returns the exact verified reading for New England (275pp hardcover)', () => {
    const d = getKdpCoverDimensions({ ...ROCKIES, pageCount: 275 });
    expect(d.fullWidthIn).toBe(16.409);
    expect(d.spineIn).toBe(0.834);
    expect(d.provenance).toBe('verified');
  });

  it('the two volumes genuinely differ — the regression this module prevents', () => {
    const rockies = getKdpCoverDimensions(ROCKIES);
    const newEngland = getKdpCoverDimensions({ ...ROCKIES, pageCount: 275 });
    expect(rockies.spineIn).not.toBe(newEngland.spineIn);
    // 0.014in — small, but enough to misregister a wrap and fail an upload.
    expect(Number((newEngland.spineIn - rockies.spineIn).toFixed(3))).toBe(0.014);
  });

  it('interpolates between verified anchors and says so', () => {
    const d = getKdpCoverDimensions({ ...ROCKIES, pageCount: 272 });
    expect(d.provenance).toBe('derived');
    expect(d.spineIn).toBeGreaterThan(0.82);
    expect(d.spineIn).toBeLessThan(0.834);
    // Full width must track the spine, not stay frozen at an anchor's value.
    expect(d.fullWidthIn).toBeGreaterThan(16.395);
    expect(d.fullWidthIn).toBeLessThan(16.409);
    expect(d.note).toMatch(/Verify against the KDP Cover Calculator/);
  });

  it('FAILS CLOSED outside the verified range instead of extrapolating', () => {
    expect(() => getKdpCoverDimensions({ ...ROCKIES, pageCount: 400 })).toThrow(
      /outside the verified range[\s\S]*cover-calculator/,
    );
    expect(() => getKdpCoverDimensions({ ...ROCKIES, pageCount: 100 })).toThrow(/outside the verified range/);
  });

  it('FAILS CLOSED for a configuration with no verified readings', () => {
    expect(() => getKdpCoverDimensions({ ...ROCKIES, binding: 'PAPERBACK' })).toThrow(
      /no verified dimensions[\s\S]*cover-calculator/,
    );
    expect(() => getKdpCoverDimensions({ ...ROCKIES, trimSize: '6x9' })).toThrow(/no verified dimensions/);
    expect(() => getKdpCoverDimensions({ ...ROCKIES, paperType: 'CREAM' })).toThrow(/no verified dimensions/);
  });

  it('rejects a nonsense page count', () => {
    expect(() => getKdpCoverDimensions({ ...ROCKIES, pageCount: 0 })).toThrow(/positive integer/);
    expect(() => getKdpCoverDimensions({ ...ROCKIES, pageCount: 269.5 })).toThrow(/positive integer/);
  });

  it('every stored spec carries provenance, so no value is unattributable', () => {
    for (const s of VERIFIED_SPECS) {
      expect(s.verifiedOn, `${s.config.pageCount}pp missing verifiedOn`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.spineIn).toBeGreaterThan(0);
      expect(s.fullWidthIn).toBeGreaterThan(s.spineIn);
    }
  });
});
