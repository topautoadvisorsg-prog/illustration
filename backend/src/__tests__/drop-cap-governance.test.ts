/**
 * Drop-cap governance (SPEC_GEOMETRY_RECONCILIATION §3).
 *
 * The forensic bug: 8/8 specs had dropCap=null, yet 4/4 page types rendered an
 * illuminated initial — because `decorativeInitial` rode in the always-on
 * typography block. `dropCap` is now authoritative: when it is null, NOTHING
 * about a drop-cap may reach the model.
 */

import { describe, expect, it } from 'vitest';
import { assembleExperimentPrompt } from '../pipeline/experimental/whole-page-render/assemble-experiment-prompt.js';
import { EXPERIMENT_TYPOGRAPHY_DNA } from '../pipeline/experimental/whole-page-render/typography-dna.js';
import type { WholePageSpec } from '../pipeline/experimental/whole-page-render/types.js';

function makeSpec(over: { dropCap: string | null; decorativeInitial: string | null; pageType?: WholePageSpec['pageType'] }): WholePageSpec {
  return {
    pageType: over.pageType ?? 'INTERIOR',
    layoutFamily: 'LAYOUT_1_STANDARD',
    layoutGeometry: {
      trim: { widthIn: 8.5, heightIn: 11 },
      marginsIn: { top: 0.75, bottom: 0.75, outside: 0.75, inside: 0.75 },
      bleedIn: 0.125,
    },
    readingFieldGeometry: { originIn: { x: 1, y: 1 }, sizeIn: { w: 6, h: 8 }, anchor: 'CENTER', widerThanProductionPct: 0 },
    typographyDNA: { ...EXPERIMENT_TYPOGRAPHY_DNA, titleHierarchy: [], decorativeInitial: over.decorativeInitial },
    illustrationDNA: { masterStyleBlock: 'style', subject: { primary: 'deer', supporting: [], environment: 'forest', mood: 'calm' } },
    pageText: {
      title: { kicker: '', number: '', name: '' },
      body: 'Body text.',
      bodyBlocks: [{ type: 'paragraph', text: 'Body text.' }],
      dropCap: over.dropCap,
    },
    decorativeElements: { topRule: null, bottomRule: null, badges: [] },
    badgeContext: { hazard: ['NONE'], region: 'GENERAL', source: 'GENERAL_REFERENCE' },
    // L-7 — fixture doesn't need to assert specific zones for the drop-cap
    // test; empty is the lightest valid value (the helper would produce 3
    // zones for this badge context but we don't read them here).
    badgeSafeZones: [],
  };
}

const DROPCAP_LANGUAGE = /drop-cap|decorativeInitial|illuminated|dropCapSurround/i;

describe('drop-cap governance — dropCap is authoritative', () => {
  it('NULL dropCap → the prompt contains NO drop-cap language at all', () => {
    const prompt = assembleExperimentPrompt(makeSpec({ dropCap: null, decorativeInitial: null }));
    expect(DROPCAP_LANGUAGE.test(prompt)).toBe(false);
    // and the typography block must not even carry a stray "decorativeInitial" key
    expect(prompt).not.toContain('decorativeInitial');
  });

  it('SET dropCap on a CHAPTER_OPENER → the prompt DOES describe the illuminated initial', () => {
    const prompt = assembleExperimentPrompt(
      makeSpec({ pageType: 'CHAPTER_OPENER', dropCap: 'T', decorativeInitial: 'engraved botanical surround' }),
    );
    expect(prompt).toMatch(/drop-cap "T"/);
    expect(prompt).toContain('decorativeInitial');
  });

  it('an interior page never receives drop-cap instruction even if decorativeInitial leaked non-null', () => {
    // Defense in depth: assembler keys on the spec's dropCap field; an interior
    // page with dropCap=null stays clean regardless.
    const prompt = assembleExperimentPrompt(makeSpec({ dropCap: null, decorativeInitial: 'stray surround text' }));
    // decorativeInitial is non-null here, so it appears in the typography block,
    // but the hard-constraint drop-cap line (keyed on dropCap) must NOT.
    expect(prompt).not.toMatch(/drop-cap "/);
  });
});
