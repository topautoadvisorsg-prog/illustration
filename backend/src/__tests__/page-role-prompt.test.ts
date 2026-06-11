import { describe, expect, it } from 'vitest';
import { assembleExperimentPrompt } from '../pipeline/experimental/whole-page-render/assemble-experiment-prompt.js';
import { EXPERIMENT_TYPOGRAPHY_DNA } from '../pipeline/experimental/whole-page-render/typography-dna.js';
import type { WholePageSpec } from '../pipeline/experimental/whole-page-render/types.js';

function makeSpec(pageType: WholePageSpec['pageType']): WholePageSpec {
  return {
    pageType,
    layoutFamily: pageType === 'TITLE_PAGE' ? 'LAYOUT_D_PURE_TEXT' : 'LAYOUT_1_STANDARD',
    layoutGeometry: {
      trim: { widthIn: 7, heightIn: 10 },
      marginsIn: { top: 0.75, bottom: 0.75, outside: 0.75, inside: 0.75 },
      bleedIn: 0.125,
    },
    composition: {
      imagePlacement: 'full-page artwork canvas with restrained ornament',
      textPlacement: 'calm centered text-safe zone',
    },
    readingFieldGeometry: {
      originIn: { x: 1, y: 1 },
      sizeIn: { w: 5, h: 8 },
      anchor: 'CENTER',
      widerThanProductionPct: 0,
    },
    typographyDNA: { ...EXPERIMENT_TYPOGRAPHY_DNA, titleHierarchy: [], decorativeInitial: null },
    illustrationDNA: {
      masterStyleBlock: 'MASTER STYLE DNA',
      subject: { primary: 'New England wilderness', supporting: [], environment: 'forest', mood: 'calm' },
    },
    pageText: {
      title: { kicker: '', number: '', name: pageType },
      body: pageType === 'INTERIOR' ? 'Body text.' : '',
      bodyBlocks: pageType === 'INTERIOR' ? [{ type: 'paragraph', text: 'Body text.' }] : [],
      dropCap: null,
    },
    decorativeElements: { topRule: null, bottomRule: null, badges: [] },
    badgeContext: { hazard: ['NONE'], region: 'GENERAL', source: 'GENERAL_REFERENCE' },
    badgeSafeZones: [],
  };
}

describe('PageRole prompt text policy', () => {
  it('keeps verbatim body instructions for normal interior pages', () => {
    const prompt = assembleExperimentPrompt(makeSpec('INTERIOR'));
    expect(prompt).toContain('Body text appears VERBATIM');
    expect(prompt).toContain('PAGE BODY');
  });

  it('keeps critical typography out of title-page image generation', () => {
    const prompt = assembleExperimentPrompt(makeSpec('TITLE_PAGE'));
    expect(prompt).toContain('TEXT POLICY');
    expect(prompt).toContain('publishing engine will add title');
    expect(prompt).toContain('Do not render body copy');
    expect(prompt).not.toContain('Body text appears VERBATIM');
    expect(prompt).not.toContain('PAGE BODY');
  });

  it('keeps glossary and index ornament renders text-free', () => {
    for (const role of ['GLOSSARY_ORNAMENT', 'INDEX_ORNAMENT'] as const) {
      const prompt = assembleExperimentPrompt(makeSpec(role));
      expect(prompt).toContain('TEXT POLICY');
      expect(prompt).toContain('glossary/index entries');
      expect(prompt).toContain('Do not render body copy');
      expect(prompt).not.toContain('PAGE BODY');
    }
  });
});
