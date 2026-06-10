/**
 * Book Production Supervisor — the orchestrator.
 *
 * Runs each stage of the no-spend half of the pipeline, reads each stage's
 * audit, checks policy thresholds, applies safe auto-fixes, and returns
 * ONE unified PipelineReport.
 *
 * Hard rules (enforced in code, not policy):
 *   - NEVER calls OpenAI / Replicate. No image spend, no upscale.
 *   - NEVER mutates state outside of Director auto-fixes the policy allows.
 *   - NEVER hides a problem — every BLOCKER bubbles up into the report.
 *   - Always returns enough to answer "what should the operator do next?"
 *
 * Stages walked (no-spend mode):
 *   1. ingest          — manuscript present?
 *   2. manifests       — Stage 1.5 done?
 *   3. pagination      — math passes (Patches A–D)?
 *   4. text-fit        — readyForImageSpend?
 *   5. page-quality    — zero BLOCKERS?
 *   6. director        — proposed actions; auto-apply allowed kinds; report rest
 *   7. budget-preflight — estimated spend ≤ policy.imageGen.maxBudgetUsd?
 *   8. verification-ready — final yes/no on "image gen can begin"
 *
 * The endpoint always returns 200 with the report — operator failures are
 * data, not HTTP errors.
 */

import { resolveGeometry } from '../../pipeline/publishing-standard/index.js';
import { ProjectConfigSchema, type ProjectConfig } from '@wildlands/shared';
import { getProject } from '../../db/repositories/projects.repo.js';
import { listManifests } from '../../db/repositories/manifests.repo.js';
import { getPaginationReport, type PaginationReport } from '../../db/repositories/pagination.repo.js';
import { listPaginatedPagesForProject } from '../../db/repositories/pagination.repo.js';
import { previewProjectTextFit } from '../../pipeline/stage-6-layout/text-fit-preview.js';
import { reviewProjectPageQuality } from '../page-quality/page-quality-review.js';
import { buildPublishingDirectorDecisionLedger } from '../publishing-director/decision-ledger.js';
import { estimateCost } from '../cost/estimate.js';
import { applyDirectorAutoFixes } from './director-auto-apply.js';
import { resolvePolicy, type SupervisorPolicy, type SupervisorPolicyOverride } from './policy.js';
import type {
  PipelineReport,
  PipelineSnapshot,
  SupervisorAutoFix,
  SupervisorFinding,
  SupervisorMode,
  SupervisorNextAction,
  SupervisorStageReport,
  SupervisorVerdict,
} from './types.js';

export interface RunPipelineInput {
  projectId: string;
  mode: SupervisorMode;
  /** Per-run policy override. Merged into DEFAULT_SUPERVISOR_POLICY. */
  policyOverride?: SupervisorPolicyOverride;
}

/** Single entry point. Returns the report; throws only on missing project. */
export async function runPipeline(input: RunPipelineInput): Promise<PipelineReport> {
  const ranAt = new Date().toISOString();
  const t0 = Date.now();
  const policy = resolvePolicy(input.policyOverride);

  const project = await getProject(input.projectId);
  if (!project) {
    throw new Error(`project_not_found:${input.projectId}`);
  }
  const config = ProjectConfigSchema.parse(project.config);

  const stages: SupervisorStageReport[] = [];

  // 1. Ingest
  const ingest = await runIngestStage(input.projectId);
  stages.push(ingest);

  // 2. Manifests
  const manifests = await runManifestsStage(input.projectId);
  stages.push(manifests);

  // 3. Pagination
  const paginationReport = await getPaginationReport(input.projectId);
  const pagination = runPaginationStage(paginationReport, policy);
  stages.push(pagination);

  // 4. Text-fit
  const textFit = await runTextFitStage(input.projectId, policy);
  stages.push(textFit);

  // 5. Page Quality
  const pageQuality = await runPageQualityStage(input.projectId, policy);
  stages.push(pageQuality);

  // 6. Director (read + optionally auto-apply)
  const director = await runDirectorStage(input.projectId, policy);
  stages.push(director);

  // 7. Budget preflight
  const budget = runBudgetStage(paginationReport, policy);
  stages.push(budget);

  // 8. Verification-batch ready gate (composite)
  const verification = runVerificationReadyStage(stages, policy);
  stages.push(verification);

  // Roll-ups
  const blockingIssues = stages.flatMap((s) =>
    s.findings.filter((f) => f.severity === 'BLOCKER'),
  );
  const operatorReviewItems = stages.flatMap((s) =>
    s.findings.filter((f) => f.severity === 'WARNING' || f.severity === 'INFO'),
  );
  // Compacted-page outliers surface separately so the operator sees them by name.
  const operatorReviewPages = await collectOperatorReviewPages(input.projectId);

  const overallVerdict = rollUp(stages);
  const currentStage = pickCurrentStage(stages);
  const verificationReady = verification.verdict === 'PASS';
  const verificationReason =
    verification.verdict === 'PASS' ? undefined : verification.summary;

  const snapshot: PipelineSnapshot = {
    trim: {
      widthIn: config.trimSize.widthIn,
      heightIn: config.trimSize.heightIn,
      bleedIn: config.trimSize.bleedIn,
    },
    canvas: {
      widthIn: resolveGeometry(config).canvasIn.w,
      heightIn: resolveGeometry(config).canvasIn.h,
    },
    pageCount: paginationReport.totalPages,
    roleDistribution: {
      openers: paginationReport.openers,
      continuations: paginationReport.continuations,
      compacted: paginationReport.compacted,
    },
    fitDistribution: paginationReport.fitDistribution,
    overflowCount: paginationReport.fitDistribution.OVERFLOW,
    operatorReviewPages,
    verificationBatchReady: verificationReady,
    verificationBatchReason: verificationReason,
    estimatedImageSpendUsd: estimateCost(paginationReport.totalPages).estimatedCostUsd,
    imageBudgetUsd: policy.imageGen.maxBudgetUsd,
  };

  const nextAction = pickNextAction({
    mode: input.mode,
    overallVerdict,
    verification,
    budget,
    blockingIssues,
    snapshot,
  });

  const durationMs = Date.now() - t0;
  return {
    projectId: input.projectId,
    ranAt,
    durationMs,
    mode: input.mode,
    overallVerdict,
    currentStage,
    nextAction,
    stages,
    blockingIssues,
    operatorReviewItems,
    spendRequiredSteps: input.mode === 'no-spend' && verificationReady ? ['image-gen'] : [],
    snapshot,
  };
}

// ── Stage runners ──────────────────────────────────────────────────────────

async function runIngestStage(projectId: string): Promise<SupervisorStageReport> {
  const t0 = Date.now();
  const manuscript = await listManifests(projectId, 'BOOK');
  const findings: SupervisorFinding[] = [];
  let verdict: SupervisorVerdict = 'PASS';
  if (manuscript.length === 0) {
    verdict = 'BLOCKED';
    findings.push({
      severity: 'BLOCKER',
      stage: 'ingest',
      message: 'No manuscript ingested yet.',
      recommendedAction: 'Upload a manuscript on the Setup tab.',
    });
  }
  return {
    stageKey: 'ingest',
    label: 'Manuscript ingest',
    verdict,
    summary:
      verdict === 'PASS' ? 'Manuscript present.' : 'No manuscript present.',
    metrics: { bookManifests: manuscript.length },
    findings,
    autoFixes: [],
    spendRequired: false,
    durationMs: Date.now() - t0,
  };
}

async function runManifestsStage(projectId: string): Promise<SupervisorStageReport> {
  const t0 = Date.now();
  const pages = await listManifests(projectId, 'PAGE');
  const chapters = await listManifests(projectId, 'CHAPTER');
  const findings: SupervisorFinding[] = [];
  let verdict: SupervisorVerdict = 'PASS';
  if (chapters.length === 0 || pages.length === 0) {
    verdict = 'BLOCKED';
    findings.push({
      severity: 'BLOCKER',
      stage: 'manifests',
      message: 'Manuscript not broken down into chapter + page manifests yet.',
      recommendedAction:
        'On the Control Center, run "Generate manifests" (Stage 1.5 / Claude).',
    });
  }
  return {
    stageKey: 'manifests',
    label: 'Breakdown (Stage 1.5)',
    verdict,
    summary:
      verdict === 'PASS'
        ? `${chapters.length} chapters / ${pages.length} entries.`
        : 'Breakdown not generated.',
    metrics: { chapters: chapters.length, entries: pages.length },
    findings,
    autoFixes: [],
    spendRequired: false,
    durationMs: Date.now() - t0,
  };
}

function runPaginationStage(
  report: PaginationReport,
  policy: SupervisorPolicy,
): SupervisorStageReport {
  const t0 = Date.now();
  const findings: SupervisorFinding[] = [];
  const fits = report.fitDistribution;

  if (report.totalPages === 0) {
    findings.push({
      severity: 'BLOCKER',
      stage: 'pagination',
      message: 'No paginated pages yet.',
      recommendedAction:
        'Run pagination (Patches A–D enforced) on the Control Center.',
    });
    return {
      stageKey: 'pagination',
      label: 'Pagination (v1)',
      verdict: 'BLOCKED',
      summary: 'Pagination has not been run.',
      metrics: { ...report },
      findings,
      autoFixes: [],
      spendRequired: false,
      durationMs: Date.now() - t0,
    };
  }

  if (fits.OVERFLOW > policy.pagination.overflowMax) {
    findings.push({
      severity: 'BLOCKER',
      stage: 'pagination',
      message: `${fits.OVERFLOW} OVERFLOW pages (max ${policy.pagination.overflowMax}). Image generation is blocked until cleared.`,
      recommendedAction:
        'Review OVERFLOW pages and either de-compact, mark intentional, or trim copy.',
    });
  } else if (fits.OVERFLOW > 0) {
    findings.push({
      severity: 'INFO',
      stage: 'pagination',
      message: `${fits.OVERFLOW} OVERFLOW pages within tolerance (max ${policy.pagination.overflowMax}).`,
      recommendedAction:
        'Confirm these are intentional outliers (compacted pages, etc.) before final assembly.',
    });
  }

  if (fits.UNDERFILL > policy.pagination.underfillMax) {
    findings.push({
      severity: 'WARNING',
      stage: 'pagination',
      message: `${fits.UNDERFILL} UNDERFILL pages (advisory threshold ${policy.pagination.underfillMax}).`,
      recommendedAction:
        'Review for very-short pages that may need merging or copy adjustment.',
    });
  }

  // Sanity invariant: the per-chapter fit counts must sum to the project totals.
  // This is the supervisor's belt-and-braces check that the report it just read
  // is internally consistent. A mismatch would mean the aggregation drifted —
  // a real bug, surface as a BLOCKER so the operator never builds on bad data.
  const perChapterFitSum = report.perChapter.reduce(
    (sum, ch) => sum + Object.values(ch.fitDistribution).reduce((a, b) => a + b, 0),
    0,
  );
  if (perChapterFitSum !== report.totalPages) {
    findings.push({
      severity: 'BLOCKER',
      stage: 'pagination',
      message: `Pagination report inconsistent: per-chapter fit sum ${perChapterFitSum} ≠ totalPages ${report.totalPages}.`,
      recommendedAction:
        'Re-run pagination. If the mismatch persists, this is a backend bug — escalate.',
    });
  }

  const verdict: SupervisorVerdict = findings.some((f) => f.severity === 'BLOCKER')
    ? 'BLOCKED'
    : findings.some((f) => f.severity === 'WARNING')
      ? 'WARNING'
      : 'PASS';

  return {
    stageKey: 'pagination',
    label: 'Pagination (v1)',
    verdict,
    // Operator-facing summary uses plain language per BOOK_PRODUCTION_UI_AUDIT
    // §6 terminology fix: TIGHT → "near capacity", OVERFLOW → "over capacity",
    // UNDERFILL → "under-filled". The raw codes stay in `metrics` for the UI to
    // map however it wants.
    summary:
      verdict === 'PASS'
        ? `${report.totalPages} pages — ${fits.FITS} fit comfortably, ${fits.TIGHT} near capacity, ${fits.OVERFLOW} over capacity, ${fits.UNDERFILL} under-filled.`
        : verdict === 'WARNING'
          ? `${report.totalPages} pages — within tolerance but flagged for review.`
          : `${report.totalPages} pages — pagination math is blocking further stages.`,
    metrics: {
      totalPages: report.totalPages,
      fitDistribution: fits,
      openers: report.openers,
      continuations: report.continuations,
      compacted: report.compacted,
      perChapter: report.perChapter,
    },
    findings,
    autoFixes: [],
    spendRequired: false,
    durationMs: Date.now() - t0,
  };
}

async function runTextFitStage(
  projectId: string,
  policy: SupervisorPolicy,
): Promise<SupervisorStageReport> {
  const t0 = Date.now();
  const findings: SupervisorFinding[] = [];
  let preview;
  try {
    preview = await previewProjectTextFit(projectId);
  } catch (e) {
    findings.push({
      severity: 'BLOCKER',
      stage: 'text-fit',
      message: `Text-fit preview failed: ${(e as Error).message}`,
      recommendedAction: 'Run Page Plan + check Breakdown / pagination state.',
    });
    return {
      stageKey: 'text-fit',
      label: 'Text-fit preview (no spend)',
      verdict: 'BLOCKED',
      summary: 'Text-fit preview could not be computed.',
      metrics: {},
      findings,
      autoFixes: [],
      spendRequired: false,
      durationMs: Date.now() - t0,
    };
  }

  // F-1 — gate unification. The old binary check (readyForImageSpend ⇔
  // overflow === 0) could NEVER pass with by-design compacted overflow
  // pages, while the pagination stage tolerated overflowMax. A gate that
  // never passes is noise — every production run needed a human bypass.
  // Both stages now share ONE tolerance: policy.pagination.overflowMax.
  const overflowCount = preview.totals.overflow;
  const withinTolerance = overflowCount <= policy.pagination.overflowMax;
  if (policy.textFit.readyForImageSpendRequired && !withinTolerance) {
    findings.push({
      severity: 'BLOCKER',
      stage: 'text-fit',
      message: `Text-fit overflow ${overflowCount} exceeds tolerance ${policy.pagination.overflowMax}.`,
      recommendedAction:
        'Resolve flagged pages on the Page Plan before image generation.',
    });
  } else if (overflowCount > 0) {
    findings.push({
      severity: 'INFO',
      stage: 'text-fit',
      message: `${overflowCount} OVERFLOW page(s) within tolerance (max ${policy.pagination.overflowMax}) — by-design compacted outliers.`,
    });
  }

  const verdict: SupervisorVerdict = findings.some((f) => f.severity === 'BLOCKER')
    ? 'BLOCKED'
    : 'PASS';
  return {
    stageKey: 'text-fit',
    label: 'Text-fit preview (no spend)',
    verdict,
    summary: withinTolerance
      ? `Text-fit ready for image spend (overflow ${overflowCount}/${policy.pagination.overflowMax} tolerated).`
      : 'Text-fit blocked image spend.',
    metrics: {
      readyForImageSpend: preview.readyForImageSpend,
      overflowCount,
      overflowTolerance: policy.pagination.overflowMax,
      pages: preview.pages?.length ?? 0,
    },
    findings,
    autoFixes: [],
    spendRequired: false,
    durationMs: Date.now() - t0,
  };
}

async function runPageQualityStage(
  projectId: string,
  policy: SupervisorPolicy,
): Promise<SupervisorStageReport> {
  const t0 = Date.now();
  const findings: SupervisorFinding[] = [];
  const review = await reviewProjectPageQuality(projectId);
  if (!review) {
    return {
      stageKey: 'page-quality',
      label: 'Page Quality Review',
      verdict: 'NOT_RUN',
      summary: 'Page Quality Review has not been run yet.',
      metrics: {},
      findings: [
        {
          severity: 'INFO',
          stage: 'page-quality',
          message: 'Page Quality Review has not been generated for this project.',
          recommendedAction:
            'On the Control Center, run "Page Quality Review" (no spend).',
        },
      ],
      autoFixes: [],
      spendRequired: false,
      durationMs: Date.now() - t0,
    };
  }

  const blockerCount = review.findings.filter((f) => f.severity === 'BLOCKER').length;
  const warningCount = review.findings.filter((f) => f.severity === 'WARNING').length;

  if (blockerCount > policy.pageQuality.blockersMax) {
    findings.push({
      severity: 'BLOCKER',
      stage: 'page-quality',
      message: `${blockerCount} quality BLOCKER finding(s). Resolve before image spend.`,
      recommendedAction:
        'Open Page Quality Review, resolve each BLOCKER (resolutions are persisted).',
    });
  }
  if (warningCount > 0 && !policy.pageQuality.warningsAdvisoryOnly) {
    findings.push({
      severity: 'WARNING',
      stage: 'page-quality',
      message: `${warningCount} quality WARNING(s).`,
      recommendedAction: 'Review and either resolve or accept.',
    });
  } else if (warningCount > 0) {
    findings.push({
      severity: 'INFO',
      stage: 'page-quality',
      message: `${warningCount} advisory WARNING(s) (not blocking).`,
    });
  }

  const verdict: SupervisorVerdict = findings.some((f) => f.severity === 'BLOCKER')
    ? 'BLOCKED'
    : findings.some((f) => f.severity === 'WARNING')
      ? 'WARNING'
      : 'PASS';

  return {
    stageKey: 'page-quality',
    label: 'Page Quality Review',
    verdict,
    summary: `${blockerCount} BLOCKER / ${warningCount} WARNING.`,
    metrics: {
      blockers: blockerCount,
      warnings: warningCount,
      info: review.findings.length - blockerCount - warningCount,
    },
    findings,
    autoFixes: [],
    spendRequired: false,
    durationMs: Date.now() - t0,
  };
}

async function runDirectorStage(
  projectId: string,
  policy: SupervisorPolicy,
): Promise<SupervisorStageReport> {
  const t0 = Date.now();
  const findings: SupervisorFinding[] = [];
  const autoFixes: SupervisorAutoFix[] = [];
  const ledger = await buildPublishingDirectorDecisionLedger(projectId);
  if (!ledger) {
    return {
      stageKey: 'publishing-director',
      label: 'Publishing Director',
      verdict: 'NOT_RUN',
      summary: 'Publishing Director ledger not available.',
      metrics: {},
      findings: [],
      autoFixes: [],
      spendRequired: false,
      durationMs: Date.now() - t0,
    };
  }

  const apply = applyDirectorAutoFixes({
    ledger,
    allowedActions: policy.director.allowedActions,
    enabled: policy.director.autoApply,
  });
  autoFixes.push(...apply.applied);

  if (apply.manualRequired.length > 0) {
    findings.push({
      severity: 'WARNING',
      stage: 'publishing-director',
      message: `${apply.manualRequired.length} page(s) need an operator decision (no automatic fix available).`,
      recommendedAction: 'Open the decision ledger and resolve each NEEDS_DECISION item.',
    });
  }
  if (apply.skippedNotAllowed.length > 0) {
    findings.push({
      severity: 'INFO',
      stage: 'publishing-director',
      message: `${apply.skippedNotAllowed.length} automatic-eligible fix(es) NOT applied (policy.director.autoApply / allowedActions).`,
      recommendedAction:
        policy.director.autoApply
          ? 'Enable the action kind in policy.director.allowedActions to auto-apply on the next run.'
          : 'Enable policy.director.autoApply to let the supervisor apply safe fixes.',
    });
  }
  if (ledger.status === 'BLOCKED') {
    findings.push({
      severity: 'BLOCKER',
      stage: 'publishing-director',
      message: 'Publishing Director ledger status: BLOCKED.',
      recommendedAction:
        'Open the decision ledger; one or more pages have unrecoverable issues.',
    });
  }

  const verdict: SupervisorVerdict = findings.some((f) => f.severity === 'BLOCKER')
    ? 'BLOCKED'
    : findings.some((f) => f.severity === 'WARNING')
      ? 'WARNING'
      : 'PASS';

  return {
    stageKey: 'publishing-director',
    label: 'Publishing Director',
    verdict,
    summary: `${ledger.totals.needsDecision} need decisions / ${ledger.totals.automaticFixesAvailable} auto-fixable / ${autoFixes.length} applied.`,
    metrics: {
      ledgerStatus: ledger.status,
      ...ledger.totals,
      autoApplied: autoFixes.length,
      skippedNotAllowed: apply.skippedNotAllowed.length,
      manualRequired: apply.manualRequired.length,
    },
    findings,
    autoFixes,
    spendRequired: false,
    durationMs: Date.now() - t0,
  };
}

function runBudgetStage(
  report: PaginationReport,
  policy: SupervisorPolicy,
): SupervisorStageReport {
  const t0 = Date.now();
  const findings: SupervisorFinding[] = [];
  const estimate = estimateCost(report.totalPages);
  if (estimate.estimatedCostUsd > policy.imageGen.maxBudgetUsd) {
    findings.push({
      severity: 'BLOCKER',
      stage: 'budget-preflight',
      message: `Estimated image spend $${estimate.estimatedCostUsd.toFixed(2)} exceeds budget cap $${policy.imageGen.maxBudgetUsd.toFixed(2)}.`,
      recommendedAction:
        'Raise policy.imageGen.maxBudgetUsd OR reduce the page count before image spend.',
    });
  }
  const verdict: SupervisorVerdict = findings.length > 0 ? 'BLOCKED' : 'PASS';
  return {
    stageKey: 'budget-preflight',
    label: 'Budget preflight',
    verdict,
    summary: `Estimated $${estimate.estimatedCostUsd.toFixed(2)} for ${estimate.imageCount} renders (cap $${policy.imageGen.maxBudgetUsd.toFixed(2)}).`,
    metrics: {
      estimateUsd: estimate.estimatedCostUsd,
      perImageUsd: estimate.avgCostPerImageUsd,
      imageCount: estimate.imageCount,
      budgetUsd: policy.imageGen.maxBudgetUsd,
    },
    findings,
    autoFixes: [],
    spendRequired: true,
    durationMs: Date.now() - t0,
  };
}

function runVerificationReadyStage(
  upstream: SupervisorStageReport[],
  _policy: SupervisorPolicy,
): SupervisorStageReport {
  const t0 = Date.now();
  // Stages that MUST be PASS before the verification batch can start. Director
  // is included because a BLOCKED ledger means the operator owes a decision
  // somewhere that even safe auto-fixes can't resolve.
  const required = [
    'ingest',
    'manifests',
    'pagination',
    'text-fit',
    'page-quality',
    'publishing-director',
    'budget-preflight',
  ];
  const failed = upstream.filter(
    (s) => required.includes(s.stageKey) && (s.verdict === 'BLOCKED' || s.verdict === 'NOT_RUN'),
  );
  const findings: SupervisorFinding[] = [];
  if (failed.length > 0) {
    findings.push({
      severity: 'BLOCKER',
      stage: 'verification-ready',
      message: `Verification batch not ready — upstream blocking stage(s): ${failed.map((s) => s.label).join(', ')}.`,
      recommendedAction:
        'Resolve the upstream blocker(s) above before requesting image generation.',
    });
  }
  const verdict: SupervisorVerdict = failed.length > 0 ? 'BLOCKED' : 'PASS';
  return {
    stageKey: 'verification-ready',
    label: 'Verification-batch readiness',
    verdict,
    summary:
      verdict === 'PASS'
        ? 'All no-spend gates passed. Ready for image generation (operator must authorize spend).'
        : `Blocked by ${failed.length} upstream stage(s).`,
    metrics: { upstreamPassed: required.length - failed.length, upstreamRequired: required.length },
    findings,
    autoFixes: [],
    spendRequired: true,
    durationMs: Date.now() - t0,
  };
}

// ── Roll-ups ───────────────────────────────────────────────────────────────

function rollUp(stages: SupervisorStageReport[]): SupervisorVerdict {
  if (stages.some((s) => s.verdict === 'BLOCKED')) return 'BLOCKED';
  if (stages.some((s) => s.verdict === 'WARNING')) return 'WARNING';
  if (stages.every((s) => s.verdict === 'PASS')) return 'PASS';
  return 'WARNING';
}

function pickCurrentStage(stages: SupervisorStageReport[]): string {
  // First non-PASS stage wins; if all pass, we're past verification-ready.
  const blocker = stages.find((s) => s.verdict === 'BLOCKED');
  if (blocker) return blocker.stageKey;
  const warner = stages.find((s) => s.verdict === 'WARNING');
  if (warner) return warner.stageKey;
  return 'verification-ready';
}

function pickNextAction(input: {
  mode: SupervisorMode;
  overallVerdict: SupervisorVerdict;
  verification: SupervisorStageReport;
  budget: SupervisorStageReport;
  blockingIssues: SupervisorFinding[];
  snapshot: PipelineSnapshot;
}): SupervisorNextAction {
  // If there are blockers, the first one is the next action.
  if (input.blockingIssues.length > 0) {
    const first = input.blockingIssues[0]!;
    return {
      type: 'BLOCKED',
      label: first.recommendedAction ?? first.message,
      details: first.message,
    };
  }

  // No blockers AND in no-spend mode AND verification-ready passed.
  if (input.mode === 'no-spend' && input.verification.verdict === 'PASS') {
    return {
      type: 'AUTH_REQUIRED',
      label:
        'Ready for verification batch — lift OpenAI billing limit, then authorize image spend.',
      details: `Estimated spend: $${input.snapshot.estimatedImageSpendUsd.toFixed(2)} for ${input.snapshot.pageCount} renders (budget cap $${input.snapshot.imageBudgetUsd.toFixed(2)}).`,
      url: '/api/projects/:id/run-pipeline?mode=with-spend',
    };
  }

  if (input.overallVerdict === 'WARNING') {
    return {
      type: 'OPERATOR_REVIEW',
      label: 'Review WARNING items before proceeding.',
    };
  }

  return {
    type: 'READY_TO_PROCEED',
    label: 'All gates green.',
  };
}

// ── Operator-review pages ──────────────────────────────────────────────────

/**
 * Pages the operator should look at by eye — currently OVERFLOW pages,
 * since by-design outliers (compacted PURE_TEXT, etc.) are reported here so
 * the operator knows what was accepted as intentional vs. needs review.
 */
async function collectOperatorReviewPages(projectId: string): Promise<string[]> {
  const pages = await listPaginatedPagesForProject(projectId);
  return pages
    .filter((p) => p.fitStatus === 'OVERFLOW')
    .map((p) => p.pageKey)
    .sort();
}
