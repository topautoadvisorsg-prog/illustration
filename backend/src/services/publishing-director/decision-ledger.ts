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

type RiskLevel = 'NONE' | 'LOW' | 'WARNING' | 'BLOCKER';
type FixMode = 'AUTOMATIC' | 'MANUAL' | 'DECISION_ONLY' | 'NONE';

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

function selectedLayoutWhy(reasonCodes: string[]): string {
  if (reasonCodes.length === 0) return 'No layout reason codes were recorded.';
  return reasonCodes
    .map((code) => code.replace(/^manifest_content_type_/, 'manifest content type: ').replace(/_/g, ' '))
    .join('; ');
}

export async function buildPublishingDirectorDecisionLedger(projectId: string): Promise<PublishingDirectorDecisionLedger | undefined> {
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
      fillRatio: fit?.fit.fillRatio ?? 0,
      estimatedRenderedPages: fit?.fit.estimatedRenderedPages ?? 1,
      risks: {
        continuation: riskFromFindings(pageFindings, 'CONTINUATION'),
        underfilled: fit?.fit.status === 'UNDERFILLED' ? 'WARNING' : riskFromFindings(pageFindings, 'WHITESPACE'),
        tightText: riskFromFit(fit?.fit.status ?? 'FITS'),
        repeatedLayout: riskFromFindings(pageFindings, 'LAYOUT_DIVERSITY'),
      },
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
  };

  return {
    status: totals.needsDecision > 0 ? 'NEEDS_REVIEW' : pages.some((page) => page.risks.tightText === 'BLOCKER') ? 'BLOCKED' : 'READY',
    generatedAt: new Date().toISOString(),
    totals,
    pages,
  };
}
