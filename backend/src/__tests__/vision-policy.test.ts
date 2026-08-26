/**
 * WHAT A FAILURE HERE MEANS
 *
 * This is the layer that decides what an observation MEANS, and it exists
 * because the previous design asked the model to decide instead. That version
 * excused a BODY page with 45% of it erased, then condemned pages with an
 * ordinary bottom margin, across four prompt revisions. The rules could not be
 * inspected or tested; they could only be reworded and re-run at cost.
 *
 * Here they are ordinary branches. The permanent negative control below — the
 * half-erased page that exposed the failure — must never again come back clean.
 *
 * No model calls. Observations are supplied directly, which is the whole point
 * of separating them from judgement.
 */
import { describe, expect, it } from 'vitest';
import { applyVisionPolicy, isDefect } from '../pipeline/page-qa/vision-policy.js';
import { validateObservations } from '../pipeline/page-qa/vision-observations.js';
import type { PageObservations } from '../pipeline/page-qa/vision-observations.js';

const base: PageObservations = {
  page: 1,
  fill: { contentEndsAtPercent: 92, largestEmptyRegionPercent: 8, unusedPercent: 12, emptyRegionLocation: 'BOTTOM' },
  structureSeen: {
    chapterTitle: false,
    subheading: false,
    calloutPanel: false,
    list: false,
    table: false,
    illustration: false,
    sceneBreakOrnament: false,
    folio: true,
    runningHead: true,
  },
  headingRelationship: 'NO_HEADING',
  textFlow: 'VISUALLY_NORMAL',
  panel: 'NO_PANEL',
  balance: 'BALANCED',
  renderingDefect: { present: false, description: '', region: '' },
  visualConcern: 'NONE',
  concernReason: '',
};
const obs = (o: Partial<PageObservations>): PageObservations => ({ ...base, ...o });
const fill = (contentEndsAtPercent: number, emptyRegionLocation: PageObservations['fill']['emptyRegionLocation'] = 'BOTTOM') =>
  obs({ fill: { ...base.fill, contentEndsAtPercent, largestEmptyRegionPercent: 100 - contentEndsAtPercent, emptyRegionLocation } });

describe('THE PERMANENT NEGATIVE CONTROL', () => {
  /**
   * A BODY page whose bottom 45% is gone. Four judgement-prompt versions called
   * this GOOD. It must never come back clean again.
   */
  const erased = fill(55);

  it('is a defect on a BODY page', () => {
    const r = applyVisionPolicy(erased, 'BODY');
    expect(isDefect(r)).toBe(true);
    expect(r.findings.map((f) => f.code)).toContain('PAGE_STOPS_EARLY');
  });

  it('is never CLEAN', () => {
    expect(applyVisionPolicy(erased, 'BODY').overall).not.toBe('CLEAN');
  });

  it('THE ROLE CONTRAST: identical observations are correct on a chapter ending', () => {
    const r = applyVisionPolicy(erased, 'CHAPTER_END');
    expect(isDefect(r)).toBe(false);
    expect(r.findings.map((f) => f.code)).toContain('SPARSE_BY_DESIGN');
  });

  it('a severely truncated BODY page is a HARD_FAIL, not a review note', () => {
    expect(applyVisionPolicy(fill(35), 'BODY').overall).toBe('HARD_FAIL');
  });

  it('a hole in the MIDDLE is a hard failure regardless of how far text reaches', () => {
    expect(applyVisionPolicy(fill(60, 'MIDDLE'), 'BODY').overall).toBe('HARD_FAIL');
  });
});

describe('role modifies interpretation without excusing everything', () => {
  it('a full BODY page is clean', () => {
    expect(applyVisionPolicy(fill(92), 'BODY').overall).toBe('CLEAN');
  });

  it('an ordinary bottom margin is not a hole', () => {
    // The over-corrected judgement prompt flagged pages like this one.
    expect(isDefect(applyVisionPolicy(fill(85), 'BODY'))).toBe(false);
  });

  it('a sparse chapter opener is EXPECTED, not a finding', () => {
    const r = applyVisionPolicy(fill(40), 'CHAPTER_OPENER');
    expect(r.overall).toBe('EXPECTED');
    expect(isDefect(r)).toBe(false);
  });

  it('but a chapter ending is NOT excused a rendering defect', () => {
    const r = applyVisionPolicy(
      obs({ renderingDefect: { present: true, description: 'a block over the text', region: 'centre' } }),
      'CHAPTER_END',
    );
    expect(r.overall).toBe('HARD_FAIL');
  });

  it('and a part divider is not excused a collision', () => {
    expect(applyVisionPolicy(obs({ balance: 'COLLISION_OR_CLIPPING' }), 'PART_DIVIDER').overall).toBe('HARD_FAIL');
  });
});

describe('parity blanks', () => {
  it('are clean when empty', () => {
    const empty = obs({ structureSeen: { ...base.structureSeen, folio: false, runningHead: false } });
    expect(applyVisionPolicy(empty, 'PARITY_BLANK').overall).toBe('CLEAN');
  });

  it('are a HARD_FAIL when they carry furniture', () => {
    const r = applyVisionPolicy(base, 'PARITY_BLANK');
    expect(r.overall).toBe('HARD_FAIL');
    expect(r.findings.map((f) => f.code)).toContain('FURNITURE_ON_BLANK');
  });

  it('are judged on nothing else: an empty page has no composition', () => {
    const weird = obs({
      structureSeen: { ...base.structureSeen, folio: false, runningHead: false },
      textFlow: 'APPARENT_ORPHAN',
      headingRelationship: 'STRANDED_FROM_ITS_CONTENT',
    });
    expect(applyVisionPolicy(weird, 'PARITY_BLANK').overall).toBe('CLEAN');
  });
});

describe('vision-only flow signals require corroboration', () => {
  /**
   * Vision measures fill well and judges line-level flow badly: in tuning it
   * reported an orphan on an ordinary page and a stranded heading on a chapter
   * ending that simply stopped. Those judgements need line coordinates, and the
   * deterministic pass has them.
   */
  const orphan = obs({ textFlow: 'APPARENT_ORPHAN', fill: { ...base.fill, contentEndsAtPercent: 90 } });

  it('an uncorroborated orphan is a note, not a defect', () => {
    const r = applyVisionPolicy(orphan, 'BODY');
    expect(isDefect(r)).toBe(false);
    expect(r.findings.find((f) => f.code === 'ORPHAN')?.classification).toBe('EXPECTED');
  });

  it('a corroborated orphan is a REVIEW finding', () => {
    const r = applyVisionPolicy(orphan, 'BODY', ['ORPHAN']);
    expect(r.overall).toBe('REVIEW');
  });

  it('the same rule applies to a stranded heading', () => {
    const h = obs({ headingRelationship: 'STRANDED_FROM_ITS_CONTENT' });
    expect(isDefect(applyVisionPolicy(h, 'BODY'))).toBe(false);
    expect(applyVisionPolicy(h, 'BODY', ['STRANDED_HEADING']).overall).toBe('REVIEW');
  });

  it('breakage never needs corroboration', () => {
    // A defect vision can actually see is not held hostage to a measurement.
    const r = applyVisionPolicy(obs({ renderingDefect: { present: true, description: 'x', region: 'y' } }), 'BODY');
    expect(r.overall).toBe('HARD_FAIL');
  });
});

describe('heading spacing', () => {
  it('a large gap above a heading is hierarchy', () => {
    const r = applyVisionPolicy(
      obs({ headingRelationship: 'UNUSUALLY_LARGE_GAP', structureSeen: { ...base.structureSeen, subheading: true } }),
      'BODY',
    );
    expect(isDefect(r)).toBe(false);
    expect(r.findings.map((f) => f.code)).toContain('HEADING_SPACING');
  });

  it('a large gap with NO heading to explain it is a finding', () => {
    const r = applyVisionPolicy(obs({ headingRelationship: 'UNUSUALLY_LARGE_GAP' }), 'BODY');
    expect(r.overall).toBe('REVIEW');
    expect(r.findings.map((f) => f.code)).toContain('GAP_WITHOUT_HEADING');
  });
});

describe('the observation schema', () => {
  const good = {
    page: 3,
    fill: { contentEndsAtPercent: 90, largestEmptyRegionPercent: 10, unusedPercent: 12, emptyRegionLocation: 'BOTTOM' },
    structureSeen: base.structureSeen,
    headingRelationship: 'NO_HEADING',
    textFlow: 'VISUALLY_NORMAL',
    panel: 'NO_PANEL',
    balance: 'BALANCED',
    renderingDefect: { present: false, description: '', region: '' },
    visualConcern: 'NONE',
    concernReason: '',
  };

  it('accepts a well-formed observation', () => {
    expect(validateObservations(good)?.fill.contentEndsAtPercent).toBe(90);
  });

  it.each([
    ['not an object', 42],
    ['missing fill', { ...good, fill: undefined }],
    ['percentage above 100', { ...good, fill: { ...good.fill, contentEndsAtPercent: 140 } }],
    ['percentage negative', { ...good, fill: { ...good.fill, unusedPercent: -1 } }],
    ['percentage not a number', { ...good, fill: { ...good.fill, unusedPercent: 'lots' } }],
    ['unknown empty-region location', { ...good, fill: { ...good.fill, emptyRegionLocation: 'SIDEWAYS' } }],
    ['structure flag not boolean', { ...good, structureSeen: { ...base.structureSeen, folio: 'yes' } }],
    ['structure key missing', { ...good, structureSeen: { folio: true } }],
    ['unknown heading relationship', { ...good, headingRelationship: 'FLOATING' }],
    ['unknown text flow', { ...good, textFlow: 'WOBBLY' }],
    ['unknown balance', { ...good, balance: 'DIAGONAL' }],
    ['renderingDefect.present not boolean', { ...good, renderingDefect: { present: 'maybe' } }],
    ['unknown concern', { ...good, visualConcern: 'SOME' }],
  ])('refuses %s', (_l, value) => {
    expect(validateObservations(value)).toBeNull();
  });
});

describe('report only', () => {
  it('the policy result cannot express an edit', () => {
    const r = applyVisionPolicy(fill(35), 'BODY');
    for (const f of r.findings) {
      // A suggested correction TYPE, and nothing that could be applied.
      expect(Object.keys(f).sort()).toEqual(['classification', 'code', 'evidence', 'suggests'].sort());
    }
  });

  it('records the model opinion without letting it decide', () => {
    // HIGH concern on a page the policy finds clean stays clean.
    const r = applyVisionPolicy(obs({ visualConcern: 'HIGH', concernReason: 'feels odd' }), 'BODY');
    expect(r.modelConcern).toBe('HIGH');
    expect(r.overall).toBe('CLEAN');
  });
});
