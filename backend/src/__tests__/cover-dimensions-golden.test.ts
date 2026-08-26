/**
 * COVER DIMENSIONS — GOLDEN VALUES for every shipped reference configuration.
 *
 * Captured from the implementation as it stood BEFORE Phase 1A moved the cover
 * geometry core out of the legacy Track A renderer, and asserted against the
 * canonical module afterwards. Both captures were byte-identical across all
 * twelve configurations, which is the proof that the extraction changed nothing.
 *
 * ─── WHAT THESE NUMBERS ARE, AND ARE NOT ────────────────────────────────────
 * They are RECORDED BEHAVIOUR: what the platform has always produced, and what
 * every shipped paperback spine was actually cut to. The 7 NATIONAL PARKS row
 * matches the wrap that went to print — 0.270240in spine, 12.520240 x 9.250000in.
 *
 * ─── SHIPPED METADATA IS READ, NOT ASSUMED ─────────────────────────────────
 * Page count and trim for every shipped row were read from the actual interior
 * PDF on 2026-08-26. Three earlier rows were guesses and two of them were wrong:
 * NO ONE TOLD ME THAT is 170pp at 5.5x8.5, not 156pp at 6x9, and the DIRT RICH /
 * SEED PACKET lineage is 126pp, not 156. Paper stock cannot be read from a PDF,
 * so it is stated only where the cover build or a verified KDP reading confirms
 * it; NO ONE TOLD ME THAT is labelled as an assumption.
 *
 * ─── PHASE 1B RECONCILIATION, 2026-08-26 ───────────────────────────────────
 * Checked against Amazon's live documentation. Every spine and wrap figure below
 * was CONFIRMED correct — the paperback factors the platform has always used are
 * the published ones:
 *
 *   B&W white  0.002252 in/page     B&W cream  0.0025 in/page
 *   Source: G201953020 — Create a Paperback Cover, read 2026-08-26
 *
 * ONE value was corrected, and it is the only line in this file that moved:
 * KDP prints spine text on books with MORE THAN 79 pages. The platform declared
 * 79 and tested `>=`, admitting a 79-page book KDP would refuse. The 79pp row now
 * expects false and an 80pp row was added beside it.
 *
 * No shipped book is affected — the thinnest is 116 pages.
 *
 * So a failure here means one of two very different things, and the message must
 * say which:
 *   an unintended change  -> a regression, fix the code
 *   Phase 1B reconciliation -> update these values DELIBERATELY, in that commit,
 *                              with the KDP evidence quoted
 */
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import {
  computeCoverDimensions,
  coverAllowsSpineText,
  COVER_BLEED_IN,
  LEGACY_MIN_SPINE_IN,
  computeCoverDimensionsLegacyFloor,
  PAGE_THICKNESS_IN,
} from '../pipeline/publishing-standard/cover-dimensions.js';

interface Golden {
  label: string;
  pageCount: number;
  trim: string;
  paperStock: 'white' | 'cream';
  spineIn: number;
  fullWidthIn: number;
  fullHeightIn: number;
  spineTextAllowed: boolean;
}

const GOLDEN: Golden[] = [
  {"label":"7 NATIONAL PARKS — shipped, 6x9 white [PDF-CONFIRMED]","pageCount":120,"trim":"6x9","paperStock":"white","spineIn":0.27024,"fullWidthIn":12.52024,"fullHeightIn":9.25,"spineTextAllowed":true},
  {"label":"DIRT RICH / SEED PACKET — shipped, 6x9 cream [PDF-CONFIRMED]","pageCount":126,"trim":"6x9","paperStock":"cream","spineIn":0.315,"fullWidthIn":12.565,"fullHeightIn":9.25,"spineTextAllowed":true},
  {"label":"NO ONE TOLD ME THAT — shipped rev25, 5.5x8.5 [PDF-CONFIRMED, paper unconfirmed: white assumed]","pageCount":170,"trim":"5.5x8.5","paperStock":"white","spineIn":0.38284,"fullWidthIn":11.63284,"fullHeightIn":8.75,"spineTextAllowed":true},
  {"label":"THE WILDLANDS NEW ENGLAND — shipped, 7x10 white [PDF-CONFIRMED]","pageCount":275,"trim":"7x10","paperStock":"white","spineIn":0.6193,"fullWidthIn":14.8693,"fullHeightIn":10.25,"spineTextAllowed":true},
  {"label":"7 NATIONAL PARKS — earlier 118pp build","pageCount":118,"trim":"6x9","paperStock":"white","spineIn":0.265736,"fullWidthIn":12.515736,"fullHeightIn":9.25,"spineTextAllowed":true},
  {"label":"7 NATIONAL PARKS — earlier 116pp build","pageCount":116,"trim":"6x9","paperStock":"white","spineIn":0.261232,"fullWidthIn":12.511232,"fullHeightIn":9.25,"spineTextAllowed":true},
  {"label":"boundary — 79pp, NOT eligible for spine text","pageCount":79,"trim":"6x9","paperStock":"white","spineIn":0.177908,"fullWidthIn":12.427908,"fullHeightIn":9.25,"spineTextAllowed":false},
  {"label":"boundary — 80pp, first eligible for spine text","pageCount":80,"trim":"6x9","paperStock":"white","spineIn":0.18016,"fullWidthIn":12.43016,"fullHeightIn":9.25,"spineTextAllowed":true},
  {"label":"boundary — 24pp, printable minimum (published formula, NOT the old 0.06 floor)","pageCount":24,"trim":"6x9","paperStock":"white","spineIn":0.054048,"fullWidthIn":12.304048,"fullHeightIn":9.25,"spineTextAllowed":false},
  {"label":"boundary — 828pp, printable maximum","pageCount":828,"trim":"6x9","paperStock":"white","spineIn":1.864656,"fullWidthIn":14.114656,"fullHeightIn":9.25,"spineTextAllowed":true},
];

const configFor = (g: Golden) => {
  const [w, h] = g.trim.split('x').map(Number);
  return ProjectConfigSchema.parse({
    volume: 1,
    title: 'Equivalence Fixture',
    authorName: 'An Author',
    trimSize: { widthIn: w, heightIn: h, bleedIn: 0.125 },
    paperStock: g.paperStock,
    typography: { bodyPt: 11, lineHeight: 1.35, headingFont: 'Archivo', bodyFont: 'EB Garamond' },
  });
};

describe('cover dimensions — golden values for shipped configurations', () => {
  for (const g of GOLDEN) {
    it(g.label, () => {
      const dims = computeCoverDimensions(configFor(g), g.pageCount);
      expect(dims.spineIn).toBeCloseTo(g.spineIn, 6);
      expect(dims.fullWidthIn).toBeCloseTo(g.fullWidthIn, 6);
      expect(dims.fullHeightIn).toBeCloseTo(g.fullHeightIn, 6);
      expect(coverAllowsSpineText(g.pageCount)).toBe(g.spineTextAllowed);
    });
  }
});

describe('the constants the whole platform now shares', () => {
  it('bleed is 0.125in on every cover, never the interior setting', () => {
    expect(COVER_BLEED_IN).toBe(0.125);
  });

  it('paper thickness is per stock, not one constant', () => {
    expect(PAGE_THICKNESS_IN.white).toBe(0.002252);
    expect(PAGE_THICKNESS_IN.cream).toBe(0.0025);
    // On 154 pages the two differ by 0.038in — a spine wrong by that much
    // prints with the front artwork creeping around the fold.
    expect(Math.abs(154 * PAGE_THICKNESS_IN.cream - 154 * PAGE_THICKNESS_IN.white)).toBeCloseTo(0.038, 3);
  });

  /**
   * REGRESSION — canonical geometry must not clamp.
   *
   * The 0.06in floor used to live inside computeCoverDimensions, where it
   * overrode the published formula between 24 and 26 pages on white paper.
   * Amazon prints from 24 and publishes no minimum spine. If any of these fail,
   * a clamp has been reintroduced into the canonical path.
   */
  describe('the canonical path applies the published formula and nothing else', () => {
    it('does not clamp at the thinnest page count KDP will print', () => {
      const dims = computeCoverDimensions(configFor(GOLDEN[0]!), 24);
      expect(dims.spineIn).toBeCloseTo(24 * PAGE_THICKNESS_IN.white, 10);
      expect(dims.spineIn).toBeLessThan(LEGACY_MIN_SPINE_IN.value);
    });

    it('does not clamp anywhere the old floor used to engage', () => {
      for (const pages of [24, 25, 26]) {
        const dims = computeCoverDimensions(configFor(GOLDEN[0]!), pages);
        expect(dims.spineIn).toBeCloseTo(pages * PAGE_THICKNESS_IN.white, 10);
      }
    });

    it('does not clamp even far below the printable range', () => {
      const dims = computeCoverDimensions(configFor(GOLDEN[0]!), 4);
      expect(dims.spineIn).toBeCloseTo(4 * PAGE_THICKNESS_IN.white, 10);
      expect(dims.spineIn).not.toBe(LEGACY_MIN_SPINE_IN.value);
    });

    it('the wrap width reflects the unclamped spine', () => {
      const cfg = configFor(GOLDEN[0]!);
      const dims = computeCoverDimensions(cfg, 24);
      const expected = cfg.trimSize.widthIn * 2 + 24 * PAGE_THICKNESS_IN.white + COVER_BLEED_IN * 2;
      expect(dims.fullWidthIn).toBeCloseTo(expected, 10);
    });
  });

  /**
   * The historical behaviour still exists, but only when asked for by name, and
   * it is labelled LEGACY_COMPATIBILITY rather than presented as KDP authority.
   */
  describe('the legacy floor is preserved but quarantined', () => {
    it('is not KDP authority', () => {
      expect(LEGACY_MIN_SPINE_IN.authority).toBe('LEGACY_COMPATIBILITY');
      expect(LEGACY_MIN_SPINE_IN.value).toBe(0.06);
    });

    it('still clamps when a caller opts in explicitly', () => {
      const dims = computeCoverDimensionsLegacyFloor(configFor(GOLDEN[0]!), 24);
      expect(dims.spineIn).toBe(LEGACY_MIN_SPINE_IN.value);
    });

    it('agrees with canonical geometry at every shipped page count', () => {
      // Only where the floor never engaged. Below 27 pages on white paper the
      // two are SUPPOSED to differ — that difference is the whole point of
      // separating them.
      const shipped = GOLDEN.filter((g) => g.pageCount >= 27);
      expect(shipped.length).toBeGreaterThan(0);
      for (const g of shipped) {
        const cfg = configFor(g);
        expect(computeCoverDimensionsLegacyFloor(cfg, g.pageCount)).toEqual(
          computeCoverDimensions(cfg, g.pageCount),
        );
      }
    });

    it('differs from canonical geometry exactly where the floor used to bite', () => {
      const cfg = configFor(GOLDEN[0]!);
      for (const pages of [24, 25, 26]) {
        expect(computeCoverDimensionsLegacyFloor(cfg, pages).spineIn).toBe(0.06);
        expect(computeCoverDimensions(cfg, pages).spineIn).toBeLessThan(0.06);
      }
      // and at 27 they converge again
      expect(computeCoverDimensionsLegacyFloor(cfg, 27)).toEqual(computeCoverDimensions(cfg, 27));
    });
  });

  it('an unset paper stock falls back to white, as it always has', () => {
    const cfg = configFor(GOLDEN[0]!);
    const { paperStock: _drop, ...withoutStock } = cfg as Record<string, unknown>;
    const dims = computeCoverDimensions(withoutStock as never, 120);
    expect(dims.spineIn).toBeCloseTo(120 * PAGE_THICKNESS_IN.white, 6);
  });
});
