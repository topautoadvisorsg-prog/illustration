/**
 * Book Production Supervisor — public types.
 *
 * Contract for the unified pipeline report returned by the orchestrator. Every
 * field is structured so the UI (and any future automation) can render the same
 * data without re-deriving anything.
 *
 * The shape is intentionally flat and predictable: one report, one verdict,
 * one next-action, plus per-stage detail.
 */

import type { PaginationFitStatus } from '../../pipeline/stage-1.75-pagination/capacity.js';

export type SupervisorVerdict = 'PASS' | 'WARNING' | 'BLOCKED' | 'NOT_RUN';
export type SupervisorMode = 'no-spend' | 'with-spend';
export type SupervisorSeverity = 'INFO' | 'WARNING' | 'BLOCKER';

/** One actionable finding produced by a stage. Stable shape across all stages. */
export interface SupervisorFinding {
  severity: SupervisorSeverity;
  stage: string;
  /** Operator-facing one-line message. No dev jargon. */
  message: string;
  /** Optional page anchor when the issue is page-scoped. */
  pageKey?: string;
  /** Optional chapter anchor when the issue is chapter-scoped. */
  chapterNumber?: number;
  /** Operator-facing recommendation. Skip when the system already auto-fixed it. */
  recommendedAction?: string;
  /** When the underlying Director ledger marks this as automatically fixable. */
  fixMode?: 'AUTOMATIC' | 'MANUAL' | 'DECISION_ONLY' | 'NONE';
}

/** Record of a change the supervisor applied automatically. NEVER silent. */
export interface SupervisorAutoFix {
  stage: string;
  pageKey?: string;
  /** What was actually changed. Written so an operator can audit it in plain language. */
  description: string;
  /** Director action kind that triggered the fix. */
  kind: 'mark_intentional' | 'switch_layout' | 'apply_repeating_accent';
}

/** Per-stage report. */
export interface SupervisorStageReport {
  stageKey: string;
  label: string;
  verdict: SupervisorVerdict;
  /** One-line operator summary of the stage's outcome. */
  summary: string;
  /** Structured metrics for the UI to render. Free-form to keep this flexible. */
  metrics: Record<string, unknown>;
  findings: SupervisorFinding[];
  autoFixes: SupervisorAutoFix[];
  /** True iff this stage requires API spend to proceed. */
  spendRequired: boolean;
  durationMs: number;
}

/** What the operator should do next — the single CTA the dashboard renders. */
export interface SupervisorNextAction {
  type:
    | 'READY_TO_PROCEED'
    | 'AUTH_REQUIRED'
    | 'OPERATOR_REVIEW'
    | 'BLOCKED'
    | 'DONE';
  /** Short operator-facing label (button text). */
  label: string;
  /** Optional longer narrative for hovers / details. */
  details?: string;
  /** Deep link or API path that performs the action, when applicable. */
  url?: string;
}

/** The unified pipeline report — the one object the endpoint returns. */
export interface PipelineReport {
  projectId: string;
  ranAt: string;
  durationMs: number;
  mode: SupervisorMode;
  /** Roll-up of every stage's verdict. */
  overallVerdict: SupervisorVerdict;
  /** The stage the project is logically in right now. */
  currentStage: string;
  nextAction: SupervisorNextAction;
  stages: SupervisorStageReport[];
  /** All BLOCKER findings collected across stages, for fast operator triage. */
  blockingIssues: SupervisorFinding[];
  /** Pages the operator needs to look at by eye (taste / legal / outliers). */
  operatorReviewItems: SupervisorFinding[];
  /** Stages downstream that would require API spend. */
  spendRequiredSteps: string[];
  /** Project-level audit snapshot — operator gets the numbers at a glance. */
  snapshot: PipelineSnapshot;
}

/** A compact "at-a-glance" snapshot — answers the acceptance-test questions. */
export interface PipelineSnapshot {
  /** Resolved project trim — single source of truth. */
  trim: { widthIn: number; heightIn: number; bleedIn: number };
  canvas: { widthIn: number; heightIn: number };
  /** Page totals after pagination. */
  pageCount: number;
  /** Open/cont/compacted counts. */
  roleDistribution: { openers: number; continuations: number; compacted: number };
  /** FIT counts as the math says they are right now. */
  fitDistribution: Record<PaginationFitStatus, number>;
  /** Pages flagged as OVERFLOW after Patches A–D. */
  overflowCount: number;
  /** Pages that are intentionally outliers (compacted, etc.) — listed so the operator knows what was excluded from counts. */
  operatorReviewPages: string[];
  /** Boolean — can image generation start now? (no-spend gates all passed) */
  verificationBatchReady: boolean;
  /** Why not, if not. */
  verificationBatchReason?: string;
  /** Estimated cost of the next image-spend stage in USD. */
  estimatedImageSpendUsd: number;
  /** Configured budget cap from policy. */
  imageBudgetUsd: number;
}
