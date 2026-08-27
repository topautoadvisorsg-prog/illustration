/**
 * WHAT A FAILURE HERE MEANS
 *
 * These triggers are the edge of the job. If one stops firing, a correction that
 * repaginated the book reports LEVEL 1 and ships. If one fires when it should
 * not, every one-line edit becomes a structural review again, which is the
 * behaviour this whole path exists to stop.
 *
 * So both directions are tested: the trigger fires on real movement, and the
 * quiet case stays quiet.
 */
import { describe, expect, it } from 'vitest';
import { assessChange, pageTargets } from '../pipeline/corrections/escalation.js';
import type { FrozenRecipe } from '../pipeline/corrections/frozen-recipe.js';
import type { PageModel, ModelPage } from '../pipeline/page-qa/page-model.js';

const page = (n: number, text: string, bodyLines = 20): ModelPage =>
  ({
    number: n,
    widthPt: 396,
    heightPt: 612,
    lines: [{ text, xPt: 0, yPt: 0, widthPt: 100, heightPt: 10, sizePt: 11 }],
    body: Array.from({ length: bodyLines }, () => ({
      text,
      xPt: 0,
      yPt: 0,
      widthPt: 100,
      heightPt: 10,
      sizePt: 11,
    })),
  }) as unknown as ModelPage;

const model = (texts: string[], bodyLines?: number[]): PageModel =>
  ({
    pageCount: texts.length,
    pages: texts.map((t, i) => page(i + 1, t, bodyLines?.[i] ?? 20)),
    norms: { bodySizePt: 11, leadingPt: 14, measurePt: 333 },
  }) as unknown as PageModel;

const recipe = (over: Partial<FrozenRecipe> = {}): FrozenRecipe =>
  ({
    freezeId: 'book-proof-rev26',
    pageCount: 3,
    illustrations: [{ blockId: 'a', page: 2 }],
    ...over,
  }) as FrozenRecipe;

const three = ['one', 'two', 'three'];

describe('the quiet case stays quiet', () => {
  it('is LEVEL 1 when only the edited page changed', () => {
    const a = assessChange({
      recipe: recipe(),
      frozen: model(three),
      rebuilt: model(['one', 'two EDITED', 'three']),
      expectedPages: [2],
    });
    expect(a.level).toBe(1);
    expect(a.changedPages).toEqual([2]);
    expect(a.triggers).toEqual([]);
    expect(a.confined).toBe(true);
  });

  it('is LEVEL 2 when the edited page reflowed but nothing else moved', () => {
    const a = assessChange({
      recipe: recipe(),
      frozen: model(three, [20, 20, 20]),
      rebuilt: model(['one', 'two EDITED', 'three'], [20, 21, 20]),
      expectedPages: [2],
    });
    expect(a.level).toBe(2);
    expect(a.reflowedPages).toEqual([2]);
    expect(a.triggers).toEqual([]);
  });
});

describe('structural movement escalates', () => {
  it('flags a page-count change', () => {
    const a = assessChange({
      recipe: recipe(),
      frozen: model(three),
      rebuilt: model([...three, 'four']),
    });
    expect(a.level).toBe(3);
    expect(a.triggers.map((t) => t.code)).toContain('PAGE_COUNT_CHANGED');
  });

  it('flags a diff outside the edited region', () => {
    const a = assessChange({
      recipe: recipe(),
      frozen: model(three),
      rebuilt: model(['one', 'two EDITED', 'three MOVED']),
      expectedPages: [2],
    });
    expect(a.level).toBe(3);
    expect(a.triggers.map((t) => t.code)).toContain('UNEXPECTED_PAGE_DIFF');
    expect(a.confined).toBe(false);
  });

  /** Same text, different line count: a text edit cannot do this. */
  it('flags reflow on a page whose text did not change', () => {
    const a = assessChange({
      recipe: recipe(),
      frozen: model(three, [20, 20, 20]),
      rebuilt: model(three, [20, 20, 19]),
    });
    expect(a.triggers.map((t) => t.code)).toContain('REFLOW_WITHOUT_TEXT_CHANGE');
  });

  it('flags a moved illustration', () => {
    const a = assessChange({
      recipe: recipe(),
      frozen: model(three),
      rebuilt: model(three),
      rebuiltIllustrations: [{ blockId: 'a', page: 3 }],
    });
    expect(a.triggers.map((t) => t.code)).toContain('ILLUSTRATION_MOVED');
  });

  it('flags an orphaned illustration', () => {
    const a = assessChange({
      recipe: recipe(),
      frozen: model(three),
      rebuilt: model(three),
      orphanedIllustrations: [{ blockId: 'a', reason: 'anchor not found' }],
    });
    expect(a.triggers.map((t) => t.code)).toContain('ILLUSTRATION_ORPHANED');
  });

  it('flags a changed reference-target count', () => {
    const a = assessChange({
      recipe: recipe(),
      frozen: model(three),
      rebuilt: model(three),
      frozenManuscript: 'see p. 12 and p. 40',
      correctedManuscript: 'see p. 12',
    });
    expect(a.triggers.map((t) => t.code)).toContain('REFERENCE_TARGET_COUNT_CHANGED');
  });

  it('flags a renderer that moved and was not cleared by the reproduction gate', () => {
    const a = assessChange({
      recipe: recipe(),
      frozen: model(three),
      rebuilt: model(three),
      engineMatches: false,
    });
    expect(a.triggers.map((t) => t.code)).toContain('ENGINE_FINGERPRINT_CHANGED');
  });

  /** The gate passing must actually suppress the trigger, or it is decoration. */
  it('does not flag a renderer the reproduction gate proved inert', () => {
    const a = assessChange({
      recipe: recipe(),
      frozen: model(three),
      rebuilt: model(['one', 'two EDITED', 'three']),
      expectedPages: [2],
      engineMatches: true,
    });
    expect(a.triggers.map((t) => t.code)).not.toContain('ENGINE_FINGERPRINT_CHANGED');
    expect(a.level).toBe(1);
  });
});

describe('page targets', () => {
  /**
   * This book has three expressions that name a second page. Counting
   * expressions alone reports 121 where the index actually carries 124 targets.
   */
  it('counts a second page named in one expression', () => {
    expect(pageTargets('see p. 64')).toEqual({ expressions: 1, targets: 1 });
    expect(pageTargets('see p. 117, 124')).toEqual({ expressions: 1, targets: 2 });
  });
});
