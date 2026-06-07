/**
 * Stage 1.75 — last-page-underfill recovery.
 *
 * If the last printed page has too little text, look at the layout sequence
 * for a low-priority, discretionary layout (small-Reading-Block opener like
 * LAYOUT_3_ILLUSTRATION_DOMINANT) we could drop. If dropping one helps, re-run
 * the flow from that point. If no discretionary layout is available, accept
 * the orphan and emit a warning.
 *
 * See SPEC_PAGINATION_V1.md §5.3.
 *
 * v1 is intentionally simple: a single rebalance attempt at the END of the
 * book. Mid-book whitespace recovery is out of scope.
 */

import type { LayoutTemplateId } from '@wildlands/shared';
import type { PaginatedPage } from './flow-engine.js';

/**
 * Layouts whose openers have small Reading Blocks and which the rebalancer
 * may drop. The list is intentionally conservative — anything semantic
 * (warning, diagnostic, plate, opener) is NEVER eligible for removal.
 */
const DISCRETIONARY_LAYOUTS: ReadonlySet<LayoutTemplateId> = new Set([
  'LAYOUT_3_ILLUSTRATION_DOMINANT',
  'LAYOUT_8_MARGIN_ILLUSTRATION',
]);

/** A page is "underfilled" when its fit_status is UNDERFILL. We use the
 *  engine's classification rather than re-checking thresholds here so the
 *  definition stays in one place. */
function isUnderfilled(page: PaginatedPage): boolean {
  return page.fitStatus === 'UNDERFILL';
}

export interface TailRebalanceInput {
  pages: PaginatedPage[];
}

export interface TailRebalanceResult {
  pages: PaginatedPage[];
  /** Engine warnings emitted by the rebalance step (e.g. orphan accepted). */
  warnings: string[];
  /** True iff the rebalance modified the page list. The caller knows whether
   *  to re-run the flow engine on the upstream slice. v1 does not auto-reflow
   *  — it just identifies the drop candidate and warns; full reflow lives in
   *  the orchestrator. */
  shouldReflowFromIndex: number | null;
  /** Which slot index in the layout sequence would be dropped, if any. */
  dropSlotForEntryKey: string | null;
}

/**
 * Inspect the last page and report whether the orchestrator should re-flow
 * with a discretionary layout removed. The actual reflow is the orchestrator's
 * job (this module stays pure — no flow-engine import to avoid a cycle).
 */
export function tailRebalance(input: TailRebalanceInput): TailRebalanceResult {
  const { pages } = input;
  if (pages.length === 0) {
    return { pages, warnings: [], shouldReflowFromIndex: null, dropSlotForEntryKey: null };
  }
  const last = pages[pages.length - 1];
  if (!last || !isUnderfilled(last)) {
    return { pages, warnings: [], shouldReflowFromIndex: null, dropSlotForEntryKey: null };
  }

  // Search backward from the last page for a discretionary opener we could drop.
  // We only drop an OPENER (continuations are not in the sequence). We never
  // drop the page the operator is reading (the tail itself).
  for (let i = pages.length - 2; i >= 0; i--) {
    const candidate = pages[i];
    if (!candidate) continue;
    if (candidate.pageRole !== 'opener') continue;
    if (!DISCRETIONARY_LAYOUTS.has(candidate.layoutTemplate)) continue;
    return {
      pages,
      warnings: [`tail_rebalance_candidate:${candidate.entryKey}:${candidate.layoutTemplate}`],
      shouldReflowFromIndex: i,
      dropSlotForEntryKey: candidate.entryKey,
    };
  }

  // No discretionary layout available — accept the orphan, surface a warning.
  return {
    pages,
    warnings: ['orphan_tail_accepted'],
    shouldReflowFromIndex: null,
    dropSlotForEntryKey: null,
  };
}
