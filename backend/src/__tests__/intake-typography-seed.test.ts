/**
 * Intake seeds typography from the pinned layout standard.
 *
 * ─── THE DEFECT ───────────────────────────────────────────────────────────
 * `ProjectConfig.typography` carries schema defaults from the field-guide era,
 * and `resolveTypesetDesign` gives the CONFIG precedence over the standard —
 * deliberately, because those values are the operator's to set in Book Setup.
 *
 * So a NEW book never got its standard's type at all. 7 NATIONAL PARKS was
 * pinned to a standard specifying Archivo at 1.35 leading and rendered in
 * Cormorant Garamond at 1.4, silently, because a stored default is
 * indistinguishable from a stored choice.
 *
 * It was not cosmetic. The unintended face embedded as TYPE3 glyph procedures
 * on every page — a format print RIPs commonly reject — while the standard's
 * own face produced Type0 CID subsets for all seven faces. The page count moved
 * from 120 to 116 as well, which would have invalidated a cover spine computed
 * from the earlier build.
 *
 * The fix is at CREATION only, so the precedence rule is untouched: an operator
 * who changes the face afterwards still wins, and no existing project moves.
 */
import { describe, expect, it } from 'vitest';
import { configFromBrief } from '../api/books.routes.js';
import { NATIONAL_PARKS_GUIDE_TYPESET_V1 } from '../pipeline/typeset/layout-standards/national-parks-guide-v1.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from '../pipeline/typeset/layout-standards/educational-nonfiction-v1.js';

const BRIEF = {
  title: '7 National Parks Without the Rookie Mistakes',
  subtitle: 'A subtitle',
  authorName: 'Tom Everett',
  volume: 1,
  trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0 },
  paperStock: 'white' as const,
  productionProfileId: 'trade-nonfiction-guide',
  typesetLayoutStandardId: 'national-parks-guide-typeset@1',
};

describe('configFromBrief seeds type from the standard', () => {
  it('takes the heading face and leading from the pinned standard', () => {
    const config = configFromBrief(BRIEF);
    expect(config.typography.headingFont).toBe(NATIONAL_PARKS_GUIDE_TYPESET_V1.type.headingFont);
    expect(config.typography.bodyFont).toBe(NATIONAL_PARKS_GUIDE_TYPESET_V1.type.bodyFont);
    expect(config.typography.bodyPt).toBe(NATIONAL_PARKS_GUIDE_TYPESET_V1.type.bodyPt);
    expect(config.typography.lineHeight).toBe(NATIONAL_PARKS_GUIDE_TYPESET_V1.type.lineHeight);
  });

  it('does not leave the field-guide default in place', () => {
    // The exact value that shipped the wrong face and the Type3 embedding.
    const config = configFromBrief(BRIEF);
    expect(config.typography.headingFont).not.toBe('Cormorant Garamond');
    expect(config.typography.lineHeight).not.toBe(1.4);
  });

  it('falls back to the PROFILE\'s standard when the brief pins none', () => {
    const config = configFromBrief({ ...BRIEF, typesetLayoutStandardId: undefined });
    // trade-nonfiction-guide names trade-nonfiction-guide-typeset@1 as its default.
    expect(config.typography.headingFont).toBe('Archivo');
    expect(config.typesetLayoutStandardId).toBeUndefined();
  });

  it('seeds the educational line from ITS standard, not from this one', () => {
    const config = configFromBrief({
      ...BRIEF,
      productionProfileId: 'bw-educational-nonfiction',
      typesetLayoutStandardId: EDUCATIONAL_NONFICTION_TYPESET_V1.id,
      trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
    });
    expect(config.typography.bodyPt).toBe(EDUCATIONAL_NONFICTION_TYPESET_V1.type.bodyPt);
    expect(config.typography.lineHeight).toBe(EDUCATIONAL_NONFICTION_TYPESET_V1.type.lineHeight);
  });

  it('still produces a valid config when the standard cannot be resolved', () => {
    // An unknown id must not throw here: the readiness gate is what reports it,
    // and refusing to build the config would turn a warning into a crash.
    const config = configFromBrief({ ...BRIEF, typesetLayoutStandardId: 'no-such-standard@9' });
    expect(config.typography.headingFont).toBeTruthy();
    expect(config.title).toBe(BRIEF.title);
  });
});
