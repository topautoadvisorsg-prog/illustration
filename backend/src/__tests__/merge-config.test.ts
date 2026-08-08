import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { applyConfigPatch, deepMerge, unsetPath } from '../lib/merge-config.js';

/**
 * The defect: PATCH /config REPLACED the stored config, and the Book Setup form
 * sends only the fields it renders. Saving a title edit silently deleted the
 * author bio, the cover-sync record, and anything else the form has no input for.
 */

/** A stored config carrying metadata the Setup form does NOT render. */
const storedConfig = () =>
  ProjectConfigSchema.parse({
    volume: 1,
    title: 'NO ONE TOLD ME THAT',
    subtitle: 'Original subtitle',
    authorName: 'Nolan Whitlow',
    trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
    productionProfileId: 'wildlands-field-guide',
    publishing: {
      title: 'NO ONE TOLD ME THAT',
      subtitle: 'Original subtitle',
      authors: ['Nolan Whitlow'],
      // ── None of the following have an input in Book Setup ──
      dedication: 'For the kids who had to google it.',
      disclaimers: ['Not medical advice.'],
      coverArtDirection: 'A quiet desk lamp at night.',
      authorBio: { verbatim: 'Nolan Whitlow writes plainly for young readers.' },
      additionalResources: { heading: 'More help', items: ['A hotline'] },
      coverSync: { builtForPageCount: 160, spineIn: 0.36, generatedAt: '2026-08-08T00:00:00.000Z' },
      // ── These the form DOES render ──
      coverDescription: 'A straight-talking guide',
      series: { name: 'Some Series', volumeNumber: 1 },
    },
  });

/** What the Book Setup form actually PATCHes: a strict subset of the config. */
const setupFormPayload = (over: Record<string, unknown> = {}) => ({
  volume: 1,
  title: 'NO ONE TOLD ME THAT',
  subtitle: 'Edited subtitle',
  authorName: 'Nolan Whitlow',
  trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
  publishing: {
    title: 'NO ONE TOLD ME THAT',
    subtitle: 'Edited subtitle',
    authors: ['Nolan Whitlow'],
    coverDescription: 'A straight-talking guide',
    series: { name: 'Some Series', volumeNumber: 1 },
  },
  ...over,
});

describe('PATCH /config merge — editing a visible field preserves hidden config', () => {
  it('REGRESSION: a Setup-form save keeps every publishing field the form cannot see', () => {
    const before = storedConfig();
    const after = ProjectConfigSchema.parse(
      applyConfigPatch(before as never, setupFormPayload() as never),
    );

    // The edit landed.
    expect(after.subtitle).toBe('Edited subtitle');
    expect(after.publishing.subtitle).toBe('Edited subtitle');

    // Everything the form does not render survived. Under the old replace
    // semantics every one of these was silently dropped.
    expect(after.publishing.dedication).toBe('For the kids who had to google it.');
    expect(after.publishing.disclaimers).toEqual(['Not medical advice.']);
    expect(after.publishing.coverArtDirection).toBe('A quiet desk lamp at night.');
    expect(after.publishing.authorBio).toEqual({
      verbatim: 'Nolan Whitlow writes plainly for young readers.',
    });
    expect(after.publishing.additionalResources).toEqual({ heading: 'More help', items: ['A hotline'] });
    expect(after.publishing.coverSync).toEqual({
      builtForPageCount: 160,
      spineIn: 0.36,
      generatedAt: '2026-08-08T00:00:00.000Z',
    });
  });

  it('REGRESSION: a partial payload does not reset defaulted top-level blocks', () => {
    // layoutPolicy/colorPalette/imageGeneration all have schema defaults, so a
    // payload omitting them used to be "valid" and clobbered real values.
    const before = ProjectConfigSchema.parse({
      volume: 1,
      title: 'T',
      authorName: 'A',
      layoutPolicy: { defaultTemplate: 'LAYOUT_D_PURE_TEXT' },
      colorPalette: { ink: '#123456' },
    });
    expect(before.layoutPolicy.defaultTemplate).toBe('LAYOUT_D_PURE_TEXT');

    const after = ProjectConfigSchema.parse(
      applyConfigPatch(before as never, { title: 'T2' } as never),
    );
    expect(after.title).toBe('T2');
    expect(after.layoutPolicy.defaultTemplate).toBe('LAYOUT_D_PURE_TEXT');
    expect(after.colorPalette.ink).toBe('#123456');
  });

  it('clears a value only when explicitly unset', () => {
    const before = storedConfig();
    const after = ProjectConfigSchema.parse(
      applyConfigPatch(before as never, setupFormPayload() as never, [
        'publishing.bookDescription',
        'publishing.series',
      ]),
    );
    expect(after.publishing.series).toBeUndefined();
    expect(after.publishing.bookDescription).toBeUndefined();
    // The unset is surgical — its neighbours are untouched.
    expect(after.publishing.coverDescription).toBe('A straight-talking guide');
    expect(after.publishing.authorBio).toBeDefined();
  });

  it('an unset for something already absent is a no-op, not an error', () => {
    const before = ProjectConfigSchema.parse({ volume: 1, title: 'T', authorName: 'A' });
    const after = applyConfigPatch(before as never, {}, ['publishing.nope', 'not.a.path']);
    expect(after).toBeDefined();
    expect(ProjectConfigSchema.parse(after).title).toBe('T');
  });
});

describe('merge primitives', () => {
  it('merges nested objects key by key', () => {
    expect(deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 9 } })).toEqual({ a: { x: 1, y: 9 } });
  });

  it('REPLACES arrays wholesale rather than merging by index', () => {
    // Index-merging ordered values would be actively wrong: a 2-author list
    // would overwrite the first two of three and silently keep the third.
    expect(deepMerge({ a: ['x', 'y', 'z'] }, { a: ['p', 'q'] })).toEqual({ a: ['p', 'q'] });
  });

  it('treats undefined as "not supplied" but lets explicit null through', () => {
    expect(deepMerge({ a: 1, b: 2 }, { a: undefined })).toEqual({ a: 1, b: 2 });
    expect(deepMerge({ a: 1 }, { a: null })).toEqual({ a: null });
  });

  it('unsetPath is immutable and leaves the original intact', () => {
    const base = { p: { keep: 1, drop: 2 } };
    const out = unsetPath(base, 'p.drop');
    expect(out).toEqual({ p: { keep: 1 } });
    expect(base.p.drop).toBe(2);
  });
});
