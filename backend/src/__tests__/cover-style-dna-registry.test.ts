/**
 * The two COVER Style DNAs are opposites, and must stay that way.
 *
 * `graphic-trade-cover` forbids photographic rendering; `photographic-trade-cover`
 * requires it. That opposition is the point: an operator picks a look by picking
 * a DNA, not by arguing with one in the art direction.
 *
 * It also has to be loud, because the failure mode is SILENT. Asking for a
 * photographic cover under the flat DNA does not error — it just comes back flat,
 * and the operator concludes the model cannot do it. Three DIRT RICH covers were
 * burned that way. These tests exist so a future edit cannot quietly soften
 * either profile into the other and reintroduce that.
 */
import { describe, expect, it } from 'vitest';
import { STYLE_DNA, getStyleDna } from '../pipeline/publishing-standard/style-dna.js';

const FLAT = 'graphic-trade-cover';
const PHOTO = 'photographic-trade-cover';

describe('cover Style DNA registry', () => {
  it('registers both cover looks', () => {
    expect(Object.keys(STYLE_DNA)).toContain(FLAT);
    expect(Object.keys(STYLE_DNA)).toContain(PHOTO);
  });

  it('adding the photographic look did not disturb the flat one', () => {
    // The book that shipped on the flat DNA must keep rendering flat.
    const flat = getStyleDna(FLAT);
    expect(flat.medium).toMatch(/flat vector shapes/i);
    expect(flat.colorMode).toMatch(/flat fills only/i);
    expect(flat.lighting).toMatch(/^None\./);
  });
});

describe('the two cover DNAs are genuinely opposite', () => {
  const flat = getStyleDna(FLAT);
  const photo = getStyleDna(PHOTO);

  it('the flat DNA forbids photographic rendering', () => {
    const text = `${flat.medium} ${flat.colorMode} ${flat.referenceArtists}`.toLowerCase();
    expect(text).toMatch(/no photographic shading|not photographic|flat fills only/);
  });

  it('the photographic DNA requires it', () => {
    const text = `${photo.medium} ${photo.colorMode}`.toLowerCase();
    expect(text).toMatch(/photorealistic|photographic/);
    expect(photo.colorMode.toLowerCase()).toMatch(/gradients, shadow and photographic shading are\s+required/);
  });

  it('the photographic DNA only ever mentions flat design to FORBID it', () => {
    // A crude "does it contain the words" check fails here, and should: this
    // profile says "never flat fills" and "not vector shapes". Those are
    // prohibitions. What matters is that no occurrence is PRESCRIPTIVE, so the
    // assertion is about the words in front of the phrase, not the phrase.
    const text = `${photo.medium} ${photo.colorMode} ${photo.lineWork} ${photo.lighting}`.toLowerCase();
    for (const phrase of ['flat fills', 'vector shapes', 'flat graphic design']) {
      let from = 0;
      for (;;) {
        const at = text.indexOf(phrase, from);
        if (at < 0) break;
        // Look at the ~24 characters immediately before the phrase; a legitimate
        // mention is always introduced by a negation.
        const lead = text.slice(Math.max(0, at - 24), at);
        expect(lead, `"...${lead}${phrase}" must be negated`).toMatch(/\b(never|not|no)\b/);
        from = at + phrase.length;
      }
    }
  });

  it('the photographic DNA keeps lighting, which the flat one removes', () => {
    // Lighting is the single clearest tell between the two looks.
    expect(flat.lighting).toMatch(/never from a light source/i);
    expect(photo.lighting).toMatch(/real directional daylight/i);
  });
});
