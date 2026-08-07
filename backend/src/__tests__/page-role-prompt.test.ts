import { describe, expect, it } from 'vitest';
import { assemblePagePrompt } from '../pipeline/whole-page-render/assemble-page-prompt.js';
import { chapterDisplayTitle } from '../pipeline/whole-page-render/build-page-spec.js';
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
  it('chapter openers print only the authored title, never the redundant chapter label or number', () => {
    expect(chapterDisplayTitle('CHAPTER 2: ANIMALS')).toBe('ANIMALS');
    expect(chapterDisplayTitle('Chapter 5 — Fungi & Mushrooms')).toBe('FUNGI & MUSHROOMS');

    const spec = makeSpec('CHAPTER_OPENER');
    spec.pageText.title = { kicker: '', number: '', name: 'ANIMALS' };
    spec.typographyDNA.titleHierarchy = ['ANIMALS'];
    const prompt = assemblePagePrompt(spec);
    expect(prompt).toContain('Chapter title reads EXACTLY "ANIMALS"');
    expect(prompt).toContain('Do NOT add the word "CHAPTER"');
    expect(prompt).toContain('exactly two balanced centered lines');
    expect(prompt).not.toContain('oversized, dominant engraved Roman numeral');
  });

  it('never leaks the chapter kicker / Roman-numeral title stack into an opener prompt', () => {
    // Regression: the shared TYPOGRAPHY.title.family string describes a three-tier
    // "CHAPTER kicker / Roman numeral / name" stack. It used to be emitted verbatim
    // as typographyDNA.titleFamily on chapter openers, directly contradicting the
    // hard constraint that forbids printing "CHAPTER" or a numeral. The model split
    // the difference and rendered BOTH, producing "CHAPTER / I / CHAPTER 1: NAME".
    const spec = makeSpec('CHAPTER_OPENER');
    spec.pageText.title = { kicker: '', number: '', name: 'ANIMALS' };
    spec.typographyDNA.titleHierarchy = ['ANIMALS'];
    const prompt = assemblePagePrompt(spec);
    expect(prompt).not.toContain('CHAPTER kicker');
    expect(prompt).not.toContain('Roman numeral as the dominant glyph');
    expect(prompt).toContain('the chapter name only');
    expect(prompt).toContain('No kicker word, no numeral');
  });

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

  it('renders the entry title in the title band for an interior opener, not inside the body', () => {
    const spec = makeSpec('INTERIOR');
    spec.pageText.title = { kicker: '', number: '', name: 'THE THREE WILDERNESS ZONES' };
    spec.pageText.body = 'Every entry in this book is tagged to one of three zones.';
    spec.pageText.bodyBlocks = [{ type: 'paragraph', text: 'Every entry in this book is tagged to one of three zones.' }];
    const prompt = assemblePagePrompt(spec);
    expect(prompt).toContain('ENTRY TITLE');
    expect(prompt).toContain('THE THREE WILDERNESS ZONES');
    expect(prompt).toContain('Do NOT repeat this title');
    expect(prompt).toContain('Every entry in this book is tagged'); // body still renders
  });

  it('renders the scientific name as an italic byline under a species opener title (R1)', () => {
    const spec = makeSpec('INTERIOR');
    spec.pageText.title = { kicker: '', number: '', name: 'BLACK BEAR', scientificName: 'Ursus americanus' };
    const prompt = assemblePagePrompt(spec);
    expect(prompt).toContain('BLACK BEAR');
    expect(prompt).toContain('Ursus americanus');
    expect(prompt).toContain('ITALIC');
    expect(prompt).toContain('scientific name');
  });

  it('adds no scientific-name byline when the opener has no binomial (concept/section opener)', () => {
    const spec = makeSpec('INTERIOR');
    spec.pageText.title = { kicker: '', number: '', name: 'THE FORAGER’S CODE' };
    const prompt = assemblePagePrompt(spec);
    expect(prompt).toContain('ENTRY TITLE');
    expect(prompt).not.toContain('scientific name');
  });

  it('adds no ENTRY TITLE instruction when an interior page has no title (e.g. continuation-style)', () => {
    const spec = makeSpec('INTERIOR');
    spec.pageText.title = { kicker: '', number: '', name: '' };
    expect(assemblePagePrompt(spec)).not.toContain('ENTRY TITLE');
  });

  it('a continuation page asks for a DIFFERENT study of the subject, not a reprint of the opener', () => {
    const prompt = assemblePagePrompt(makeSpec('CONTINUATION'));
    expect(prompt).toContain('CONTINUATION STUDY');
    expect(prompt).toContain('Do NOT repeat');
    expect(prompt).toContain('learns something new');
  });

  it('an interior opener does NOT get the continuation-study directive', () => {
    expect(assemblePagePrompt(makeSpec('INTERIOR'))).not.toContain('CONTINUATION STUDY');
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
