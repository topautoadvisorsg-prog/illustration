/**
 * Book Production Supervisor — policy / thresholds.
 *
 * The single editable place where pass/fail rules live. Everything in this
 * file is "the supervisor will fail/pass when X" expressed as numbers, not
 * code. Add a new threshold here and the supervisor enforces it automatically.
 *
 * Defaults are calibrated to the live state of the Wild Lands Field Guide
 * project post Patches A–D (OVERFLOW: 1 by-design compacted page, all real
 * paginator overflow cleared).
 */

import type { DirectorActionKind } from '../publishing-director/decision-ledger.js';

export interface SupervisorPolicy {
  /** Pagination math gates. Read from getPaginationReport(). */
  pagination: {
    /** Maximum OVERFLOW pages allowed. Compacted-page outliers can be `mark_intentional`'d. */
    overflowMax: number;
    /** Per-layout TIGHT rate above which the layout is flagged for review. */
    tightRatePerLayoutMax: number;
    /** UNDERFILL page count above which a finding is generated. */
    underfillMax: number;
    /** Cross-chapter compaction tolerance. ZERO — chapters are sacred. */
    crossChapterCompactionMax: number;
  };

  /** Text-fit preview gates. Read from buildTextFitPreview(). */
  textFit: {
    /** When true, image gen is gated on the text-fit preview's readyForImageSpend flag. */
    readyForImageSpendRequired: boolean;
    /** Per-chapter OVERFLOW pages allowed before chapter is BLOCKED. */
    perChapterOverflowMax: number;
  };

  /** Page Quality Review gates. Read from reviewProjectPageQuality(). */
  pageQuality: {
    /** Maximum BLOCKER findings allowed across the book. */
    blockersMax: number;
    /** When true, WARNING-severity findings do not block (they show as operator-review only). */
    warningsAdvisoryOnly: boolean;
  };

  /** Publishing Director auto-apply behavior. */
  director: {
    /** Master switch. When false, the supervisor reads but never mutates. */
    autoApply: boolean;
    /** Director action kinds the supervisor is allowed to apply automatically.
     *  v1 starts with `mark_intentional` only — zero-mutation, just records
     *  that an outlier is accepted. `switch_layout` mutates layout choice; safe
     *  but requires explicit opt-in. */
    allowedActions: DirectorActionKind[];
  };

  /** Image-generation pre-flight (the spend gate). */
  imageGen: {
    /** Hard cap on a single pipeline run's estimated image spend. */
    maxBudgetUsd: number;
    /** When true, the chapter must already be `layout-approval`'d to spend on it. */
    requiresApprovedLayout: boolean;
    /** Per-page render retry cap. The whole_page_renders soft cap is 5; tighten here. */
    perPageMaxAttempts: number;
  };

  /** Print-prep (per render) gates. */
  printPrep: {
    /** When true, ALL 7 preflight checks must pass. */
    preflightAllChecksPass: boolean;
    /** When true, dimensions must match the resolved canvas exactly. */
    dimensionsExact: boolean;
    /** Hard DPI requirement. */
    dpiExact: number;
  };

  /** Book assembly + KDP gates. */
  assembly: {
    everyPageBookReady: boolean;
    everyPagePreflightPassed: boolean;
    pageDimensionsUniform: boolean;
    /** Even page count required by KDP. */
    requireEvenForKdp: boolean;
    minKdpPages: number;
  };
}

/**
 * Defaults calibrated to the live Wild Lands project post Patches A–D.
 * Numbers ARE thresholds — change them here, behavior changes everywhere.
 */
export const DEFAULT_SUPERVISOR_POLICY: SupervisorPolicy = {
  pagination: {
    overflowMax: 2,                   // current state: 1 (compacted-page outlier)
    tightRatePerLayoutMax: 0.45,      // current worst: PURE_TEXT at 50% (advisory only)
    underfillMax: 5,                  // current state: 3
    crossChapterCompactionMax: 0,
  },
  textFit: {
    readyForImageSpendRequired: true,
    perChapterOverflowMax: 0,
  },
  pageQuality: {
    blockersMax: 0,
    warningsAdvisoryOnly: true,
  },
  director: {
    autoApply: false,                 // explicit opt-in only
    allowedActions: ['mark_intentional'], // safest first
  },
  imageGen: {
    maxBudgetUsd: 25.0,               // ~500 renders @ $0.05 ea — book-scale ceiling
    requiresApprovedLayout: true,
    perPageMaxAttempts: 3,
  },
  printPrep: {
    preflightAllChecksPass: true,
    dimensionsExact: true,
    dpiExact: 300,
  },
  assembly: {
    everyPageBookReady: true,
    everyPagePreflightPassed: true,
    pageDimensionsUniform: true,
    requireEvenForKdp: true,
    minKdpPages: 24,
  },
};

/** Merge a partial override into the defaults. Used by the API when callers
 *  want to tweak a single threshold for one run. */
export function resolvePolicy(override?: Partial<SupervisorPolicy>): SupervisorPolicy {
  if (!override) return DEFAULT_SUPERVISOR_POLICY;
  return {
    pagination: { ...DEFAULT_SUPERVISOR_POLICY.pagination, ...(override.pagination ?? {}) },
    textFit: { ...DEFAULT_SUPERVISOR_POLICY.textFit, ...(override.textFit ?? {}) },
    pageQuality: { ...DEFAULT_SUPERVISOR_POLICY.pageQuality, ...(override.pageQuality ?? {}) },
    director: { ...DEFAULT_SUPERVISOR_POLICY.director, ...(override.director ?? {}) },
    imageGen: { ...DEFAULT_SUPERVISOR_POLICY.imageGen, ...(override.imageGen ?? {}) },
    printPrep: { ...DEFAULT_SUPERVISOR_POLICY.printPrep, ...(override.printPrep ?? {}) },
    assembly: { ...DEFAULT_SUPERVISOR_POLICY.assembly, ...(override.assembly ?? {}) },
  };
}
