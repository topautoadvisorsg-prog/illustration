import { describe, expect, it } from 'vitest';
import { planSpineType, GEORGIA_CAP_RATIO } from '../pipeline/publishing-standard/spine-type.js';

/**
 * THE SPINE TYPE MUST CLEAR THE FOLD *AS DRAWN*, HALO INCLUDED.
 *
 * Two defects reached finished covers here, and each of these tests fails
 * against the implementation that shipped them:
 *
 *   1. The type was centred with `dominant-baseline`, which librsvg ignores, so
 *      it sat half a cap height toward the front fold. On the 7 NATIONAL PARKS
 *      hardcover the title touched the fold — 0.000in of KDP's 0.0625in.
 *      Covered by the imbalance assertions below and, at the renderer level, by
 *      `svg-baseline-centring.test.ts`.
 *
 *   2. The reported clearance was arithmetic on a cap-height ratio, so it knew
 *      nothing about the halo stroked around every glyph. It read 0.1233in while
 *      the ink was on the fold. The plan now measures the COMPLETE footprint —
 *      fill, halo and antialiasing — on an isolated transparent render, and
 *      sizes the title down until that footprint clears a caller-set target.
 *
 * A spine 120px wide with 6px of type would pass anything, so every case below
 * uses a strip narrow enough that the halo genuinely matters.
 */

const BASE = {
  title: '7 National Parks Without the Rookie Mistakes',
  author: 'Tom Everett',
  wrapHeightPx: 1200,
  spineWidthPx: 78, // the 0.261in paperback spine at 300 DPI
  foldSafeWidthPx: 41,
  safeLengthPx: 1100,
  gapPx: 150,
};

describe('planSpineType — fold clearance', () => {
  it('measures the halo, not just the cap box', async () => {
    const plan = await planSpineType(BASE);

    // The cap box is what the old number described; the drawn footprint is
    // bigger, because the halo is stroked OUTSIDE the glyph. If these were ever
    // equal, the measurement would have stopped seeing the halo.
    expect(plan.measuredClearPerSidePx).toBeLessThan(plan.clearPerSidePx);

    // And the footprint really is wider than the cap height.
    const drawnWidth = BASE.spineWidthPx - plan.measuredLeftClearPx - plan.measuredRightClearPx;
    expect(drawnWidth).toBeGreaterThan(Math.round(plan.titlePx * GEORGIA_CAP_RATIO));
  });

  it('sizes the title down until the drawn footprint meets the target', async () => {
    const target = 23; // ~0.0767in at 300 DPI
    const plan = await planSpineType({ ...BASE, targetClearPx: target });

    expect(plan.measuredClearPerSidePx).toBeGreaterThanOrEqual(target);
    expect(plan.measuredLeftClearPx).toBeGreaterThanOrEqual(target);
    expect(plan.measuredRightClearPx).toBeGreaterThanOrEqual(target);
    expect(plan.reducedForClearance).toBe(true);
  });

  it('a higher target yields smaller type — the constraint actually binds', async () => {
    const loose = await planSpineType({ ...BASE, targetClearPx: 18 });
    const tight = await planSpineType({ ...BASE, targetClearPx: 26 });
    expect(tight.titlePx).toBeLessThan(loose.titlePx);
    expect(tight.measuredClearPerSidePx).toBeGreaterThanOrEqual(26);
  });

  it('centres the drawn ink across the spine, within a pixel or two', async () => {
    // The `dominant-baseline` defect showed up here: the ink was pushed a half
    // cap height to one side, so the two clearances were wildly unequal.
    const plan = await planSpineType({ ...BASE, targetClearPx: 23 });
    expect(plan.measuredImbalancePx).toBeLessThanOrEqual(2);
  });

  it('reports each line separately, so a short author cannot mask a wide title', async () => {
    const plan = await planSpineType({ ...BASE, targetClearPx: 23 });
    // The author is set smaller, so it must clear by at least as much.
    expect(plan.authorClearLeftPx).toBeGreaterThanOrEqual(plan.titleClearLeftPx);
    expect(plan.authorClearRightPx).toBeGreaterThanOrEqual(plan.titleClearRightPx);
    // And the strip figure is the worst of the two lines, not an average.
    expect(plan.measuredClearPerSidePx).toBe(
      Math.min(plan.measuredLeftClearPx, plan.measuredRightClearPx),
    );
  });

  it('refuses rather than shipping type it cannot fit', async () => {
    // A target that consumes the whole strip cannot be satisfied at any readable size.
    await expect(
      planSpineType({ ...BASE, targetClearPx: Math.floor(BASE.spineWidthPx / 2) }),
    ).rejects.toThrow(/does not fit/);
  });
});
