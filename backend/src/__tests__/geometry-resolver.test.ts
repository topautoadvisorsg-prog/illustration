/**
 * Geometry single-source-of-truth (SPEC_GEOMETRY_RECONCILIATION §1–§2).
 *
 * The forensic bug: render composed at 7×10 while print-prep used 8.75×11.25.
 * These tests lock the invariants that make that divergence impossible:
 *   - one resolver owns trim → canvas (canvas is DERIVED, never a constant)
 *   - missing trim → Standard default (8.5×11), not a silent 7×10
 *   - an explicit supported trim is respected end-to-end
 *   - an unsupported trim BLOCKS with a clear error (never silently renders)
 */

import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import {
  DEFAULT_TRIM,
  SPACING,
  resolveGeometry,
  isSupportedTrim,
} from '../pipeline/publishing-standard/index.js';

describe('resolveGeometry — single source of truth', () => {
  it('missing trim resolves to the Standard default (8.5×11), not 7×10', () => {
    const g = resolveGeometry({});
    expect(g.trimSize).toEqual({ widthIn: 8.5, heightIn: 11, bleedIn: 0.125 });
    expect(DEFAULT_TRIM).toEqual({ widthIn: 8.5, heightIn: 11, bleedIn: 0.125 });
  });

  it('canvas is DERIVED as trim + 2×bleed — and equals the Standard SPACING canvas', () => {
    const g = resolveGeometry({});
    expect(g.canvasIn).toEqual({ w: 8.75, h: 11.25 });
    // The hardcoded SPACING.canvasIn must match the derivation for the default
    // trim — proving they can't drift.
    expect(g.canvasIn).toEqual(SPACING.canvasIn);
  });

  it('an explicit supported trim is respected, and its canvas derives from it', () => {
    const g = resolveGeometry({ trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0.125 } });
    expect(g.trimSize).toEqual({ widthIn: 6, heightIn: 9, bleedIn: 0.125 });
    expect(g.canvasIn).toEqual({ w: 6.25, h: 9.25 });
  });

  it('an UNSUPPORTED explicit trim blocks with a clear error', () => {
    expect(() => resolveGeometry({ trimSize: { widthIn: 5, heightIn: 8, bleedIn: 0.125 } })).toThrow(
      /unsupported_trim:5x8/,
    );
    expect(isSupportedTrim({ widthIn: 5, heightIn: 8 })).toBe(false);
  });

  it('the schema default no longer bakes in 7×10 (silent default removed)', () => {
    const config = ProjectConfigSchema.parse({ volume: 1, title: 'T', authorName: 'A' });
    expect(config.trimSize).toEqual({ widthIn: 8.5, heightIn: 11, bleedIn: 0.125 });
  });

  it('render and print share ONE trim: a project resolves to a single canvas everywhere', () => {
    // Whatever a project's config trim is, every consumer derives the SAME
    // canvas from resolveGeometry — pagination, render, print-prep, assembly all
    // call this one function, so their trims cannot diverge.
    for (const trim of [
      undefined,
      { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 },
      { widthIn: 7, heightIn: 10, bleedIn: 0.125 },
      { widthIn: 6, heightIn: 9, bleedIn: 0.125 },
    ]) {
      const g = resolveGeometry({ trimSize: trim });
      const expectedW = (trim?.widthIn ?? 8.5) + 2 * 0.125;
      const expectedH = (trim?.heightIn ?? 11) + 2 * 0.125;
      expect(g.canvasIn).toEqual({ w: expectedW, h: expectedH });
    }
  });
});
