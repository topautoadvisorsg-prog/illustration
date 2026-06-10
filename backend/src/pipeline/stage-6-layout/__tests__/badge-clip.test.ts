import { describe, expect, it } from 'vitest';
import { clipAllocationForBadgeBand } from '../badge-clip.js';
import type { LayoutAllocation, PlanningZone } from '../layout-director.js';
import type { BadgeSafeZone } from '../../publishing-standard/badge-zones.js';

const CANVAS_7X10 = { w: 7.25, h: 10.25 };

const FULL_BADGE_ZONES: BadgeSafeZone[] = [
  { id: 'badge-region-corner', role: 'badge', xIn: 0.375, yIn: 8.975, widthIn: 0.9, heightIn: 0.9 },
  { id: 'badge-hazard-source-corner', role: 'badge', xIn: 5.975, yIn: 8.975, widthIn: 0.9, heightIn: 0.9 },
  { id: 'folio-strip', role: 'folio', xIn: 2.875, yIn: 9.325, widthIn: 1.5, heightIn: 0.3 },
];

function zone(id: string, yPct: number, heightPct: number): PlanningZone {
  return {
    id,
    role: 'body',
    regionType: 'reading-field',
    shape: 'rect',
    xPct: 10,
    yPct,
    widthPct: 80,
    heightPct,
    instruction: '',
  };
}

function alloc(zones: PlanningZone[]): LayoutAllocation {
  // Minimal valid LayoutAllocation. The clip helper only reads four zone arrays
  // (text-safe, typography, image-priority, regions). Everything else here is
  // boilerplate satisfying the TS contract.
  const emptyArtBox = {
    xIn: 0,
    yIn: 0,
    widthIn: 0,
    heightIn: 0,
    recommendedWidthPx: 0,
    recommendedHeightPx: 0,
    bleedPaddingPx: 0,
    aspectRatio: '1:1',
    overlaySafeArea: '',
  };
  return {
    priorityEdge: 'TOP_BAND',
    imagePriorityZone: emptyArtBox,
    textSafeZones: zones,
    typographyZones: [],
    imagePriorityZones: [],
    regions: zones,
    imagePlacement: '',
    textPlacement: '',
    openingPageImagePercent: 50,
    openingPageTextPercent: 50,
    continuationPageImagePercent: 0,
    continuationPageTextPercent: 100,
    estimatedRenderedPages: 1,
    wordsPerOpeningPage: 100,
    wordsPerContinuationPage: 0,
    notes: [],
    architecture: 'TOP_BAND',
    artBox: emptyArtBox,
  };
}

describe('clipAllocationForBadgeBand', () => {
  it('passes through unchanged when no badge zones (legacy behavior)', () => {
    const input = alloc([zone('z1', 10, 80)]);
    const out = clipAllocationForBadgeBand(input, [], CANVAS_7X10);
    expect(out).toBe(input);
  });

  it('clips a zone whose bottom dips into the badge band', () => {
    // canvas 10.25, min badge yIn 8.975 → maxYPct = 87.6%
    // zone from 10% to 90% (top + height) — needs clipping
    const input = alloc([zone('long', 10, 80)]);
    const out = clipAllocationForBadgeBand(input, FULL_BADGE_ZONES, CANVAS_7X10);
    const clipped = out.textSafeZones[0]!;
    expect(clipped.yPct).toBe(10);
    expect(clipped.yPct + clipped.heightPct).toBeCloseTo(8.975 / 10.25 * 100, 1);
  });

  it('leaves a zone untouched when its bottom sits above the badge band', () => {
    const input = alloc([zone('safe', 10, 70)]); // bottom at 80% — above 87.6%
    const out = clipAllocationForBadgeBand(input, FULL_BADGE_ZONES, CANVAS_7X10);
    const safe = out.textSafeZones[0]!;
    expect(safe.heightPct).toBe(70);
  });

  it('drops zones that get clipped to near-zero height', () => {
    // zone starts at 95% — entirely inside band — clip to ~0 → dropped
    const input = alloc([zone('all-in-band', 95, 3)]);
    const out = clipAllocationForBadgeBand(input, FULL_BADGE_ZONES, CANVAS_7X10);
    expect(out.textSafeZones).toEqual([]);
    expect(out.regions).toEqual([]);
  });

  it('uses the highest top edge across all badge zones (corner not folio)', () => {
    // corner yIn 8.975 < folio yIn 9.325 — corners drive the clip
    const input = alloc([zone('z', 0, 100)]);
    const out = clipAllocationForBadgeBand(input, FULL_BADGE_ZONES, CANVAS_7X10);
    const clipped = out.textSafeZones[0]!;
    expect(clipped.heightPct).toBeCloseTo(8.975 / 10.25 * 100, 1);
  });

  it('folio-only release (LAYOUT_F + zero badges) → uses folio top edge', () => {
    // O-7 folio drop / O-6 release combo not tested here — but if only folio
    // remains, the clip uses folio's yIn 9.325.
    const folioOnly: BadgeSafeZone[] = [FULL_BADGE_ZONES[2]!];
    const input = alloc([zone('z', 0, 100)]);
    const out = clipAllocationForBadgeBand(input, folioOnly, CANVAS_7X10);
    const clipped = out.textSafeZones[0]!;
    expect(clipped.heightPct).toBeCloseTo(9.325 / 10.25 * 100, 1);
  });
});
