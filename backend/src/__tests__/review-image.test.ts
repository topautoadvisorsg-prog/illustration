import { describe, expect, it } from 'vitest';
import { ReviewBlockedError, assertApprovable, findVersion } from '../pipeline/stage-4-review/review-image.js';
import { finalizePrompt } from '../pipeline/stage-3-generation/generate-image.js';

type FakeImage = { version: number; status: string };

function imgs(): FakeImage[] {
  return [
    { version: 1, status: 'REJECTED' },
    { version: 2, status: 'GENERATED' },
  ];
}

describe('findVersion', () => {
  it('returns the matching version', () => {
    expect(findVersion(imgs() as never, 2).version).toBe(2);
  });

  it('throws version_not_found for a missing version', () => {
    try {
      findVersion(imgs() as never, 9);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ReviewBlockedError);
      expect((e as ReviewBlockedError).code).toBe('version_not_found');
    }
  });
});

describe('assertApprovable', () => {
  it('allows approving a generated version', () => {
    expect(() => assertApprovable({ status: 'GENERATED' })).not.toThrow();
  });

  it('refuses to approve a rejected version', () => {
    try {
      assertApprovable({ status: 'REJECTED' });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ReviewBlockedError).code).toBe('rejected');
    }
  });
});

describe('finalizePrompt (regeneration audit)', () => {
  it('returns the base prompt and a stable hash with no addendum', () => {
    const a = finalizePrompt('base prompt');
    const b = finalizePrompt('base prompt');
    expect(a.prompt).toBe('base prompt');
    expect(a.sha256).toBe(b.sha256);
  });

  it('appends the addendum and changes the hash', () => {
    const base = finalizePrompt('base prompt');
    const tweaked = finalizePrompt('base prompt', 'warmer lighting');
    expect(tweaked.prompt).toContain('base prompt');
    expect(tweaked.prompt).toContain('warmer lighting');
    expect(tweaked.sha256).not.toBe(base.sha256);
  });

  it('ignores a whitespace-only addendum', () => {
    expect(finalizePrompt('base prompt', '   ').prompt).toBe('base prompt');
  });
});
