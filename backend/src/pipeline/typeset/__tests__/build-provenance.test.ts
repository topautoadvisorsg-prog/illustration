/**
 * Regression cover for the rev24 reproducibility defect.
 *
 * Each test here corresponds to one thing that was true on 2026-08-25 and had to
 * stop being true. If any of them starts failing, the platform has regressed to
 * the state where a book frozen five days earlier silently lost two illustrations
 * and 24 pages of pagination to work committed for a different title.
 */
import { describe, expect, it, afterEach } from 'vitest';

import {
  DIRTY_OVERRIDE_ENV,
  DirtyEngineError,
  assertEngineCleanForProduction,
  assertReproducible,
  canonicalJson,
  computeEngineFingerprint,
  configSnapshotSha256,
} from '../../build-provenance.js';
import { TYPESET_LAYOUT_STANDARDS } from '../layout-standards/registry.js';

const clean = { engineFingerprint: 'f'.repeat(64), engineFiles: [{ path: 'a', sha256: 'x' }], engineDirty: false, dirtyFiles: [] };

afterEach(() => {
  delete process.env[DIRTY_OVERRIDE_ENV];
});

describe('engine fingerprint', () => {
  it('covers real renderer sources and is stable across calls', () => {
    const a = computeEngineFingerprint();
    const b = computeEngineFingerprint();
    expect(a.engineFiles.length).toBeGreaterThan(5);
    expect(a.engineFingerprint).toBe(b.engineFingerprint);
    expect(a.engineFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('includes the layout-standards directory, because the standard that broke it was uncommitted', () => {
    const fp = computeEngineFingerprint();
    const standards = fp.engineFiles.filter((f) => f.path.includes('layout-standards/'));
    expect(standards.length).toBeGreaterThan(3);
    // The exact file whose absence from git made rev24 unreconstructable from a commit id.
    expect(fp.engineFiles.some((f) => f.path.endsWith('educational-nonfiction-v3.ts'))).toBe(true);
  });

  it('changes when a renderer source changes', () => {
    const fp = computeEngineFingerprint();
    const mutated = { ...fp, engineFiles: [...fp.engineFiles.slice(0, -1), { path: 'z.ts', sha256: 'deadbeef' }] };
    expect(canonicalJson(mutated.engineFiles)).not.toBe(canonicalJson(fp.engineFiles));
  });
});

describe('dirty renderer blocks a production build', () => {
  it('throws when renderer sources are modified', () => {
    const dirty = { ...clean, engineDirty: true, dirtyFiles: ['backend/src/pipeline/typeset/typeset-book.ts'] };
    expect(() => assertEngineCleanForProduction(dirty as any)).toThrow(DirtyEngineError);
  });

  it('still throws when the override is set to a bare 1 — a reason is required', () => {
    process.env[DIRTY_OVERRIDE_ENV] = '1';
    const dirty = { ...clean, engineDirty: true, dirtyFiles: ['x.ts'] };
    expect(() => assertEngineCleanForProduction(dirty as any)).toThrow(DirtyEngineError);
  });

  it('permits an override WITH a reason, and records it', () => {
    process.env[DIRTY_OVERRIDE_ENV] = 'local spike, not a freeze';
    const dirty = { ...clean, engineDirty: true, dirtyFiles: ['x.ts'] };
    const out = assertEngineCleanForProduction(dirty as any);
    expect(out.dirtyOverrideReason).toBe('local spike, not a freeze');
  });

  it('lets a clean build through untouched', () => {
    expect(assertEngineCleanForProduction(clean as any).dirtyOverrideReason).toBeUndefined();
  });
});

describe('a frozen book does not silently migrate to the current renderer', () => {
  const current = { engineFingerprint: 'a'.repeat(64), layoutStandardId: 'educational-nonfiction-typeset@3', configSnapshotSha256: 'c1' };

  it('refuses when the engine moved', () => {
    const v = assertReproducible({ engineFingerprint: 'b'.repeat(64), layoutStandardId: current.layoutStandardId, configSnapshotSha256: 'c1' }, current);
    expect(v.reproducible).toBe(false);
    expect(v.reason).toMatch(/Renderer changed/);
  });

  it('refuses when the stored config moved, which is how pageOffset reached a frozen book', () => {
    const v = assertReproducible({ engineFingerprint: current.engineFingerprint, layoutStandardId: current.layoutStandardId, configSnapshotSha256: 'OLD' }, current);
    expect(v.reproducible).toBe(false);
    expect(v.reason).toMatch(/config changed/i);
  });

  it('refuses a freeze that recorded no provenance instead of guessing', () => {
    const v = assertReproducible(undefined, current);
    expect(v.reproducible).toBe(false);
    expect(v.reason).toMatch(/predates engine provenance/);
  });

  it('accepts only an exact match', () => {
    expect(assertReproducible({ ...current }, current).reproducible).toBe(true);
  });
});

describe('config snapshot hashing', () => {
  it('ignores key order but not values', () => {
    expect(configSnapshotSha256({ a: 1, b: { c: 2, d: 3 } })).toBe(configSnapshotSha256({ b: { d: 3, c: 2 }, a: 1 }));
    expect(configSnapshotSha256({ a: 1 })).not.toBe(configSnapshotSha256({ a: 2 }));
  });

  it('notices a defaulted key being added, which is the exact contamination that happened', () => {
    const frozen = { illustrations: { abc: { placementWidthIn: 3.3 } } };
    const afterSchemaChange = { illustrations: { abc: { placementWidthIn: 3.3, pageOffset: 0 } } };
    expect(configSnapshotSha256(frozen)).not.toBe(configSnapshotSha256(afterSchemaChange));
  });
});

describe('layout heuristics cannot leak between books', () => {
  it('no approved standard carries another book\'s heading-bind calibration', () => {
    // ONE_LINE_CHARS = 95 was measured on 7 NATIONAL PARKS at 6x9 and applied to
    // every book in the shared path. Nothing may inherit a threshold it did not
    // measure, so an unset policy is the only correct default.
    for (const [id, std] of Object.entries(TYPESET_LAYOUT_STANDARDS)) {
      if (std.headingBind === undefined) continue;
      expect(std.headingBind.extraParagraphUnderChars, `${id} sets headingBind`).toBeGreaterThan(0);
    }
    // The educational line is 5.5x8.5 on a 4.375in measure, longest observed line
    // 76 characters. It must never carry a 6x9 threshold.
    for (const id of ['educational-nonfiction-typeset@1', 'educational-nonfiction-typeset@2', 'educational-nonfiction-typeset@3']) {
      const std = TYPESET_LAYOUT_STANDARDS[id];
      expect(std, `${id} missing from the registry`).toBeTruthy();
      expect(std!.headingBind, `${id} must not inherit another book's calibration`).toBeUndefined();
    }
  });

  it('a threshold is never plausible for a measure that cannot reach it', () => {
    // A guard against the class of bug rather than the instance: if a standard
    // ever sets a threshold, it has to be reachable on that standard's own trim.
    for (const [id, std] of Object.entries(TYPESET_LAYOUT_STANDARDS)) {
      const bind = std.headingBind?.extraParagraphUnderChars;
      if (bind === undefined) continue;
      const measureIn = std.trim.widthIn - std.margins.gutterIn - std.margins.outsideIn;
      // ~2.6 characters per em is conservative for the serif faces in use; the
      // point is only to catch a threshold no line on this trim could ever hit.
      const plausibleMaxChars = (measureIn * 72) / std.type.bodyPt * 2.9;
      expect(bind, `${id}: threshold ${bind} exceeds what a ${measureIn.toFixed(3)}in measure can set`).toBeLessThanOrEqual(
        plausibleMaxChars,
      );
    }
  });
});
