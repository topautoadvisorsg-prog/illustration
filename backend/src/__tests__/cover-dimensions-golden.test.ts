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
  MIN_SPINE_IN,
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
  {"label":"7 NATIONAL PARKS — paperback, shipped","pageCount":120,"trim":"6x9","paperStock":"white","spineIn":0.27024,"fullWidthIn":12.52024,"fullHeightIn":9.25,"spineTextAllowed":true},
  {"label":"7 NATIONAL PARKS — earlier 118pp build","pageCount":118,"trim":"6x9","paperStock":"white","spineIn":0.265736,"fullWidthIn":12.515736,"fullHeightIn":9.25,"spineTextAllowed":true},
  {"label":"7 NATIONAL PARKS — earlier 116pp build","pageCount":116,"trim":"6x9","paperStock":"white","spineIn":0.261232,"fullWidthIn":12.511232,"fullHeightIn":9.25,"spineTextAllowed":true},
  {"label":"NO ONE TOLD ME THAT — paperback rev3","pageCount":156,"trim":"6x9","paperStock":"white","spineIn":0.351312,"fullWidthIn":12.601312,"fullHeightIn":9.25,"spineTextAllowed":true},
  {"label":"DIRT RICH — paperback, cream","pageCount":156,"trim":"6x9","paperStock":"cream","spineIn":0.39,"fullWidthIn":12.64,"fullHeightIn":9.25,"spineTextAllowed":true},
  {"label":"DIRT RICH — rev4 pagination","pageCount":164,"trim":"6x9","paperStock":"cream","spineIn":0.41,"fullWidthIn":12.66,"fullHeightIn":9.25,"spineTextAllowed":true},
  {"label":"SEED PACKET — 6x9 cream 126pp","pageCount":126,"trim":"6x9","paperStock":"cream","spineIn":0.315,"fullWidthIn":12.565,"fullHeightIn":9.25,"spineTextAllowed":true},
  {"label":"WILDLANDS — 7x10 white 269pp","pageCount":269,"trim":"7x10","paperStock":"white","spineIn":0.605788,"fullWidthIn":14.855788,"fullHeightIn":10.25,"spineTextAllowed":true},
  {"label":"WILDLANDS — 7x10 white 275pp","pageCount":275,"trim":"7x10","paperStock":"white","spineIn":0.6193,"fullWidthIn":14.8693,"fullHeightIn":10.25,"spineTextAllowed":true},
  {"label":"boundary — 79pp, NOT eligible: KDP prints spine text on MORE THAN 79 pages","pageCount":79,"trim":"6x9","paperStock":"white","spineIn":0.177908,"fullWidthIn":12.427908,"fullHeightIn":9.25,"spineTextAllowed":false},
    {"label":"boundary — 80pp, the first eligible count","pageCount":80,"trim":"6x9","paperStock":"white","spineIn":0.18016,"fullWidthIn":12.43016,"fullHeightIn":9.25,"spineTextAllowed":true},
  {"label":"boundary — 78pp, well under the spine-text floor","pageCount":78,"trim":"6x9","paperStock":"white","spineIn":0.175656,"fullWidthIn":12.425656,"fullHeightIn":9.25,"spineTextAllowed":false},
  {"label":"boundary — thin block hits the 0.06in floor","pageCount":10,"trim":"6x9","paperStock":"white","spineIn":0.06,"fullWidthIn":12.31,"fullHeightIn":9.25,"spineTextAllowed":false},
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

  it('a very thin block is floored rather than allowed to go unfoldable', () => {
    const dims = computeCoverDimensions(configFor(GOLDEN[0]!), 4);
    expect(dims.spineIn).toBe(MIN_SPINE_IN);
  });

  it('an unset paper stock falls back to white, as it always has', () => {
    const cfg = configFor(GOLDEN[0]!);
    const { paperStock: _drop, ...withoutStock } = cfg as Record<string, unknown>;
    const dims = computeCoverDimensions(withoutStock as never, 120);
    expect(dims.spineIn).toBeCloseTo(120 * PAGE_THICKNESS_IN.white, 6);
  });
});
