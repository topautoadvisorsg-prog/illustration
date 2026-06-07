import { describe, expect, it } from 'vitest';
import {
  GenerationBlockedError,
  assertLayoutApprovedForImageSpend,
  assertGeneratable,
  assertPreviewApprovedForImageSpend,
  finalizePrompt,
  nextImageVersion,
} from '../pipeline/stage-3-generation/generate-image.js';
import { LAYOUT_IMAGE_SHAPES, appendImageShapeInstruction, imageShapeForLayout } from '../pipeline/stage-3-generation/image-shape.js';

describe('assertGeneratable (Stage 3 spend gate)', () => {
  const ok = {
    status: 'PLANNED',
    imagePrompt: 'A clean illustration of a chanterelle. Render NO text.',
    imagePromptSha256: 'abc123',
  };

  it('allows a planned page with a clean, locked prompt', () => {
    expect(() => assertGeneratable(ok)).not.toThrow();
  });

  it('blocks a page with no locked prompt', () => {
    expect(() => assertGeneratable({ ...ok, imagePrompt: null })).toThrow(GenerationBlockedError);
    try {
      assertGeneratable({ ...ok, imagePrompt: null });
    } catch (e) {
      expect((e as GenerationBlockedError).code).toBe('no_prompt');
    }
  });

  it('blocks a prompt with unresolved placeholders (would waste image spend)', () => {
    try {
      assertGeneratable({ ...ok, imagePrompt: 'Illustrate {SUBJECT} now.' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(GenerationBlockedError);
      expect((e as GenerationBlockedError).code).toBe('unresolved_placeholder');
    }
  });

  it('blocks generation once a page is already approved/exported', () => {
    try {
      assertGeneratable({ ...ok, status: 'APPROVED' });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as GenerationBlockedError).code).toBe('bad_status');
    }
  });

  it('allows regeneration from REVIEW and retry from FAILED', () => {
    expect(() => assertGeneratable({ ...ok, status: 'REVIEW' })).not.toThrow();
    expect(() => assertGeneratable({ ...ok, status: 'FAILED' })).not.toThrow();
  });
});

describe('assertPreviewApprovedForImageSpend (Pagination v1 gate)', () => {
  const page = { pageKey: 'CH01_P010', previewApproved: false, carriesSubject: true };

  it('is a no-op when the feature flag is off (preserves legacy behavior)', () => {
    expect(() => assertPreviewApprovedForImageSpend(page, false)).not.toThrow();
    expect(() => assertPreviewApprovedForImageSpend({ ...page, carriesSubject: false }, false)).not.toThrow();
  });

  it('blocks when the flag is on and previewApproved is false', () => {
    try {
      assertPreviewApprovedForImageSpend(page, true);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(GenerationBlockedError);
      expect((e as GenerationBlockedError).code).toBe('preview_not_approved');
    }
  });

  it('blocks when the flag is on and previewApproved is null/undefined', () => {
    try {
      assertPreviewApprovedForImageSpend({ ...page, previewApproved: null }, true);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as GenerationBlockedError).code).toBe('preview_not_approved');
    }
  });

  it('blocks continuation pages with carriesSubject=false (no image regardless of approval)', () => {
    try {
      assertPreviewApprovedForImageSpend(
        { ...page, previewApproved: true, carriesSubject: false },
        true,
      );
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as GenerationBlockedError).code).toBe('continuation_no_image');
    }
  });

  it('allows generation when the flag is on, page is approved, and carries subject', () => {
    expect(() =>
      assertPreviewApprovedForImageSpend(
        { ...page, previewApproved: true, carriesSubject: true },
        true,
      ),
    ).not.toThrow();
  });
});

describe('nextImageVersion', () => {
  it('starts at 1 for the first generation', () => {
    expect(nextImageVersion([])).toBe(1);
  });

  it('increments past the highest existing version', () => {
    expect(nextImageVersion([{ version: 1 }, { version: 2 }])).toBe(3);
    expect(nextImageVersion([{ version: 3 }, { version: 1 }])).toBe(4);
  });
});

describe('assertLayoutApprovedForImageSpend', () => {
  const page = {
    chapterNumber: 1,
    pageKey: 'CH01-P001',
    imagePromptSha256: 'prompt-hash',
  };
  const approvals = {
    '1': {
      status: 'APPROVED',
      pageKeys: ['CH01-P001'],
      promptSha256ByPage: { 'CH01-P001': 'prompt-hash' },
    },
  };

  it('allows image spend only when the approved chapter covers the current prompt hash', () => {
    expect(() => assertLayoutApprovedForImageSpend(page, approvals)).not.toThrow();
  });

  it('blocks image spend before chapter layout approval', () => {
    try {
      assertLayoutApprovedForImageSpend(page, {});
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(GenerationBlockedError);
      expect((e as GenerationBlockedError).code).toBe('layout_not_approved');
    }
  });

  it('blocks image spend when planning changed after approval', () => {
    try {
      assertLayoutApprovedForImageSpend({ ...page, imagePromptSha256: 'new-hash' }, approvals);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(GenerationBlockedError);
      expect((e as GenerationBlockedError).code).toBe('layout_prompt_changed');
    }
  });
});

describe('layout-aware image shape mapping', () => {
  it('defines a shape for every canonical layout template', () => {
    expect(Object.keys(LAYOUT_IMAGE_SHAPES).sort()).toEqual([
      'LAYOUT_10_FULL_PAGE_PLATE',
      'LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD',
      'LAYOUT_12_DIAGNOSTIC_DIAGRAM',
      'LAYOUT_13_FEATURE_BANNER',
      'LAYOUT_14_SIDEBAR_FEATURE',
      'LAYOUT_15_PROGRESSION_STUDY',
      'LAYOUT_16_CUTAWAY_FEATURE',
      'LAYOUT_1_STANDARD',
      'LAYOUT_2_TEXT_HEAVY',
      'LAYOUT_3_ILLUSTRATION_DOMINANT',
      'LAYOUT_4_DANGER_WARNING',
      'LAYOUT_5_CHAPTER_OPENER',
      'LAYOUT_6_BACK_MATTER',
      'LAYOUT_7_SCATTERED_VIGNETTES',
      'LAYOUT_8_MARGIN_ILLUSTRATION',
      'LAYOUT_9_DIAGNOSTIC_DIAGRAM',
    ]);
  });

  it('maps wide banner layouts to landscape generation', () => {
    const shape = imageShapeForLayout('LAYOUT_13_FEATURE_BANNER');

    expect(shape.shape).toBe('landscape');
    expect(shape.size).toBe('1536x1024');
    expect(shape.clearZoneInstruction).toContain('wide horizontal image-priority zone');
  });

  it('maps full art plates and sidebar layouts to portrait generation', () => {
    expect(imageShapeForLayout('LAYOUT_10_FULL_PAGE_PLATE').size).toBe('1024x1536');
    expect(imageShapeForLayout('LAYOUT_14_SIDEBAR_FEATURE').size).toBe('1024x1536');
  });

  it('maps scattered studies and comparison layouts to square/flexible generation', () => {
    expect(imageShapeForLayout('LAYOUT_7_SCATTERED_VIGNETTES').size).toBe('1024x1024');
    expect(imageShapeForLayout('LAYOUT_4_DANGER_WARNING').size).toBe('1024x1024');
  });

  it('appends shape and clear-zone guidance to the stored generation prompt', () => {
    const shaped = appendImageShapeInstruction('Render NO text.', imageShapeForLayout('LAYOUT_13_FEATURE_BANNER'));
    const { prompt } = finalizePrompt(shaped, 'Make the mountain line lower.');

    expect(prompt).toContain('LAYOUT FULL-PAGE ARTWORK SHAPE: landscape image');
    expect(prompt).toContain('Generate at 1536x1024');
    expect(prompt).toContain('LAYOUT TEXT-SAFE / IMAGE-PRIORITY GUIDANCE');
    expect(prompt).toContain('Make the mountain line lower.');
  });
});
