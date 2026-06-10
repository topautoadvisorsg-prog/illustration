import { describe, expect, it } from 'vitest';
import {
  computeBadgeSafeZones,
  BADGE_ZONE_GEOMETRY,
  type BadgeContextForZones,
} from '../badge-zones.js';

const CANVAS_7X10 = { w: 7.25, h: 10.25 };
const CANVAS_8_5X11 = { w: 8.75, h: 11.25 };

const FULL_BADGES: BadgeContextForZones = {
  region: 'GENERAL',
  hazard: [],
  source: 'GENERAL_REFERENCE',
};

const EMPTY_BADGES: BadgeContextForZones = {
  region: '',
  hazard: [],
  source: '',
};

describe('computeBadgeSafeZones — L-7 single source of truth', () => {
  it('reserves region + hazard-source corners + folio when all badges present (7×10)', () => {
    const zones = computeBadgeSafeZones({
      badgeContext: { region: 'NEW_ENGLAND', hazard: ['POISON'], source: 'GENERAL' },
      layoutFamily: 'LAYOUT_B_IMAGE_TOP',
      canvasIn: CANVAS_7X10,
    });
    const ids = zones.map((z) => z.id).sort();
    expect(ids).toEqual([
      'badge-hazard-source-corner',
      'badge-region-corner',
      'folio-strip',
    ]);
  });

  it('places region corner in bottom-left, hazard-source in bottom-right (7×10)', () => {
    const zones = computeBadgeSafeZones({
      badgeContext: FULL_BADGES,
      layoutFamily: 'LAYOUT_B_IMAGE_RIGHT',
      canvasIn: CANVAS_7X10,
    });
    const region = zones.find((z) => z.id === 'badge-region-corner')!;
    const right = zones.find((z) => z.id === 'badge-hazard-source-corner')!;
    // bottom-left: x = inset, y = canvasH - inset - sq
    expect(region.xIn).toBeCloseTo(BADGE_ZONE_GEOMETRY.insetIn);
    expect(region.yIn).toBeCloseTo(
      CANVAS_7X10.h - BADGE_ZONE_GEOMETRY.insetIn - BADGE_ZONE_GEOMETRY.safeZoneIn,
    );
    expect(region.widthIn).toBeCloseTo(BADGE_ZONE_GEOMETRY.safeZoneIn);
    expect(region.heightIn).toBeCloseTo(BADGE_ZONE_GEOMETRY.safeZoneIn);
    // bottom-right: x = canvasW - inset - sq
    expect(right.xIn).toBeCloseTo(
      CANVAS_7X10.w - BADGE_ZONE_GEOMETRY.insetIn - BADGE_ZONE_GEOMETRY.safeZoneIn,
    );
    expect(right.yIn).toBeCloseTo(region.yIn);
  });

  it('places folio centred horizontally, lifted 0.5in above trim bottom (7×10)', () => {
    const zones = computeBadgeSafeZones({
      badgeContext: FULL_BADGES,
      layoutFamily: 'LAYOUT_D_PURE_TEXT',
      canvasIn: CANVAS_7X10,
    });
    const folio = zones.find((z) => z.id === 'folio-strip')!;
    expect(folio.widthIn).toBeCloseTo(BADGE_ZONE_GEOMETRY.folioWidthIn);
    expect(folio.heightIn).toBeCloseTo(BADGE_ZONE_GEOMETRY.folioHeightIn);
    expect(folio.xIn).toBeCloseTo((CANVAS_7X10.w - folio.widthIn) / 2);
    // trim bottom = canvas - bleed (0.125); folio top = trimBottom - 0.5 - 0.3
    expect(folio.yIn).toBeCloseTo(10.25 - 0.125 - 0.5 - 0.3);
  });

  describe('O-6 — zero-badge release', () => {
    it('omits badge corners when region, hazards, and source are all empty', () => {
      const zones = computeBadgeSafeZones({
        badgeContext: EMPTY_BADGES,
        layoutFamily: 'LAYOUT_B_IMAGE_TOP',
        canvasIn: CANVAS_7X10,
      });
      expect(zones.find((z) => z.id === 'badge-region-corner')).toBeUndefined();
      expect(zones.find((z) => z.id === 'badge-hazard-source-corner')).toBeUndefined();
    });

    it('still reserves folio when badges empty but layout shows folio', () => {
      const zones = computeBadgeSafeZones({
        badgeContext: EMPTY_BADGES,
        layoutFamily: 'LAYOUT_B_IMAGE_TOP',
        canvasIn: CANVAS_7X10,
      });
      expect(zones.find((z) => z.id === 'folio-strip')).toBeDefined();
    });

    it('returns empty array when both badge corners released AND folio dropped', () => {
      const zones = computeBadgeSafeZones({
        badgeContext: EMPTY_BADGES,
        layoutFamily: 'LAYOUT_F_FULL_ILLUSTRATION',
        canvasIn: CANVAS_7X10,
      });
      expect(zones).toEqual([]);
    });
  });

  describe('O-7 — folio drop on LAYOUT_F', () => {
    it('omits folio strip on LAYOUT_F_FULL_ILLUSTRATION', () => {
      const zones = computeBadgeSafeZones({
        badgeContext: FULL_BADGES,
        layoutFamily: 'LAYOUT_F_FULL_ILLUSTRATION',
        canvasIn: CANVAS_7X10,
      });
      expect(zones.find((z) => z.id === 'folio-strip')).toBeUndefined();
      // Badge corners still reserved per operator decision (badges can stamp on full-page art).
      expect(zones.find((z) => z.id === 'badge-region-corner')).toBeDefined();
    });

    it('keeps folio on every non-full-illustration layout', () => {
      for (const layout of [
        'LAYOUT_B_IMAGE_TOP',
        'LAYOUT_B_IMAGE_RIGHT',
        'LAYOUT_D_PURE_TEXT',
        'LAYOUT_2_TEXT_HEAVY',
        'LAYOUT_E_ACCENT_TOP_LEFT', // future L-2
      ]) {
        const zones = computeBadgeSafeZones({
          badgeContext: FULL_BADGES,
          layoutFamily: layout,
          canvasIn: CANVAS_7X10,
        });
        expect(zones.find((z) => z.id === 'folio-strip')).toBeDefined();
      }
    });
  });

  describe('multi-trim — geometry scales with canvas', () => {
    it('shifts bottom-right corner outward on a wider 8.5×11 canvas', () => {
      const small = computeBadgeSafeZones({
        badgeContext: FULL_BADGES,
        layoutFamily: 'LAYOUT_D_PURE_TEXT',
        canvasIn: CANVAS_7X10,
      });
      const large = computeBadgeSafeZones({
        badgeContext: FULL_BADGES,
        layoutFamily: 'LAYOUT_D_PURE_TEXT',
        canvasIn: CANVAS_8_5X11,
      });
      const smallRight = small.find((z) => z.id === 'badge-hazard-source-corner')!;
      const largeRight = large.find((z) => z.id === 'badge-hazard-source-corner')!;
      expect(largeRight.xIn).toBeGreaterThan(smallRight.xIn);
    });
  });

  describe('partial badge contexts', () => {
    it('region only → left corner reserved, right corner released', () => {
      const zones = computeBadgeSafeZones({
        badgeContext: { region: 'GENERAL', hazard: [], source: '' },
        layoutFamily: 'LAYOUT_B_IMAGE_TOP',
        canvasIn: CANVAS_7X10,
      });
      expect(zones.find((z) => z.id === 'badge-region-corner')).toBeDefined();
      expect(zones.find((z) => z.id === 'badge-hazard-source-corner')).toBeUndefined();
    });

    it('hazards only → right corner reserved, left corner released', () => {
      const zones = computeBadgeSafeZones({
        badgeContext: { region: '', hazard: ['POISON'], source: '' },
        layoutFamily: 'LAYOUT_B_IMAGE_TOP',
        canvasIn: CANVAS_7X10,
      });
      expect(zones.find((z) => z.id === 'badge-region-corner')).toBeUndefined();
      expect(zones.find((z) => z.id === 'badge-hazard-source-corner')).toBeDefined();
    });
  });
});

describe('BADGE_ZONE_GEOMETRY — locked constants', () => {
  it('inset = bleed (0.125) + KDP safe (0.25) = 0.375 in', () => {
    expect(BADGE_ZONE_GEOMETRY.insetIn).toBeCloseTo(0.375);
  });

  it('safe-zone matches the Standard 0.9 in', () => {
    expect(BADGE_ZONE_GEOMETRY.safeZoneIn).toBe(0.9);
  });

  it('folio is 1.5 × 0.3 in', () => {
    expect(BADGE_ZONE_GEOMETRY.folioWidthIn).toBe(1.5);
    expect(BADGE_ZONE_GEOMETRY.folioHeightIn).toBe(0.3);
  });
});
