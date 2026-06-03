import { describe, expect, it } from 'vitest';
import {
  GenerationBlockedError,
  assertLayoutApprovedForImageSpend,
  assertGeneratable,
  nextImageVersion,
} from '../pipeline/stage-3-generation/generate-image.js';

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
