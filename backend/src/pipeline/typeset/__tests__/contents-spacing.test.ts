/**
 * WHAT A FAILURE HERE MEANS
 *
 * A book class can now set its contents list tighter than the front-matter
 * generator's default. Two things have to stay true, and only one of them is
 * about the new behaviour.
 *
 * THE IMPORTANT ONE IS THE NEGATIVE. Every standard that declares no contents
 * policy — @1, @2, @3, and every trade standard — must emit EXACTLY the CSS it
 * emitted before this setting existed, down to the `.62em` literal without its
 * leading zero. `${0.62}` stringifies as `0.62`, which is the same length in CSS
 * and a different string in a diff, and a fingerprint comparison that reports a
 * change in every book on the platform for no reason is a comparison people
 * stop reading.
 *
 * THE NUMBER ITSELF is not pinned here. Whether 0.3em is the right value for
 * BEFORE YOU NEED IT is a judgement made by looking at the page; what this pins
 * is that the setting reaches the stylesheet and changes nothing else.
 */
import { describe, expect, it } from 'vitest';
import { frontMatterCss, DEFAULT_TOC_ENTRY_SPACING_EM } from '../front-matter.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V3 } from '../layout-standards/educational-nonfiction-v3.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V4 } from '../layout-standards/educational-nonfiction-v4.js';

const BASE = {
  headingFont: 'Archivo',
  bodyFont: 'EB Garamond',
  bodyPt: 12,
  displayPt: 24,
  labelPt: 9,
  captionPt: 9,
};

const entryRule = (css: string): string => /\.toc-entry \{[^}]*\}/.exec(css)?.[0] ?? '';

describe('contents-list spacing', () => {
  it('emits the ORIGINAL literal when no standard declares a policy', () => {
    // Not `0.62em`. The byte matters, for the reason in the header.
    expect(frontMatterCss(BASE)).toContain('margin: 0 0 .62em;');
  });

  it('changes exactly one line of the stylesheet when a policy is declared', () => {
    const off = frontMatterCss(BASE).split('\n');
    const on = frontMatterCss({ ...BASE, tocEntrySpacingEm: 0.3 }).split('\n');
    expect(on.length).toBe(off.length);
    const differing = off.map((l, i) => (l === on[i] ? null : i)).filter((i) => i !== null);
    expect(differing).toHaveLength(1);
  });

  it('puts the declared value into the entry rule', () => {
    expect(entryRule(frontMatterCss({ ...BASE, tocEntrySpacingEm: 0.3 }))).toContain('margin: 0 0 0.3em;');
  });

  it('an explicit default is indistinguishable from declaring nothing', () => {
    // Otherwise a standard that spells the default out would silently produce a
    // different stylesheet from one that omits it.
    expect(frontMatterCss({ ...BASE, tocEntrySpacingEm: DEFAULT_TOC_ENTRY_SPACING_EM })).toBe(
      frontMatterCss(BASE).replace('margin: 0 0 .62em;', 'margin: 0 0 0.62em;'),
    );
  });

  it('@3 declares no contents policy, so it is unaffected', () => {
    expect(EDUCATIONAL_NONFICTION_TYPESET_V3.contents).toBeUndefined();
  });

  it('@4 declares one, and it is tighter than the default', () => {
    const policy = EDUCATIONAL_NONFICTION_TYPESET_V4.contents;
    expect(policy).toBeDefined();
    expect(policy!.entrySpacingEm).toBeLessThan(DEFAULT_TOC_ENTRY_SPACING_EM);
    // Tighter than body prose, but not tighter than the 10pt lookup table this
    // same standard already sets. A contents page is scanned, not squinted at.
    expect(policy!.entrySpacingEm).toBeGreaterThanOrEqual(0.25);
  });
});
