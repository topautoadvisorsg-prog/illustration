import { describe, expect, it } from 'vitest';
import {
  MIN_PRINT_DPI,
  UpscaleBlockedError,
  assertUpscalable,
  computeDpiGate,
} from '../pipeline/stage-5-upscale/upscale-image.js';

describe('computeDpiGate', () => {
  it('passes when both axes clear 300 DPI for an 8.5x11 page', () => {
    // gpt-image-2 1024x1536 upscaled 4x -> 4096x6144
    const r = computeDpiGate(4096, 6144, 8.5, 11);
    expect(r.dpiW).toBe(Math.floor(4096 / 8.5)); // 481
    expect(r.dpiH).toBe(Math.floor(6144 / 11)); // 558
    expect(r.passed).toBe(true);
    expect(r.minDpi).toBe(MIN_PRINT_DPI);
  });

  it('fails when an axis is below the DPI floor', () => {
    const r = computeDpiGate(1024, 1536, 8.5, 11); // ~120 / ~139 dpi
    expect(r.passed).toBe(false);
  });

  it('fails safe (0 dpi) on a zero print dimension', () => {
    expect(computeDpiGate(4096, 6144, 0, 11).passed).toBe(false);
  });

  it('passes a smaller 6x9 trim with the same pixels', () => {
    const r = computeDpiGate(4096, 6144, 6, 9);
    expect(r.passed).toBe(true);
  });
});

describe('assertUpscalable', () => {
  const approvedImage = { status: 'APPROVED' };

  it('allows an approved page with an approved active image', () => {
    expect(() => assertUpscalable('APPROVED', approvedImage)).not.toThrow();
  });

  it('blocks when the page is not approved', () => {
    try {
      assertUpscalable('REVIEW', approvedImage);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as UpscaleBlockedError).code).toBe('not_approved');
    }
  });

  it('blocks when there is no active image', () => {
    try {
      assertUpscalable('APPROVED', undefined);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as UpscaleBlockedError).code).toBe('no_active_image');
    }
  });

  it('blocks when the active image is not approved', () => {
    try {
      assertUpscalable('APPROVED', { status: 'GENERATED' });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as UpscaleBlockedError).code).toBe('image_not_approved');
    }
  });
});
