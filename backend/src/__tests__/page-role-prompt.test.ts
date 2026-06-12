import { describe, expect, it } from 'vitest';
import { assemblePagePrompt } from '../pipeline/whole-page-render/assemble-page-prompt.js';
import { PAGE_TYPOGRAPHY_DNA } from '../pipeline/whole-page-render/typography-dna.js';
import type { WholePageSpec } from '../pipeline/whole-page-render/types.js';

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
    typographyDNA: { ...PAGE_TYPOGRAPHY_DNA, titleHierarchy: [], decorativeInitial: null },
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
    const prompt = assemblePagePrompt(makeSpec('INTERIOR'));
    expect(prompt).toContain('do not add, remove, translate, summarize, or reorder');
    expect(prompt).toContain('PAGE BODY');
  });

  it('bakes the title block INTO the title-page image (all-AI model)', () => {
    const spec = makeSpec('TITLE_PAGE');
    spec.typographyDNA.titleHierarchy = ['THE WILDLANDS FIELD GUIDE', 'New England Volume', 'J. R. Munoz'];
    const prompt = assemblePagePrompt(spec);
    expect(prompt).toContain('TITLE-PAGE typography');
    expect(prompt).toContain('THE WILDLANDS FIELD GUIDE');
    expect(prompt).toContain('J. R. Munoz');
    // No engine-typeset path remains.
    expect(prompt).not.toContain('TEXT POLICY');
    expect(prompt).not.toContain('publishing engine will add title');
  });

  it('renders glossary and index entries — the AI bakes their text', () => {
    for (const role of ['GLOSSARY_ORNAMENT', 'INDEX_ORNAMENT'] as const) {
      const spec = makeSpec(role);
      spec.pageText.body = 'coyote, 12';
      spec.pageText.bodyBlocks = [{ type: 'paragraph', text: 'coyote, 12' }];
      const prompt = assemblePagePrompt(spec);
      expect(prompt).toContain('PAGE BODY');
      expect(prompt).toContain('do not add, remove, translate, summarize, or reorder');
      expect(prompt).not.toContain('TEXT POLICY');
    }
  });
});
