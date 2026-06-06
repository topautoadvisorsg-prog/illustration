import {
  LayoutTemplateIdSchema,
  PageManifestSchema,
  ProjectConfigSchema,
  type LayoutTemplateId,
  type ProjectConfig,
} from '@wildlands/shared';
import { listManifests, listPages } from '../../db/repositories/manifests.repo.js';
import { getProject } from '../../db/repositories/projects.repo.js';
import { planPage } from '../../pipeline/stage-2-planner/plan-pages.js';
import { buildTextFitPreview } from '../../pipeline/stage-6-layout/text-fit-preview.js';
import { reviewProjectPageQuality, type PageQualityFinding } from '../page-quality/page-quality-review.js';
import { DEFAULT_DIRECTOR_POLICY, nextHigherCapacity, type PublishingDirectorPolicy } from './policy.js';

type RiskLevel = 'NONE' | 'LOW' | 'WARNING' | 'BLOCKER';
type FixMode = 'AUTOMATIC' | 'MANUAL' | 'DECISION_ONLY' | 'NONE';

/**
 * Typed, one-click operator actions the Director proposes for a page. Folded in
 * from the standalone proposer so the ledger is the single Publishing Director
 * surface. `switch_layout` routes through the existing forced-layout plan path;
 * `mark_intentional` silences the proposal; `apply_repeating_accent` routes
 * through the repeating-shared-asset path. The Director NEVER mutates — these are
 * proposals the operator approves.
 */
export type DirectorActionKind = 'switch_layout' | 'apply_repeating_accent' | 'mark_intentional';
export interface DirectorAction {
  kind: DirectorActionKind;
  pageKey?: string;
  from?: LayoutTemplateId;
  to?: LayoutTemplateId;
  layoutTemplate?: LayoutTemplateId;
  rationale: string;
}

export interface PublishingDirectorLedgerEntry {
  pageKey: string;
  chapterNumber: number;
  entryTitle: string;
  selectedLayout: string;
  persistedLayout: string | null;
  contentType: string;
  wordCount: number;
  layoutReasonCodes: string[];
  selectedLayoutWhy: string;
  textCapacityChars: number;
  fillRatio: number;
  estimatedRenderedPages: number;
  risks: {
    continuation: RiskLevel;
    underfilled: RiskLevel;
    tightText: RiskLevel;
    repeatedLayout: RiskLevel;
  };
  currentQualityFindings: Array<{
    findingId: string;
    scope: PageQualityFinding['scope'];
    severity: PageQualityFinding['severity'];
    category: PageQualityFinding['category'];
    problem: string;
    whyItMatters: string;
    recommendedFix: string;
    expectedResult: string;
    resolved: boolean;
    resolutionStatus?: string;
  }>;
  recommendedFix: string;
  fixMode: FixMode;
  automaticFixAvailable: boolean;
  /** Other layouts the planner considered for this page + why each was skipped. */
  alternativesConsidered: Array<{ template: string; skippedBecause: string }>;
  /** Typed one-click proposals (switch layout / accent / mark intentional). */
  proposedActions: DirectorAction[];
  operatorDecision: 'READY' | 'NEEDS_DECISION' | 'RESOLVED';
}

export interface PublishingDirectorDecisionLedger {
  status: 'READY' | 'NEEDS_REVIEW' | 'BLOCKED';
  generatedAt: string;
  totals: {
    pages: number;
    needsDecision: number;
    automaticFixesAvailable: number;
    continuationRisks: number;
    underfilledRisks: number;
    tightTextRisks: number;
    repeatedLayoutRisks: number;
    actionableProposals: number;
  };
  pages: PublishingDirectorLedgerEntry[];
}

function parseConfig(config: unknown): ProjectConfig {
  return ProjectConfigSchema.parse(config);
}

function persistedLayoutOverrides(pageRows: Awaited<ReturnType<typeof listPages>>): Record<string, LayoutTemplateId> {
  return Object.fromEntries(
    pageRows.flatMap((row) => {
      const parsed = LayoutTemplateIdSchema.safeParse(row.layoutTemplate);
      return parsed.success ? [[row.pageKey, parsed.data]] : [];
    }),
  );
}

function qualityAppliesToPage(finding: PageQualityFinding, pageKey: string, chapterNumber: number, layoutTemplate: string): boolean {
  if (finding.pageKey === pageKey) return true;
  if (finding.scope === 'CHAPTER' && finding.chapterNumber === chapterNumber) {
    return !finding.layoutTemplate || finding.layoutTemplate === layoutTemplate;
  }
  if (finding.scope === 'BOOK') {
    return !finding.layoutTemplate || finding.layoutTemplate === layoutTemplate;
  }
  return false;
}

function riskFromFit(status: string): RiskLevel {
  if (status === 'OVERFLOW') return 'BLOCKER';
  if (status === 'TIGHT') return 'WARNING';
  return 'NONE';
}

function riskFromFindings(findings: PageQualityFinding[], category: PageQualityFinding['category']): RiskLevel {
  if (findings.some((finding) => finding.category === category && finding.severity === 'BLOCKER')) return 'BLOCKER';
  if (findings.some((finding) => finding.category === category && finding.severity === 'WARNING')) return 'WARNING';
  if (findings.some((finding) => finding.category === category)) return 'LOW';
  return 'NONE';
}

function automatedFixAvailable(finding: PageQualityFinding | undefined): boolean {
  return Boolean(finding?.scope === 'PAGE' && (finding.category === 'CONTINUATION' || finding.category === 'WHITESPACE'));
}

function fixModeFor(finding: PageQualityFinding | undefined): FixMode {
  if (!finding) return 'NONE';
  if (automatedFixAvailable(finding)) return 'AUTOMATIC';
  if (finding.scope === 'PAGE') return 'MANUAL';
  return 'DECISION_ONLY';
}

/**
 * Build typed one-click proposals for a page from its measured risks + policy.
 * Pure function of the inputs; proposes, never mutates.
 */
function buildProposedActions(
  pageKey: string,
  layout: LayoutTemplateId,
  fillRatio: number,
  estimatedRenderedPages: number,
  risks: { continuation: RiskLevel; underfilled: RiskLevel; tightText: RiskLevel; repeatedLayout: RiskLevel },
  policy: PublishingDirectorPolicy,
): DirectorAction[] {
  const actions: DirectorAction[] = [];

  // OVERFLOW / TIGHT — propose a higher-capacity layout.
  if (fillRatio > policy.overflowFillRatio || risks.tightText === 'BLOCKER' || risks.tightText === 'WARNING') {
    const to = nextHigherCapacity(layout, policy.capacityLadder);
    if (to && to !== layout) {
      actions.push({
        kind: 'switch_layout',
        pageKey,
        from: layout,
        to,
        rationale: `Text overflows ${layout} (fill ${fillRatio.toFixed(2)}×). ${to} holds more copy and removes the orphaned tail.`,
      });
    }
  }

  // UNDERFILLED — propose an illustration-led layout.
  if (risks.underfilled === 'WARNING' || (fillRatio > 0 && fillRatio < policy.underfilledFillRatio)) {
    actions.push({
      kind: 'switch_layout',
      pageKey,
      from: layout,
      to: 'LAYOUT_3_ILLUSTRATION_DOMINANT',
      rationale: `Page is sparse (fill ${fillRatio.toFixed(2)}×). An illustration-led layout turns whitespace into a deliberate visual moment.`,
    });
  }

  // TINY CONTINUATION — pull the tail back with more opening capacity.
  if (estimatedRenderedPages > 1 && risks.continuation !== 'NONE') {
    const to = nextHigherCapacity(layout, policy.capacityLadder);
    if (to && to !== layout) {
      actions.push({
        kind: 'switch_layout',
        pageKey,
        from: layout,
        to,
        rationale: `Awkward continuation across ${estimatedRenderedPages} pages. Higher-capacity ${to} pulls the tail onto the opening page.`,
      });
    }
  }

  // LAYOUT REPETITION — offer a shared accent so repeated layouts read as varied.
  if (risks.repeatedLayout === 'WARNING' || risks.repeatedLayout === 'BLOCKER') {
    actions.push({
      kind: 'apply_repeating_accent',
      layoutTemplate: layout,
      rationale: `This layout repeats heavily in the chapter. A shared Visual Identity accent breaks the visual cluster without changing page identity.`,
    });
  }

  // Always allow the operator to accept the current plan as intentional.
  if (actions.length > 0) {
    actions.push({ kind: 'mark_intentional', pageKey, rationale: 'Accept the current layout as a deliberate editorial choice and silence this proposal.' });
  }

  return actions;
}

function selectedLayoutWhy(reasonCodes: string[]): string {
  if (reasonCodes.length === 0) return 'No layout reason codes were recorded.';
  return reasonCodes
    .map((code) => code.replace(/^manifest_content_type_/, 'manifest content type: ').replace(/_/g, ' '))
    .join('; ');
}

export async function buildPublishingDirectorDecisionLedger(
  projectId: string,
  policy: PublishingDirectorPolicy = DEFAULT_DIRECTOR_POLICY,
): Promise<PublishingDirectorDecisionLedger | undefined> {
  const project = await getProject(projectId);
  if (!project) return undefined;

  const config = parseConfig(project.config);
  const manifestRows = await listManifests(projectId, 'PAGE');
  const pageManifests = manifestRows
    .map((row) => PageManifestSchema.parse(row.content))
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const pageRows = await listPages(projectId);
  const pageRowByKey = new Map(pageRows.map((row) => [row.pageKey, row]));
  const layoutOverrides = persistedLayoutOverrides(pageRows);
  const textFit = buildTextFitPreview(pageManifests, config, layoutOverrides);
  const textFitByKey = new Map(textFit.pages.map((page) => [page.pageKey, page]));
  const qualityReview = await reviewProjectPageQuality(projectId);
  const qualityFindings = qualityReview?.findings ?? [];
  const resolutions = config.pageQualityResolutions ?? {};

  const pages = pageManifests.map((page): PublishingDirectorLedgerEntry => {
    const override = layoutOverrides[page.pageId];
    const decision = planPage(page, config, override ? { forcedLayoutTemplate: override, reasonCode: 'persisted_page_layout_override' } : {});
    const fit = textFitByKey.get(page.pageId);
    const row = pageRowByKey.get(page.pageId);
    const pageFindings = qualityFindings.filter((finding) =>
      qualityAppliesToPage(finding, page.pageId, page.chapterNumber, decision.layoutTemplate),
    );
    const unresolved = pageFindings.filter((finding) => !resolutions[finding.findingId]);
    const primaryFinding = unresolved[0] ?? pageFindings[0];
    const fixMode = fixModeFor(primaryFinding);
    const automatic = automatedFixAvailable(primaryFinding);
    const fillRatio = fit?.fit.fillRatio ?? 0;
    const estimatedRenderedPages = fit?.fit.estimatedRenderedPages ?? 1;
    const risks = {
      continuation: riskFromFindings(pageFindings, 'CONTINUATION'),
      underfilled: (fit?.fit.status === 'UNDERFILLED' ? 'WARNING' : riskFromFindings(pageFindings, 'WHITESPACE')) as RiskLevel,
      tightText: riskFromFit(fit?.fit.status ?? 'FITS'),
      repeatedLayout: riskFromFindings(pageFindings, 'LAYOUT_DIVERSITY'),
    };
    const proposedActions = unresolved.length > 0
      ? buildProposedActions(page.pageId, decision.layoutTemplate, fillRatio, estimatedRenderedPages, risks, policy)
      : [];

    return {
      pageKey: page.pageId,
      chapterNumber: page.chapterNumber,
      entryTitle: page.entryTitle,
      selectedLayout: decision.layoutTemplate,
      persistedLayout: row?.layoutTemplate ?? null,
      contentType: decision.contentType,
      wordCount: decision.wordCount,
      layoutReasonCodes: decision.reasonCodes,
      selectedLayoutWhy: selectedLayoutWhy(decision.reasonCodes),
      textCapacityChars: fit?.fit.capacityChars ?? 0,
      fillRatio,
      estimatedRenderedPages,
      risks,
      currentQualityFindings: pageFindings.map((finding) => ({
        findingId: finding.findingId,
        scope: finding.scope,
        severity: finding.severity,
        category: finding.category,
        problem: finding.problem,
        whyItMatters: finding.whyItMatters,
        recommendedFix: finding.recommendedFix,
        expectedResult: finding.expectedResult,
        resolved: Boolean(resolutions[finding.findingId]),
        resolutionStatus: resolutions[finding.findingId]?.status,
      })),
      recommendedFix: primaryFinding?.recommendedFix ?? 'No publishing-director fix recommended for this page right now.',
      fixMode,
      automaticFixAvailable: automatic,
      alternativesConsidered: decision.decisionTrace.alternativesConsidered.map((alt) => ({
        template: alt.template,
        skippedBecause: alt.skippedBecause,
      })),
      proposedActions,
      operatorDecision: unresolved.length > 0 ? 'NEEDS_DECISION' : pageFindings.length > 0 ? 'RESOLVED' : 'READY',
    };
  });

  const totals = {
    pages: pages.length,
    needsDecision: pages.filter((page) => page.operatorDecision === 'NEEDS_DECISION').length,
    automaticFixesAvailable: pages.filter((page) => page.automaticFixAvailable && page.operatorDecision === 'NEEDS_DECISION').length,
    continuationRisks: pages.filter((page) => page.risks.continuation !== 'NONE').length,
    underfilledRisks: pages.filter((page) => page.risks.underfilled !== 'NONE').length,
    tightTextRisks: pages.filter((page) => page.risks.tightText !== 'NONE').length,
    repeatedLayoutRisks: pages.filter((page) => page.risks.repeatedLayout !== 'NONE').length,
    actionableProposals: pages.reduce((sum, page) => sum + page.proposedActions.length, 0),
  };

  return {
    status: totals.needsDecision > 0 ? 'NEEDS_REVIEW' : pages.some((page) => page.risks.tightText === 'BLOCKER') ? 'BLOCKED' : 'READY',
    generatedAt: new Date().toISOString(),
    totals,
    pages,
  };
}
