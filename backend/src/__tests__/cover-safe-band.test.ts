/**
 * The cover art's edge crop must be stated to the model, and stated correctly.
 *
 * composeCoverPrint fits the art with `fit: 'cover'`, which centre-crops
 * whatever the wrap's aspect does not use. Nothing told anyone how much that
 * was. For NO ONE TOLD ME THAT it is 0.68in off each end — 12% of the front
 * panel — which would remove baked cover typography.
 */
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { computeCoverDimensions } from '../pipeline/publishing-standard/cover-dimensions.js';
import { coverArtSafeBand, COVER_ART_CANVAS_PX } from '../pipeline/stage-6-layout/render-chapter.js';

const config = (over = {}) =>
  ProjectConfigSchema.parse({
    volume: 1,
    title: 'NO ONE TOLD ME THAT',
    authorName: 'Nolan Whitlow',
    trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
    paperStock: 'cream',
    ...over,
  });

describe('coverArtSafeBand', () => {
  it('warns about the real horizontal crop for the 154-page cream digest wrap', () => {
    const dims = computeCoverDimensions(config(), 154);
    // 11.635 x 8.750 wrap vs a 1.5 canvas: height governs, width is cropped.
    // The wrap carries KDP's 0.125in cover bleed even though this book's
    // INTERIOR prints with none — see COVER_BLEED_IN.
    expect(dims.fullWidthIn).toBeCloseTo(11.635, 3);
    expect(dims.fullHeightIn).toBeCloseTo(8.75, 3);
    expect(dims.spineIn).toBeCloseTo(0.385, 4);

    const band = coverArtSafeBand(dims);
    expect(band).toContain('EDGE CROP');
    // 223px of 3938 scaled px is 5.67% -> ceil 6.
    expect(band).toMatch(/outer 6% of the LEFT edge/);
    expect(band).toMatch(/outer 6% of the RIGHT edge/);
    // Height fills exactly, so there is nothing to say about top and bottom.
    expect(band).not.toContain('TOP and BOTTOM');
  });

  it('tells the model that typography specifically must survive', () => {
    const band = coverArtSafeBand(computeCoverDimensions(config(), 154));
    expect(band).toContain('every letter of typography');
  });

  it('moves the warning to the other axis for a wrap wider than the canvas', () => {
    // Every normal book wrap is NARROWER than the widest canvas the model
    // offers (1.5), so the crop is essentially always horizontal — which is
    // worth knowing. A landscape trim inverts it, and proves the band is
    // computed from the geometry rather than fixed to one axis.
    const wide = computeCoverDimensions(config({ trimSize: { widthIn: 8.5, heightIn: 5.5, bleedIn: 0 } }), 24);
    expect(wide.fullWidthIn / wide.fullHeightIn).toBeGreaterThan(COVER_ART_CANVAS_PX.w / COVER_ART_CANVAS_PX.h);

    const band = coverArtSafeBand(wide);
    expect(band).toContain('TOP and BOTTOM');
  });
});
