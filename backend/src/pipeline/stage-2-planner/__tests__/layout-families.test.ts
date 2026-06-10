import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type PageManifest, type ProjectConfig } from '@wildlands/shared';
import {
  FAMILY_BY_TEMPLATE,
  FAMILY_DEFAULT_TEMPLATE,
  chooseSimplifiedLayout,
  familyForTemplate,
  isLayoutA,
  isLayoutAIllustration,
  isLayoutAText,
} from '../layout-families.js';

function makeConfig(): ProjectConfig {
  return ProjectConfigSchema.parse({ volume: 1, title: 'T', authorName: 'A' });
}

function makeEntry(o: Partial<PageManifest>): PageManifest {
  return {
    pageId: 'CH01_P001',
    projectId: 'p',
    chapterNumber: 1,
    pageNumber: 1,
    entryTitle: 'Entry',
    layoutTemplate: 'LAYOUT_A_TEXT',
    imageSubject: 'subject',
    bodyMarkdown: 'body',
    warnings: [],
    ...o,
  } as PageManifest;
}

describe('FAMILY_DEFAULT_TEMPLATE — every family has a concrete default', () => {
  it('A maps to the text page (text leads, illustration follows)', () => {
    expect(FAMILY_DEFAULT_TEMPLATE.A).toBe('LAYOUT_A_TEXT');
  });
  it('B defaults to image-right (text reads left-to-right first)', () => {
    expect(FAMILY_DEFAULT_TEMPLATE.B).toBe('LAYOUT_B_IMAGE_RIGHT');
  });
  it('C defaults to top-right corner', () => {
    expect(FAMILY_DEFAULT_TEMPLATE.C).toBe('LAYOUT_C_CORNER_TOP_RIGHT');
  });
  it('D maps to pure text', () => {
    expect(FAMILY_DEFAULT_TEMPLATE.D).toBe('LAYOUT_D_PURE_TEXT');
  });
});

describe('familyForTemplate — every simplified template maps to a family', () => {
  it('classifies Layout A templates', () => {
    expect(familyForTemplate('LAYOUT_A_TEXT')).toBe('A');
    expect(familyForTemplate('LAYOUT_A_ILLUSTRATION')).toBe('A');
  });
  it('classifies Layout B variants', () => {
    expect(familyForTemplate('LAYOUT_B_IMAGE_TOP')).toBe('B');
    expect(familyForTemplate('LAYOUT_B_IMAGE_BOTTOM')).toBe('B');
    expect(familyForTemplate('LAYOUT_B_IMAGE_LEFT')).toBe('B');
    expect(familyForTemplate('LAYOUT_B_IMAGE_RIGHT')).toBe('B');
  });
  it('classifies Layout C corners', () => {
    expect(familyForTemplate('LAYOUT_C_CORNER_TOP_LEFT')).toBe('C');
    expect(familyForTemplate('LAYOUT_C_CORNER_TOP_RIGHT')).toBe('C');
    expect(familyForTemplate('LAYOUT_C_CORNER_BOTTOM_LEFT')).toBe('C');
    expect(familyForTemplate('LAYOUT_C_CORNER_BOTTOM_RIGHT')).toBe('C');
  });
  it('classifies Layout D', () => {
    expect(familyForTemplate('LAYOUT_D_PURE_TEXT')).toBe('D');
  });
  it('returns undefined for legacy templates (they have no family)', () => {
    expect(familyForTemplate('LAYOUT_1_STANDARD')).toBeUndefined();
    expect(familyForTemplate('LAYOUT_10_FULL_PAGE_PLATE')).toBeUndefined();
  });
});

describe('isLayoutA / isLayoutAText / isLayoutAIllustration', () => {
  it('classifies the two Layout A templates correctly', () => {
    expect(isLayoutA('LAYOUT_A_TEXT')).toBe(true);
    expect(isLayoutA('LAYOUT_A_ILLUSTRATION')).toBe(true);
    expect(isLayoutAText('LAYOUT_A_TEXT')).toBe(true);
    expect(isLayoutAText('LAYOUT_A_ILLUSTRATION')).toBe(false);
    expect(isLayoutAIllustration('LAYOUT_A_ILLUSTRATION')).toBe(true);
    expect(isLayoutAIllustration('LAYOUT_A_TEXT')).toBe(false);
  });
  it('returns false for Layouts B/C/D and legacy templates', () => {
    expect(isLayoutA('LAYOUT_B_IMAGE_TOP')).toBe(false);
    expect(isLayoutA('LAYOUT_C_CORNER_TOP_RIGHT')).toBe(false);
    expect(isLayoutA('LAYOUT_D_PURE_TEXT')).toBe(false);
    expect(isLayoutA('LAYOUT_1_STANDARD')).toBe(false);
  });
});

describe('chooseSimplifiedLayout — content-type routing', () => {
  const cfg = makeConfig();

  it('routes REFERENCE_PAGE to Layout D', () => {
    const r = chooseSimplifiedLayout(makeEntry({ contentType: 'REFERENCE_PAGE' }), cfg);
    expect(r.family).toBe('D');
    expect(r.template).toBe('LAYOUT_D_PURE_TEXT');
  });

  it('routes ENCYCLOPEDIA_ENTRY to Layout C (text + corner support)', () => {
    const r = chooseSimplifiedLayout(makeEntry({ contentType: 'ENCYCLOPEDIA_ENTRY' }), cfg);
    expect(r.family).toBe('C');
  });

  it('routes BOTANICAL_PLATE and CHAPTER_OPENER to Layout A (showcase pair)', () => {
    expect(chooseSimplifiedLayout(makeEntry({ contentType: 'BOTANICAL_PLATE' }), cfg).family).toBe('A');
    expect(chooseSimplifiedLayout(makeEntry({ contentType: 'CHAPTER_OPENER' }), cfg).family).toBe('A');
  });

  it('routes WARNING_PAGE to Layout B image-top (warning unmissable)', () => {
    const r = chooseSimplifiedLayout(makeEntry({ contentType: 'WARNING_PAGE' }), cfg);
    expect(r.family).toBe('B');
    expect(r.template).toBe('LAYOUT_B_IMAGE_TOP');
  });

  it('defaults SPECIES_PROFILE / ANIMAL_PROFILE to Layout B', () => {
    expect(chooseSimplifiedLayout(makeEntry({ contentType: 'SPECIES_PROFILE' }), cfg).family).toBe('B');
    expect(chooseSimplifiedLayout(makeEntry({ contentType: 'ANIMAL_PROFILE' }), cfg).family).toBe('B');
  });

  it('forces Layout B image-top for danger pages, overriding content type', () => {
    const r = chooseSimplifiedLayout(
      makeEntry({ contentType: 'SPECIES_PROFILE', category: 'TOXIC' }),
      cfg,
    );
    expect(r.family).toBe('B');
    expect(r.template).toBe('LAYOUT_B_IMAGE_TOP');
    expect(r.reason).toMatch(/danger/i);
  });
});

describe('FAMILY_BY_TEMPLATE is internally consistent with FAMILY_DEFAULT_TEMPLATE', () => {
  it('every default template maps back to its own family', () => {
    for (const family of ['A', 'B', 'C', 'D'] as const) {
      const tpl = FAMILY_DEFAULT_TEMPLATE[family];
      expect(FAMILY_BY_TEMPLATE[tpl]).toBe(family);
    }
  });
});

// ─── P2a — 25 % accent selection (word-count routing + corner rotation) ────

describe('chooseSimplifiedLayout — P2a length routing', () => {
  const config = makeConfig();
  const longBody = Array.from({ length: 450 }, (_, i) => `word${i}`).join(' ');
  const shortBody = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');

  it('long default-content entry routes to a 25 % accent corner', () => {
    const pick = chooseSimplifiedLayout(makeEntry({ bodyMarkdown: longBody }), config);
    expect(pick.family).toBe('C');
    expect(pick.template).toMatch(/^LAYOUT_C_CORNER_/);
    expect(pick.reason).toContain('accent');
  });

  it('short default-content entry keeps the 50/50 layout', () => {
    const pick = chooseSimplifiedLayout(makeEntry({ bodyMarkdown: shortBody }), config);
    expect(pick.family).toBe('B');
    expect(pick.template).toBe('LAYOUT_B_IMAGE_RIGHT');
  });

  it('corner rotation is deterministic per chapter+page and varies across pages', () => {
    const a1 = chooseSimplifiedLayout(makeEntry({ bodyMarkdown: longBody, chapterNumber: 2, pageNumber: 3 }), config);
    const a2 = chooseSimplifiedLayout(makeEntry({ bodyMarkdown: longBody, chapterNumber: 2, pageNumber: 3 }), config);
    expect(a1.template).toBe(a2.template); // stable across re-pagination
    const corners = new Set(
      [1, 2, 3, 4].map(
        (p) => chooseSimplifiedLayout(makeEntry({ bodyMarkdown: longBody, pageNumber: p }), config).template,
      ),
    );
    expect(corners.size).toBeGreaterThan(1); // rotation actually rotates
  });

  it('danger override beats length routing', () => {
    const pick = chooseSimplifiedLayout(
      makeEntry({ bodyMarkdown: longBody, contentType: 'WARNING_PAGE' }),
      config,
    );
    expect(pick.template).toBe('LAYOUT_B_IMAGE_TOP');
  });

  it('encyclopedia entries route to accent corners with rotation', () => {
    const pick = chooseSimplifiedLayout(
      makeEntry({ bodyMarkdown: shortBody, contentType: 'ENCYCLOPEDIA_ENTRY' }),
      config,
    );
    expect(pick.family).toBe('C');
    expect(pick.template).toMatch(/^LAYOUT_C_CORNER_/);
  });
});
