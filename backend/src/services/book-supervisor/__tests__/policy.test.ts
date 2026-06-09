/**
 * policy.test.ts — supervisor policy threshold + merge tests.
 *
 * Pure. No DB, no network.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SUPERVISOR_POLICY, resolvePolicy } from '../policy.js';

describe('SupervisorPolicy defaults', () => {
  it('matches the calibrated live-state defaults', () => {
    expect(DEFAULT_SUPERVISOR_POLICY.pagination.overflowMax).toBe(2);
    expect(DEFAULT_SUPERVISOR_POLICY.pagination.crossChapterCompactionMax).toBe(0);
    expect(DEFAULT_SUPERVISOR_POLICY.textFit.readyForImageSpendRequired).toBe(true);
    expect(DEFAULT_SUPERVISOR_POLICY.pageQuality.blockersMax).toBe(0);
    expect(DEFAULT_SUPERVISOR_POLICY.director.autoApply).toBe(false);
    expect(DEFAULT_SUPERVISOR_POLICY.director.allowedActions).toEqual(['mark_intentional']);
    expect(DEFAULT_SUPERVISOR_POLICY.imageGen.maxBudgetUsd).toBeGreaterThan(0);
    expect(DEFAULT_SUPERVISOR_POLICY.printPrep.dpiExact).toBe(300);
  });

  it('resolvePolicy without override returns defaults', () => {
    expect(resolvePolicy()).toEqual(DEFAULT_SUPERVISOR_POLICY);
  });

  it('resolvePolicy merges a partial override deeply', () => {
    const merged = resolvePolicy({
      pagination: { overflowMax: 0 },
      director: { autoApply: true, allowedActions: ['mark_intentional', 'switch_layout'] },
      imageGen: { maxBudgetUsd: 1.0 },
    });
    expect(merged.pagination.overflowMax).toBe(0);
    // Untouched sibling preserved.
    expect(merged.pagination.crossChapterCompactionMax).toBe(0);
    expect(merged.pagination.underfillMax).toBe(DEFAULT_SUPERVISOR_POLICY.pagination.underfillMax);
    // Director override applied.
    expect(merged.director.autoApply).toBe(true);
    expect(merged.director.allowedActions).toEqual(['mark_intentional', 'switch_layout']);
    // Budget override applied.
    expect(merged.imageGen.maxBudgetUsd).toBe(1.0);
    // Unrelated section unchanged.
    expect(merged.printPrep).toEqual(DEFAULT_SUPERVISOR_POLICY.printPrep);
  });
});
