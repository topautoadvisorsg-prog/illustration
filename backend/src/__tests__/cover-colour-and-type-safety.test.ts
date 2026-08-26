/**
 * The two defects in the first paid cover, as tests.
 *
 * 1. IT CAME BACK BEIGE AND BLACK. The art direction asked for cobalt and
 *    signal orange. The cover was inheriting the INTERIOR's black-and-white
 *    clear-line DNA, whose colorMode says "render entirely in MONOCHROME with
 *    NO colour whatsoever; interpret any colour named in the subject purely as
 *    tone". The model obeyed. A B&W interior is a printing economy; KDP prints
 *    every paperback cover in full colour regardless.
 *
 * 2. THE AUTHOR NAME SAT ON THE BOTTOM EDGE. The wrap carries 0.125in of bleed
 *    that is cut off, and readable copy wants a further 0.25in of clearance.
 *    Type with nothing beneath it drifts to the edge, so the prompt now asks
 *    for a graphic element under it to hold it up.
 */
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { computeCoverDimensions } from '../pipeline/publishing-standard/cover-dimensions.js';
import { buildCoverWrapPrompt, coverTypeSafeArea } from '../pipeline/stage-6-layout/render-chapter.js';
import { getProductionProfile } from '../pipeline/production-profiles/registry.js';

const config = (profileId: string) =>
  ProjectConfigSchema.parse({
    volume: 1,
    title: 'NO ONE TOLD ME THAT',
    authorName: 'Nolan Whitlow',
    trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
    paperStock: 'cream',
    productionProfileId: profileId,
    publishing: { coverArtDirection: 'deep saturated cobalt with a signal orange accent, flat graphic shapes' },
  });

const prompt = (profileId: string) => {
  const c = config(profileId);
  return buildCoverWrapPrompt(c, 154, computeCoverDimensions(c, 154));
};

describe('cover colour', () => {
  it('the B&W educational profile uses a COLOUR dna for its cover', () => {
    const p = getProductionProfile('bw-educational-nonfiction');
    expect(p.defaultStyleDnaId).toBe('bw-educational-clearline');
    expect(p.coverStyleDnaId).toBe('graphic-trade-cover');
  });

  it('does not tell the model to render the cover in monochrome', () => {
    const p = prompt('bw-educational-nonfiction');
    expect(p).not.toMatch(/MONOCHROME with NO colour/i);
    // The exact instruction that ate cobalt and orange on the first render.
    expect(p).not.toMatch(/interpret any colour named in the subject purely as tone/i);
  });

  it('tells the model to keep the named palette', () => {
    const p = prompt('bw-educational-nonfiction');
    expect(p).toMatch(/FULL COLOUR/);
    expect(p).toMatch(/do NOT convert any named colour to grey, tone, sepia, kraft or monochrome/i);
  });

  it('leaves the field guide on its own cover look', () => {
    // No coverStyleDnaId there, so it falls back to defaultStyleDnaId and the
    // book that already shipped is unaffected.
    expect(getProductionProfile('wildlands-field-guide').coverStyleDnaId).toBeUndefined();
  });
});

describe('cover type safety', () => {
  const dims = computeCoverDimensions(config('bw-educational-nonfiction'), 154);

  it('states the real trim inset as a share of the image', () => {
    const band = coverTypeSafeArea(dims);
    // 0.125 bleed + 0.25 clearance = 0.375in. Of 8.75in that is 4.3% -> 5%;
    // of 11.635in it is 3.2% -> 4%.
    expect(band).toContain('0.375 inches');
    expect(band).toMatch(/outer 5% of the image height/);
    expect(band).toMatch(/outer 4% of the image width/);
  });

  it('names the author name specifically and says how to hold it up', () => {
    const band = coverTypeSafeArea(dims);
    expect(band).toMatch(/author name in particular must NOT sit at the very bottom/i);
    expect(band).toMatch(/place a graphic band, object or colour block BELOW the author name/i);
  });

  it('reaches the actual prompt', () => {
    expect(prompt('bw-educational-nonfiction')).toMatch(/TRIM SAFETY FOR TYPE/);
  });
});
