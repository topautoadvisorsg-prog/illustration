import type { FastifyInstance } from 'fastify';
import { isNativeError } from 'node:util/types';
import {
  ApiErrorSchema,
  CreateProjectRequestSchema,
  LayoutApprovalSchema,
  PageManifestSchema,
  PageQualityResolutionSchema,
  ProofArtifactSchema,
  LayoutTemplateIdSchema,
  ProjectConfigSchema,
  type ProjectConfig,
  type LayoutTemplateId,
  type PageQualityResolution,
  ProjectSchema,
} from '@wildlands/shared';
import { z } from 'zod';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  setManuscript,
  setProjectStatus,
  updateProjectConfig,
  type ProjectRow,
} from '../db/repositories/projects.repo.js';
import { listManifests, listPages } from '../db/repositories/manifests.repo.js';
import { updatePagePlanning } from '../db/repositories/manifests.repo.js';
import { callChat } from '../services/claude/claude.js';
import { ingestManuscript } from '../pipeline/stage-1-ingestion/ingest-manuscript.js';
import { UnsupportedManuscriptError } from '../pipeline/stage-1-ingestion/extract-manuscript.js';
import { generateManifests } from '../pipeline/stage-1.5-manifests/generate-manifests.js';
import { planPage, validateLayoutLibrary } from '../pipeline/stage-2-planner/plan-pages.js';
import { previewProjectTextFit } from '../pipeline/stage-6-layout/text-fit-preview.js';
import {
  RenderBlockedError,
  generateCoverWrapArtwork,
  renderBookPdf,
  renderChapterPdf,
  renderCoverPdf,
  renderPagePdf,
} from '../pipeline/stage-6-layout/render-chapter.js';
import { countImagesForProject, listImagesForProject, listImagesForPage } from '../db/repositories/images.repo.js';
import { computePageGeometry } from '../pipeline/stage-6-layout/page-geometry.js';
import { analyzeTextFit } from '../pipeline/stage-6-layout/text-fit.js';
import { BLUEPRINT_COMPOSITION_INSTRUCTION } from '../pipeline/stage-3-generation/blueprint.js';
import { getAgentContract } from '../agents/agent-contracts.js';
import { getEnv } from '../env.js';
import { CONTENT_TYPE_POLICY, decomposeTemplate } from '../pipeline/stage-2-planner/layered-layout.js';
import { layoutCoverageMeta } from '../pipeline/stage-6-layout/layout-profiles.js';
import { estimateCost } from '../services/cost/estimate.js';
import {
  getChapterOperatorIntelligence,
  getProjectProductionDashboard,
} from '../services/operator-intelligence/operator-intelligence.js';
import { reviewProjectPageQuality } from '../services/page-quality/page-quality-review.js';
import type { PageQualityFinding, PageQualityReview } from '../services/page-quality/page-quality-review.js';
import { buildPublishingDirectorDecisionLedger } from '../services/publishing-director/decision-ledger.js';
import { calibrateProjectChapterFormats } from '../services/calibration/format-calibration.js';
import { getProjectStorage } from '../services/storage/project-storage.js';

const ProjectParamsSchema = z.object({ id: z.string().uuid() });
const ProjectPageParamsSchema = z.object({ id: z.string().uuid(), pageKey: z.string().min(1) });
const ChapterOperatorIntelligenceParamsSchema = z.object({
  id: z.string().uuid(),
  chapterNumber: z.coerce.number().int().positive(),
});
const ChapterLayoutApprovalParamsSchema = z.object({
  id: z.string().uuid(),
  chapterNumber: z.coerce.number().int().positive(),
});
const ChapterFormatCalibrationParamsSchema = z.object({
  id: z.string().uuid(),
  chapterNumber: z.coerce.number().int().positive(),
});
const ProofArtifactParamsSchema = z.object({ id: z.string().uuid(), artifactId: z.string().min(1) });

const LayoutApprovalContractSchema = LayoutApprovalSchema;
const LayoutApprovalsSchema = z.record(LayoutApprovalContractSchema);

function parseProjectConfig(row: ProjectRow): ProjectConfig {
  return ProjectConfigSchema.parse(row.config);
}

function getLayoutApprovals(row: ProjectRow): ProjectConfig['layoutApprovals'] {
  return parseProjectConfig(row).layoutApprovals ?? {};
}

function withQualityResolutions(review: PageQualityReview, config: ProjectConfig): PageQualityReview {
  const resolutions = config.pageQualityResolutions ?? {};
  return {
    ...review,
    findings: review.findings.map((finding) => ({
      ...finding,
      resolution: resolutions[finding.findingId],
    })),
  };
}

function chapterQualityFindings(
  review: PageQualityReview,
  chapterNumber: number,
  pageKeys: Set<string>,
): PageQualityFinding[] {
  return review.findings.filter((finding) => {
    if (finding.scope === 'BOOK') return true;
    if (finding.chapterNumber === chapterNumber) return true;
    if (finding.pageKey && pageKeys.has(finding.pageKey)) return true;
    return false;
  });
}

function unresolvedChapterQualityFindings(
  review: PageQualityReview,
  config: ProjectConfig,
  chapterNumber: number,
  pageKeys: Set<string>,
): PageQualityFinding[] {
  const resolutions = config.pageQualityResolutions ?? {};
  return chapterQualityFindings(review, chapterNumber, pageKeys).filter((finding) => !resolutions[finding.findingId]);
}

function automatedQualityFixLayout(finding: PageQualityFinding): LayoutTemplateId | undefined {
  if (finding.scope !== 'PAGE' || !finding.pageKey) return undefined;
  if (finding.category === 'CONTINUATION') return 'LAYOUT_2_TEXT_HEAVY';
  if (finding.category === 'WHITESPACE') return 'LAYOUT_3_ILLUSTRATION_DOMINANT';
  return undefined;
}

async function applyAutomatedPageQualityFix(
  projectId: string,
  config: ProjectConfig,
  finding: PageQualityFinding,
): Promise<
  | {
      config: ProjectConfig;
      action: {
        type: string;
        summary: string;
        pageKey: string;
        fromLayoutTemplate: LayoutTemplateId;
        toLayoutTemplate: LayoutTemplateId;
      };
    }
  | undefined
> {
  const toLayoutTemplate = automatedQualityFixLayout(finding);
  if (!toLayoutTemplate || !finding.pageKey) return undefined;
  const pageRows = await listPages(projectId);
  const pageRow = pageRows.find((row) => row.pageKey === finding.pageKey);
  if (!pageRow?.imagePrompt || !pageRow.imagePromptSha256) return undefined;
  const fromLayoutTemplate = LayoutTemplateIdSchema.safeParse(pageRow.layoutTemplate).success
    ? (pageRow.layoutTemplate as LayoutTemplateId)
    : undefined;
  if (!fromLayoutTemplate || fromLayoutTemplate === toLayoutTemplate) return undefined;

  const pageManifest = (await listManifests(projectId, 'PAGE'))
    .map((row) => PageManifestSchema.parse(row.content))
    .find((page) => page.pageId === finding.pageKey);
  if (!pageManifest) return undefined;

  const decision = planPage(pageManifest, config, {
    forcedLayoutTemplate: toLayoutTemplate,
    reasonCode: `page_quality_fix_${finding.category.toLowerCase()}`,
  });

  await updatePagePlanning(projectId, finding.pageKey, {
    layoutTemplate: decision.layoutTemplate,
    imagePrompt: decision.prompt,
    imagePromptSha256: decision.promptSha256,
  });

  const nextLayoutApprovals = { ...(config.layoutApprovals ?? {}) };
  delete nextLayoutApprovals[String(pageRow.chapterNumber)];

  return {
    config: { ...config, layoutApprovals: nextLayoutApprovals },
    action: {
      type: 'SWITCH_LAYOUT',
      summary:
        finding.category === 'CONTINUATION'
          ? `Switched ${finding.pageKey} from ${fromLayoutTemplate} to ${toLayoutTemplate} to increase text capacity and reduce continuation risk.`
          : `Switched ${finding.pageKey} from ${fromLayoutTemplate} to ${toLayoutTemplate} so sparse content becomes a stronger illustration-led page.`,
      pageKey: finding.pageKey,
      fromLayoutTemplate,
      toLayoutTemplate,
    },
  };
}

/**
 * A manuscript upload error caused by the file itself (wrong type, empty, or no
 * detectable chapter/entry structure) — surfaced to the client as a clean 400
 * rather than a 500. Anything else is a real server fault and rethrown.
 */
function isManuscriptUserError(err: unknown): err is Error {
  if (err instanceof UnsupportedManuscriptError) return true;
  if (isNativeError(err)) {
    return /^(NO_CHAPTERS_DETECTED|NO_ENTRIES_DETECTED|DUPLICATE_|CHAPTER_|ENTRY_)/.test(err.message);
  }
  return false;
}

function toContract(row: ProjectRow) {
  return {
    id: row.id,
    brand: row.brand,
    audience: row.audience,
    title: row.title,
    status: row.status,
    manuscriptPath: row.manuscriptPath,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const ProjectListResponseSchema = z.object({ projects: z.array(ProjectSchema) });
const CreatedProjectResponseSchema = z.object({ project: ProjectSchema });
const ProjectConfigResponseSchema = z.object({ config: ProjectConfigSchema });
const UpdateProjectConfigBodySchema = z.object({ config: ProjectConfigSchema });

function layoutCompatibilityLabels(layoutTemplate: string | null, contentType?: string): string[] {
  const labels = new Set<string>();
  if (layoutTemplate) {
    const composition = decomposeTemplate(layoutTemplate as Parameters<typeof decomposeTemplate>[0]);
    labels.add(composition.architecture.toLowerCase().replace(/_/g, ' '));
    labels.add(composition.contentType.toLowerCase().replace(/_/g, ' '));
    const policy = CONTENT_TYPE_POLICY[composition.contentType];
    policy.usedFor.forEach((use) => labels.add(use));
  }
  if (contentType && contentType in CONTENT_TYPE_POLICY) {
    const policy = CONTENT_TYPE_POLICY[contentType as keyof typeof CONTENT_TYPE_POLICY];
    labels.add(policy.purpose);
    policy.usedFor.forEach((use) => labels.add(use));
  }
  return Array.from(labels);
}

const UploadManuscriptBodySchema = z
  .object({
    filename: z.string().min(1),
    /** Plain text for .md/.markdown/.txt manuscripts. */
    markdown: z.string().min(1).optional(),
    /** Base64 bytes for binary uploads (.docx/.pdf). */
    fileBase64: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.markdown) || Boolean(v.fileBase64), {
    message: 'Provide manuscript text (markdown) or file bytes (fileBase64).',
  });
const UploadManuscriptResponseSchema = z.object({
  project: ProjectSchema,
  manuscript: z.object({
    relativePath: z.string(),
    sha256: z.string(),
    sizeBytes: z.number(),
    totalChapters: z.number(),
    totalEntries: z.number(),
    totalWords: z.number(),
    warnings: z.array(z.string()),
  }),
});

const ManifestSummaryResponseSchema = z.object({
  project: ProjectSchema,
  summary: z.object({
    totalChapters: z.number(),
    totalEntries: z.number(),
    totalPages: z.number(),
    totalImagesNeeded: z.number(),
    manifestsWritten: z.number(),
    pagesWritten: z.number(),
  }),
});

const ManifestsListResponseSchema = z.object({
  manifests: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      externalId: z.string(),
      version: z.number(),
      content: z.unknown(),
    }),
  ),
});

const PagesListResponseSchema = z.object({
  pages: z.array(
    z.object({
      id: z.string(),
      pageKey: z.string(),
      chapterNumber: z.number(),
      plannedPageNumber: z.number(),
      layoutTemplate: z.string().nullable(),
      imagePrompt: z.string().nullable(),
      imagePromptSha256: z.string().nullable(),
      status: z.string(),
    }),
  ),
  layoutApprovals: LayoutApprovalsSchema,
});

const OperatorChapterIntelligenceResponseSchema = z.object({
  status: z.enum(['READY', 'NEEDS_REVIEW', 'BLOCKED']),
  nextAction: z.string(),
  summary: z.object({
    chapterNumber: z.number(),
    chapterTitle: z.string(),
    pages: z.number(),
    layoutApproved: z.boolean(),
    pagesPlanned: z.number(),
    pagesWithImages: z.number(),
    pagesWithApprovedImages: z.number(),
    pagesPrintReady: z.number(),
    missingImages: z.number(),
    unapprovedImages: z.number(),
    placeholderPages: z.number(),
  }),
  findings: z.array(
    z.object({
      severity: z.enum(['BLOCKER', 'WARNING', 'INFO']),
      category: z.enum(['TEXT_FIT', 'IMAGE', 'LAYOUT', 'PROOF', 'WORKFLOW']),
      scope: z.enum(['CHAPTER', 'PAGE']),
      pageKey: z.string().optional(),
      message: z.string(),
      recommendedAction: z.string(),
    }),
  ),
});

const ProductionDashboardItemSchema = z.object({
  label: z.string(),
  count: z.number(),
  action: z.string(),
});

const ProductionDashboardResponseSchema = z.object({
  status: z.enum([
    'NOT_STARTED',
    'PLANNING',
    'LAYOUT_REVIEW',
    'PROOFING',
    'IMAGE_PRODUCTION',
    'READY_FOR_EXPORT',
    'EXPORTED',
  ]),
  nextAction: z.string(),
  totals: z.object({
    chapters: z.number(),
    pages: z.number(),
    pagesPlanned: z.number(),
    layoutApprovedChapters: z.number(),
    pagesWithImages: z.number(),
    pagesWithApprovedImages: z.number(),
    pagesPrintReady: z.number(),
    missingImages: z.number(),
    unapprovedImages: z.number(),
    exportsReady: z.number(),
  }),
  chapters: z.array(
    z.object({
      chapterNumber: z.number(),
      chapterTitle: z.string(),
      status: z.enum(['READY', 'NEEDS_REVIEW', 'BLOCKED']),
      nextAction: z.string(),
      pages: z.number(),
      pagesPlanned: z.number(),
      layoutApproved: z.boolean(),
      textFitSummary: z
        .object({
          pages: z.number(),
          fits: z.number(),
          tight: z.number(),
          overflow: z.number(),
          underfilled: z.number(),
        })
        .optional(),
      pagesWithImages: z.number(),
      pagesWithApprovedImages: z.number(),
      pagesPrintReady: z.number(),
      missingImages: z.number(),
      unapprovedImages: z.number(),
      blockerCount: z.number(),
      warningCount: z.number(),
    }),
  ),
  waitingOnOperator: z.array(ProductionDashboardItemSchema),
  waitingOnSystem: z.array(ProductionDashboardItemSchema),
  blockers: z.array(
    z.object({
      severity: z.enum(['BLOCKER', 'WARNING', 'INFO']),
      category: z.enum(['TEXT_FIT', 'IMAGE', 'LAYOUT', 'PROOF', 'WORKFLOW']),
      scope: z.enum(['CHAPTER', 'PAGE']),
      pageKey: z.string().optional(),
      message: z.string(),
      recommendedAction: z.string(),
    }),
  ),
  recentExports: z.array(
    z.object({
      kind: z.string(),
      status: z.string(),
      filePath: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});

const PlanningZoneSchema = z.object({
  id: z.string(),
  role: z.string(),
  shape: z.string(),
  xPct: z.number(),
  yPct: z.number(),
  widthPct: z.number(),
  heightPct: z.number(),
  instruction: z.string(),
});

const ImagePriorityZoneSchema = z.object({
  xIn: z.number(),
  yIn: z.number(),
  widthIn: z.number(),
  heightIn: z.number(),
  recommendedWidthPx: z.number(),
  recommendedHeightPx: z.number(),
  bleedPaddingPx: z.number(),
  aspectRatio: z.string(),
  overlaySafeArea: z.string(),
});

const PlanPagesResponseSchema = z.object({
  project: ProjectSchema,
  layoutLibrary: z.object({
    totalTemplates: z.number(),
    approvedTemplates: z.number(),
    missingTemplates: z.array(z.string()),
    readyForProduction: z.boolean(),
    issues: z.array(
      z.object({
        templateId: z.string(),
        severity: z.enum(['BLOCKER', 'WARNING']),
        code: z.string(),
        message: z.string(),
      }),
    ),
  }),
  plannedPages: z.array(
    z.object({
      pageKey: z.string(),
      entryTitle: z.string(),
      wordCount: z.number(),
      contentType: z.string(),
      contentTypePurpose: z.string(),
      contentTypeUsedFor: z.array(z.string()),
      multiSubject: z.boolean(),
      coverage: z.number(),
      architecture: z.string(),
      layoutTemplate: z.string(),
      layoutReferenceLabel: z.string(),
      promptSha256: z.string(),
      promptReady: z.boolean(),
      reasonCodes: z.array(z.string()),
      blockers: z.array(z.string()),
      warnings: z.array(z.string()),
      layoutInstructions: z.object({
        description: z.string(),
        useCases: z.array(z.string()),
        avoidWhen: z.array(z.string()),
        textZone: z.string(),
        imageZone: z.string(),
        textFitRule: z.string(),
      }),
      capacity: z.object({
        minWords: z.number(),
        targetWords: z.number(),
        maxWords: z.number(),
        status: z.string(),
        overMaxWords: z.boolean(),
        underMinWords: z.boolean(),
      }),
      typography: z.object({
        bodyFont: z.string(),
        bodyPt: z.number(),
        lineHeight: z.number(),
      }),
      artBrief: z.object({
        imagePercent: z.number(),
        textPercent: z.number(),
        placement: z.string(),
        textPlacement: z.string(),
        architecture: z.string(),
        textSafeZones: z.array(PlanningZoneSchema),
        typographyZones: z.array(PlanningZoneSchema),
        imagePriorityZones: z.array(PlanningZoneSchema),
        imagePriorityZone: ImagePriorityZoneSchema,
        artBox: ImagePriorityZoneSchema,
      }),
      agent: z.object({
        id: z.string(),
        name: z.string(),
        mission: z.string(),
        expertFrame: z.string(),
      }),
      textFitStatus: z.enum(['PENDING_PREVIEW', 'BLOCKED_LAYOUT_LIBRARY']),
      decisionTrace: z.object({
        contentTypeSource: z.enum(['from_manifest', 'classified']),
        contentTypeReason: z.string(),
        layoutRule: z.string(),
        layoutExplanation: z.string(),
        wordCountBand: z.enum(['under_200', 'standard_range', 'over_400']),
        operatorForced: z.boolean(),
        alternativesConsidered: z.array(z.object({ template: z.string(), skippedBecause: z.string() })),
      }),
    }),
  ),
});

const TextFitPreviewResponseSchema = z.object({
  geometry: z.object({
    pageWidthIn: z.number(),
    pageHeightIn: z.number(),
    textWidthIn: z.number(),
    textHeightIn: z.number(),
  }),
  totals: z.object({
    pages: z.number(),
    fits: z.number(),
    tight: z.number(),
    overflow: z.number(),
    underfilled: z.number(),
  }),
  readyForImageSpend: z.boolean(),
  pages: z.array(
    z.object({
      pageKey: z.string(),
      entryTitle: z.string(),
      layoutTemplate: z.string(),
      layoutReasonCodes: z.array(z.string()),
      promptReady: z.boolean(),
      blockers: z.array(z.string()),
      fit: z.object({
        status: z.enum(['FITS', 'TIGHT', 'OVERFLOW', 'UNDERFILLED']),
        fits: z.boolean(),
        charCount: z.number(),
        capacityChars: z.number(),
        fillRatio: z.number(),
        estimatedLines: z.number(),
        usableLines: z.number(),
        estimatedRenderedPages: z.number(),
        notes: z.array(z.string()),
      }),
      allocation: z.object({
        architecture: z.string(),
        imagePlacement: z.string(),
        textPlacement: z.string(),
        openingPageImagePercent: z.number(),
        openingPageTextPercent: z.number(),
        continuationPageImagePercent: z.number(),
        continuationPageTextPercent: z.number(),
        estimatedRenderedPages: z.number(),
        wordsPerOpeningPage: z.number(),
        wordsPerContinuationPage: z.number(),
        textSafeZones: z.array(PlanningZoneSchema),
        typographyZones: z.array(PlanningZoneSchema),
        imagePriorityZones: z.array(PlanningZoneSchema),
        imagePriorityZone: ImagePriorityZoneSchema,
        artBox: ImagePriorityZoneSchema,
        notes: z.array(z.string()),
      }),
    }),
  ),
});

// Page Generation Inspector (read-only). One deterministic call returns the full
// construction chain for a single page — manuscript, layout/zones, typography/fit,
// image plan, exact prompt, image versions, blueprint + render references. NO
// mutation: planPage + analyzeTextFit are pure; nothing is written or re-planned.
const PageInspectorResponseSchema = z.object({
  page: z.object({
    pageId: z.string(),
    pageKey: z.string(),
    entryTitle: z.string(),
    scientificName: z.string().nullable(),
    chapterNumber: z.number(),
    status: z.string(),
  }),
  manuscript: z.object({
    bodyMarkdown: z.string(),
    imageSubject: z.string(),
    wordCount: z.number(),
  }),
  // Gap 1 — the governing instructions for how the manifest is created. The manifest
  // stage is deterministic today (realityNote), so this is its contract/spec, not an
  // LLM prompt; surfaced so the operator can see what shaped the manifest.
  manifestStage: z.object({
    agentId: z.string(),
    name: z.string(),
    mission: z.string(),
    expertFrame: z.string(),
    hardRules: z.array(z.string()),
    requiredOutputs: z.array(z.string()),
    runtime: z.string(),
    realityNote: z.string(),
  }),
  layout: z.object({
    template: z.string(),
    label: z.string(),
    contentType: z.string(),
    coverage: z.number(),
    architecture: z.string(),
    layoutInstructions: z.object({
      description: z.string(),
      useCases: z.array(z.string()),
      avoidWhen: z.array(z.string()),
      textZone: z.string(),
      imageZone: z.string(),
      textFitRule: z.string(),
    }),
    decisionTrace: z.object({
      contentTypeSource: z.string(),
      contentTypeReason: z.string(),
      layoutRule: z.string(),
      layoutExplanation: z.string(),
      wordCountBand: z.string(),
      operatorForced: z.boolean(),
      alternativesConsidered: z.array(z.object({ template: z.string(), skippedBecause: z.string() })),
    }),
    capacity: z.object({
      minWords: z.number(),
      targetWords: z.number(),
      maxWords: z.number(),
      status: z.string(),
      overMaxWords: z.boolean(),
      underMinWords: z.boolean(),
    }),
    artBrief: z.object({
      imagePercent: z.number(),
      textPercent: z.number(),
      placement: z.string(),
      textPlacement: z.string(),
      architecture: z.string(),
      textSafeZones: z.array(PlanningZoneSchema),
      typographyZones: z.array(PlanningZoneSchema),
      imagePriorityZones: z.array(PlanningZoneSchema),
      imagePriorityZone: ImagePriorityZoneSchema,
    }),
  }),
  typography: z.object({
    bodyFont: z.string(),
    bodyPt: z.number(),
    lineHeight: z.number(),
    wordsPerOpeningPage: z.number(),
    wordsPerContinuationPage: z.number(),
    estimatedRenderedPages: z.number(),
    fit: z.object({
      status: z.string(),
      fits: z.boolean(),
      charCount: z.number(),
      capacityChars: z.number(),
      fillRatio: z.number(),
      estimatedLines: z.number(),
      usableLines: z.number(),
      estimatedRenderedPages: z.number(),
      notes: z.array(z.string()),
    }),
  }),
  prompt: z.object({
    text: z.string(),
    sha256: z.string(),
    ready: z.boolean(),
    blockers: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
  images: z.array(
    z.object({
      version: z.number(),
      status: z.string(),
      active: z.boolean(),
      prompt: z.string(),
      promptSha256: z.string(),
      widthPx: z.number().nullable(),
      heightPx: z.number().nullable(),
      generatedPath: z.string().nullable(),
      upscaledPath: z.string().nullable(),
    }),
  ),
  model: z.string(),
  // Gap 2 — blueprint composition instruction surfaced directly (no digging in the prompt).
  blueprint: z.object({ available: z.boolean(), url: z.string(), instruction: z.string() }),
  renderEndpoint: z.string(),
});

const FormatCalibrationResponseSchema = z.object({
  chapterNumber: z.number(),
  chapterTitle: z.string(),
  currentFormat: z.string(),
  recommendedFormat: z.string(),
  recommendedLabel: z.string(),
  nextAction: z.string(),
  options: z.array(
    z.object({
      format: z.string(),
      label: z.string(),
      typographyPackage: z.string(),
      trim: z.string(),
      bodyPt: z.number(),
      lineHeight: z.number(),
      entries: z.number(),
      estimatedProofPages: z.number(),
      fits: z.number(),
      tight: z.number(),
      overflow: z.number(),
      underfilled: z.number(),
      averageFillPercent: z.number(),
      score: z.number(),
      verdict: z.enum(['BEST_FIT', 'GOOD', 'RISKY', 'NOT_RECOMMENDED']),
      operatorSummary: z.string(),
      tradeoffs: z.array(z.string()),
    }),
  ),
});

const PageQualityReviewResponseSchema = z.object({
  status: z.enum(['READY', 'NEEDS_REVIEW', 'BLOCKED']),
  nextAction: z.string(),
  publishingStyle: z.object({
    id: z.literal('WILDLANDS_NATURAL_HISTORY'),
    label: z.string(),
    editorialIdentity: z.string(),
    whitespaceTolerance: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    educationalDensity: z.enum(['MEDIUM', 'HIGH']),
    visualDensity: z.enum(['MEDIUM']),
    featurePageTargetPercent: z.object({ min: z.number(), max: z.number() }),
    mixedPageTargetPercent: z.object({ min: z.number(), max: z.number() }),
    textFirstTargetPercent: z.object({ min: z.number(), max: z.number() }),
    visualPresenceGoal: z.string(),
    illustrationLayers: z.array(z.object({ layer: z.string(), purpose: z.string(), examples: z.array(z.string()) })),
    principles: z.array(z.string()),
  }),
  totals: z.object({
    pages: z.number(),
    findings: z.number(),
    blockers: z.number(),
    warnings: z.number(),
    infos: z.number(),
    awkwardContinuations: z.number(),
    underfilledPages: z.number(),
    rhythmFindings: z.number(),
  }),
  distribution: z.object({
    featurePercent: z.number(),
    mixedPercent: z.number(),
    textFirstPercent: z.number(),
    layoutCounts: z.array(z.object({ layoutTemplate: z.string(), count: z.number() })),
  }),
  chapters: z.array(
    z.object({
      chapterNumber: z.number(),
      pages: z.number(),
      featurePercent: z.number(),
      mixedPercent: z.number(),
      textFirstPercent: z.number(),
      dominantLayout: z.string().optional(),
      dominantLayoutPercent: z.number(),
      findings: z.number(),
    }),
  ),
  findings: z.array(
    z.object({
      findingId: z.string(),
      severity: z.enum(['BLOCKER', 'WARNING', 'INFO']),
      scope: z.enum(['BOOK', 'CHAPTER', 'PAGE']),
      category: z.enum(['CONTINUATION', 'WHITESPACE', 'RHYTHM', 'ILLUSTRATION_BALANCE', 'LAYOUT_DIVERSITY', 'PUBLISHING_STYLE']),
      pageKey: z.string().optional(),
      chapterNumber: z.number().optional(),
      layoutTemplate: z.string().optional(),
      problem: z.string(),
      whyItMatters: z.string(),
      recommendedFix: z.string(),
      expectedResult: z.string(),
      alternatives: z.array(z.string()),
      metrics: z.record(z.union([z.string(), z.number(), z.boolean()])),
      resolution: PageQualityResolutionSchema.optional(),
    }),
  ),
});

const PublishingDirectorDecisionLedgerResponseSchema = z.object({
  status: z.enum(['READY', 'NEEDS_REVIEW', 'BLOCKED']),
  generatedAt: z.string(),
  totals: z.object({
    pages: z.number(),
    needsDecision: z.number(),
    automaticFixesAvailable: z.number(),
    continuationRisks: z.number(),
    underfilledRisks: z.number(),
    tightTextRisks: z.number(),
    repeatedLayoutRisks: z.number(),
    actionableProposals: z.number(),
  }),
  pages: z.array(
    z.object({
      pageKey: z.string(),
      chapterNumber: z.number(),
      entryTitle: z.string(),
      selectedLayout: z.string(),
      persistedLayout: z.string().nullable(),
      contentType: z.string(),
      wordCount: z.number(),
      layoutReasonCodes: z.array(z.string()),
      selectedLayoutWhy: z.string(),
      textCapacityChars: z.number(),
      fillRatio: z.number(),
      estimatedRenderedPages: z.number(),
      risks: z.object({
        continuation: z.enum(['NONE', 'LOW', 'WARNING', 'BLOCKER']),
        underfilled: z.enum(['NONE', 'LOW', 'WARNING', 'BLOCKER']),
        tightText: z.enum(['NONE', 'LOW', 'WARNING', 'BLOCKER']),
        repeatedLayout: z.enum(['NONE', 'LOW', 'WARNING', 'BLOCKER']),
      }),
      currentQualityFindings: z.array(
        z.object({
          findingId: z.string(),
          scope: z.enum(['BOOK', 'CHAPTER', 'PAGE']),
          severity: z.enum(['BLOCKER', 'WARNING', 'INFO']),
          category: z.enum(['CONTINUATION', 'WHITESPACE', 'RHYTHM', 'ILLUSTRATION_BALANCE', 'LAYOUT_DIVERSITY', 'PUBLISHING_STYLE']),
          problem: z.string(),
          whyItMatters: z.string(),
          recommendedFix: z.string(),
          expectedResult: z.string(),
          resolved: z.boolean(),
          resolutionStatus: z.string().optional(),
        }),
      ),
      recommendedFix: z.string(),
      fixMode: z.enum(['AUTOMATIC', 'MANUAL', 'DECISION_ONLY', 'NONE']),
      automaticFixAvailable: z.boolean(),
      alternativesConsidered: z.array(
        z.object({ template: z.string(), skippedBecause: z.string() }),
      ),
      proposedActions: z.array(
        z.object({
          kind: z.enum(['switch_layout', 'apply_repeating_accent', 'mark_intentional']),
          pageKey: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          layoutTemplate: z.string().optional(),
          rationale: z.string(),
        }),
      ),
      operatorDecision: z.enum(['READY', 'NEEDS_DECISION', 'RESOLVED']),
    }),
  ),
});

const ChapterLayoutApprovalResponseSchema = z.object({
  approval: LayoutApprovalContractSchema,
  layoutApprovals: LayoutApprovalsSchema,
});

const ProofArtifactsResponseSchema = z.object({
  artifacts: z.array(ProofArtifactSchema),
});

const ResolvePageQualityFindingBodySchema = z.object({
  findingId: z.string().min(1),
  status: z.enum(['ACCEPTED', 'FIXED', 'DEFERRED', 'OVERRIDDEN']),
  note: z.string().optional(),
});

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/projects',
    { schema: { response: { 200: ProjectListResponseSchema } } },
    async () => {
      const rows = await listProjects();
      return { projects: rows.map(toContract) };
    },
  );

  app.post(
    '/api/projects',
    { schema: { body: CreateProjectRequestSchema, response: { 201: CreatedProjectResponseSchema } } },
    async (request, reply) => {
      const body = CreateProjectRequestSchema.parse(request.body);
      const row = await createProject({ config: body.config });
      return reply.code(201).send({ project: toContract(row) });
    },
  );

  app.get(
    '/api/projects/:id',
    { schema: { params: ProjectParamsSchema, response: { 200: CreatedProjectResponseSchema, 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const row = await getProject(id);
      if (!row) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      return { project: toContract(row) };
    },
  );

  app.get(
    '/api/projects/:id/config',
    { schema: { params: ProjectParamsSchema, response: { 200: ProjectConfigResponseSchema, 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const row = await getProject(id);
      if (!row) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      return { config: parseProjectConfig(row) };
    },
  );

  // Permanently delete a project and all its manifests, pages, and images.
  app.delete(
    '/api/projects/:id',
    { schema: { params: ProjectParamsSchema, response: { 200: z.object({ deleted: z.boolean(), id: z.string() }), 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const existing = await getProject(id);
      if (!existing) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      await deleteProject(id);
      return { deleted: true, id };
    },
  );

  // Operator chat: talk to the agent about THIS project. Read-only/advisory —
  // it explains state and recommends the next button; it does not run actions.
  const ChatBodySchema = z.object({
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1) }))
      .min(1)
      .max(40),
    recentLog: z.array(z.string()).max(40).optional(),
  });
  app.post(
    '/api/projects/:id/chat',
    { schema: { params: ProjectParamsSchema, body: ChatBodySchema, response: { 200: z.object({ reply: z.string() }), 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const body = ChatBodySchema.parse(request.body);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      const manifests = await listManifests(id);
      const pages = await listPages(id);
      const chapters = manifests.filter((m) => m.kind === 'CHAPTER').length;
      const statusCounts = pages.reduce<Record<string, number>>((acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1;
        return acc;
      }, {});
      const pageLines = pages
        .slice(0, 30)
        .map((p) => `  - ${p.pageKey}: layout=${p.layoutTemplate ?? 'none'} status=${p.status}`)
        .join('\n');

      const system = [
        'You are the operator-facing agent for The Wildlands Publishing Platform, which turns a manuscript into a print-ready illustrated book.',
        'The pipeline order is: Upload manuscript -> Breakdown (split into chapters/pages) -> Page Plan (assign layouts) -> Text-Fit -> Generate Images (paid) -> Approve -> Render PDF -> Export.',
        'You ADVISE and EXPLAIN. You cannot click buttons or run actions yourself; tell the operator which button to click. Be concise, plain, and direct. No jargon, no filler.',
        'NEVER claim the book is "done", "complete", or "ready to export" unless EVERY page status is APPROVED or PRINT_READY and the project status is EXPORTED. A rendered PDF *preview* uses the planning-zones overlay (no real artwork yet) and is only a draft — it is NOT a finished book. Do not tell the operator to "click export to download the final print-ready file" while pages still lack approved images. Be honest about how much work remains.',
        '',
        'CURRENT PROJECT STATE:',
        `- Title: ${project.title}`,
        `- Status: ${project.status}`,
        `- Manuscript uploaded: ${project.manuscriptPath ? 'yes' : 'no'}`,
        `- Chapters detected: ${chapters}`,
        `- Pages: ${pages.length}${pages.length ? ` (by status: ${JSON.stringify(statusCounts)})` : ''}`,
        pages.length ? `Pages:\n${pageLines}` : '',
        body.recentLog?.length ? `\nRECENT ACTIVITY LOG (newest first):\n${body.recentLog.slice(0, 20).map((l) => `  - ${l}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const replyText = await callChat({
        system,
        messages: body.messages,
        projectId: id,
        operation: 'operator-chat',
        maxTokens: 700,
      });
      return { reply: replyText };
    },
  );

  // Per-stage "Review" — the agent QA-checks its own output for a step and gives
  // a verdict, so the operator doesn't have to inspect every page by hand.
  const REVIEW_RUBRICS: Record<string, string> = {
    breakdown:
      'Verify the manuscript was split into sensible chapters and entries. Flag: empty/near-empty entries, missing or garbled titles, entries that look like meta/outline/front-matter rather than real content, and any chapter with an implausible entry count.',
    plan:
      'Verify every page has a layout assigned and a resolved image prompt. Flag: pages with no layout, blockers, unresolved prompt placeholders, or layouts that look wrong for the content.',
    textfit:
      'Verify the text-fit results. Long entries flowing across multiple pages are FINE (not overflow). Flag only genuinely broken cases (e.g. an illustration-dominant layout chosen for a very long entry).',
    images:
      'Verify image status. Report how many pages have approved art vs none. Do NOT recommend spending on generation unless the plan/text-fit look right first.',
    render:
      'Verify the book is structurally complete: chapters present, and (for a full book) front matter, table of contents, index, and back matter should exist. Flag missing structural pieces.',
  };
  const ReviewBodySchema = z.object({ stage: z.enum(['breakdown', 'plan', 'textfit', 'images', 'render']) });
  app.post(
    '/api/projects/:id/review',
    { schema: { params: ProjectParamsSchema, body: ReviewBodySchema, response: { 200: z.object({ review: z.string() }), 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const { stage } = ReviewBodySchema.parse(request.body);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      const manifests = await listManifests(id);
      const pages = await listPages(id);
      const book = manifests.find((m) => m.kind === 'BOOK');
      const chapters = manifests
        .filter((m) => m.kind === 'CHAPTER')
        .map((m) => m.content as { chapterNumber: number; chapterTitle: string; pageKeys?: string[] });
      const statusCounts = pages.reduce<Record<string, number>>((acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1;
        return acc;
      }, {});
      const bookContent = book?.content as { totalChapters?: number; totalEntries?: number; chapters?: Array<{ chapterNumber: number; chapterTitle: string; entryCount: number }> } | undefined;
      const chapterLines = (bookContent?.chapters ?? chapters.map((c) => ({ chapterNumber: c.chapterNumber, chapterTitle: c.chapterTitle, entryCount: c.pageKeys?.length ?? 0 })))
        .slice(0, 30)
        .map((c) => `  - Ch${c.chapterNumber} "${c.chapterTitle}": ${c.entryCount} entries`)
        .join('\n');
      const pagesNoLayout = pages.filter((p) => !p.layoutTemplate).length;

      const system = [
        `You are a strict, meticulous book-production QA reviewer for The Wildlands Publishing Platform, reviewing the "${stage}" step for the book "${project.title}". Be an honest editor/production manager: do not invent problems, do not rubber-stamp.`,
        '',
        'PROJECT STATE:',
        `- Status: ${project.status}; chapters: ${bookContent?.totalChapters ?? chapters.length}; total entries: ${bookContent?.totalEntries ?? pages.length}; pages: ${pages.length} (status: ${JSON.stringify(statusCounts)}); pages missing a layout: ${pagesNoLayout}`,
        chapterLines ? `Chapters:\n${chapterLines}` : '',
        '',
        `RUBRIC for "${stage}": ${REVIEW_RUBRICS[stage]}`,
        '',
        'Respond EXACTLY in this format, concise and specific:',
        'VERDICT: PASS or NEEDS WORK',
        "WHAT'S GOOD: 1-3 short bullets",
        'ISSUES: specific problems, or "none"',
        'FIX NEXT: concrete next action(s), or "nothing — ready to proceed"',
      ]
        .filter(Boolean)
        .join('\n');

      const review = await callChat({
        system,
        messages: [{ role: 'user', content: `Review the ${stage} output and give your verdict.` }],
        projectId: id,
        operation: `review-${stage}`,
        maxTokens: 600,
      });
      return { review };
    },
  );

  app.patch(
    '/api/projects/:id/config',
    {
      schema: {
        params: ProjectParamsSchema,
        body: UpdateProjectConfigBodySchema,
        response: { 200: CreatedProjectResponseSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const body = UpdateProjectConfigBodySchema.parse(request.body);
      const existing = await getProject(id);
      if (!existing) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      const existingConfig = parseProjectConfig(existing);
      const row = await updateProjectConfig(id, {
        ...body.config,
        layoutApprovals: existingConfig.layoutApprovals ?? {},
        // Preserve the plan snapshot so changing the standard/trim correctly
        // shows the plan as STALE (Priority #1) instead of silently matching.
        planMeta: existingConfig.planMeta,
      });
      if (!row) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      return { project: toContract(row) };
    },
  );

  app.post(
    '/api/projects/:id/manuscript',
    {
      schema: {
        params: ProjectParamsSchema,
        body: UploadManuscriptBodySchema,
        response: { 200: UploadManuscriptResponseSchema, 400: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const body = UploadManuscriptBodySchema.parse(request.body);

      const existing = await getProject(id);
      if (!existing) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      let manuscript;
      let outline;
      try {
        ({ manuscript, outline } = await ingestManuscript({
          projectId: id,
          filename: body.filename,
          markdown: body.markdown,
          fileBase64: body.fileBase64,
        }));
      } catch (err) {
        if (isManuscriptUserError(err)) {
          return reply.code(400).send({ error: 'Bad Request', message: err.message, statusCode: 400 });
        }
        throw err;
      }
      const updated = await setManuscript(id, manuscript.relativePath, manuscript.sha256);

      return {
        project: toContract(updated ?? existing),
        manuscript: {
          relativePath: manuscript.relativePath,
          sha256: manuscript.sha256,
          sizeBytes: manuscript.sizeBytes,
          totalChapters: outline.chapters.length,
          totalEntries: outline.totalEntries,
          totalWords: outline.totalWords,
          warnings: outline.warnings,
        },
      };
    },
  );

  app.post(
    '/api/projects/:id/manifests',
    {
      // No body schema: must accept a bodyless POST (normal breakdown) and an
      // optional { force } for re-breakdown. force is read manually below.
      schema: {
        params: ProjectParamsSchema,
        response: { 200: ManifestSummaryResponseSchema, 400: ApiErrorSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const force = (request.body as { force?: boolean } | undefined)?.force === true;
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      if (!project.manuscriptPath) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No manuscript on file. Upload one first.',
          statusCode: 400,
        });
      }

      const { getProjectStorage } = await import('../services/storage/project-storage.js');
      let buf: Buffer;
      try {
        buf = await getProjectStorage().readProjectFile(project.manuscriptPath);
      } catch (error) {
        if (isNativeError(error) && 'code' in error && error.code === 'ENOENT') {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Stored manuscript file is missing. Re-upload the manuscript before generating manifests.',
            statusCode: 404,
          });
        }
        throw error;
      }
      const markdown = buf.toString('utf8');

      try {
        const config = parseProjectConfig(project);
        const summary = await generateManifests({ projectId: id, manuscriptMarkdown: markdown, config, replace: force });
        // Re-breakdown invalidates any prior plan + approvals (pages were deleted),
        // so clear the stale plan snapshot and chapter approvals.
        if (force && (config.planMeta || Object.keys(config.layoutApprovals ?? {}).length > 0 || config.pageQualityReview)) {
          await updateProjectConfig(id, {
            ...config,
            planMeta: undefined,
            layoutApprovals: {},
            pageQualityReview: undefined,
            pageQualityResolutions: {},
          });
        }
        const updated = await setProjectStatus(id, 'MANIFESTED');

        return { project: toContract(updated ?? project), summary };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('already has manifests/pages')) {
          return reply.code(409).send({ error: 'Conflict', message, statusCode: 409 });
        }
        throw error;
      }
    },
  );

  app.get(
    '/api/projects/:id/manifests',
    { schema: { params: ProjectParamsSchema, response: { 200: ManifestsListResponseSchema } } },
    async (request) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const rows = await listManifests(id);
      return {
        manifests: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          externalId: r.externalId,
          version: r.version,
          content: r.content,
        })),
      };
    },
  );

  const ReplanConfirmationSchema = z.object({
    error: z.string(),
    message: z.string(),
    statusCode: z.number(),
    needsConfirmation: z.boolean(),
    approvedPages: z.number(),
    approvedImages: z.number(),
  });
  app.post(
    '/api/projects/:id/plan',
    {
      // No body schema on purpose: this route must accept a bodyless POST (the
      // common "just plan" call) as well as an optional { mode } for re-plan
      // confirmation. A strict body schema rejects a null body. mode is read
      // manually below.
      schema: {
        params: ProjectParamsSchema,
        response: { 200: PlanPagesResponseSchema, 400: ApiErrorSchema, 404: ApiErrorSchema, 409: ReplanConfirmationSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      const rows = await listManifests(id, 'PAGE');
      if (rows.length === 0) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No page manifests found. Generate manifests before planning pages.',
          statusCode: 400,
        });
      }

      // Priority #2 — Approval protection. Re-planning rewrites every page and
      // resets status to PLANNED + clears chapter approvals. If approved work
      // exists, require an explicit choice instead of silently destroying it.
      const mode = (request.body as { mode?: 'skip-approved' | 'replan-all' } | undefined)?.mode;
      const existingPages = await listPages(id);
      const approvedPageRows = existingPages.filter((p) => p.status === 'APPROVED' || p.status === 'PRINT_READY');
      let approvedImages = 0;
      if (approvedPageRows.length > 0) {
        const imgs = await listImagesForProject(id);
        approvedImages = imgs.filter((r) => r.image.status === 'APPROVED' || r.image.status === 'PRINT_READY').length;
      }
      if (approvedPageRows.length > 0 && mode !== 'skip-approved' && mode !== 'replan-all') {
        return reply.code(409).send({
          error: 'Conflict',
          message: `Re-planning will reset ${approvedPageRows.length} approved page(s)${approvedImages ? ` and ${approvedImages} approved image(s)` : ''} back to review. Choose how to proceed.`,
          statusCode: 409,
          needsConfirmation: true,
          approvedPages: approvedPageRows.length,
          approvedImages,
        });
      }
      const skipApprovedKeys =
        mode === 'skip-approved' ? new Set(approvedPageRows.map((p) => p.pageKey)) : new Set<string>();

      const config = parseProjectConfig(project);
      const layoutLibrary = validateLayoutLibrary(config);
      const plannedPages = [];
      for (const row of rows) {
        const page = PageManifestSchema.parse(row.content);
        const decision = planPage(page, config);
        if (skipApprovedKeys.has(decision.pageKey)) continue; // leave approved page untouched
        await updatePagePlanning(id, decision.pageKey, {
          layoutTemplate: decision.layoutTemplate,
          imagePrompt: decision.prompt,
          imagePromptSha256: decision.promptSha256,
        });
        plannedPages.push({
          pageKey: decision.pageKey,
          entryTitle: decision.entryTitle,
          wordCount: decision.wordCount,
          contentType: decision.contentType,
          contentTypePurpose: decision.contentTypePurpose,
          contentTypeUsedFor: decision.contentTypeUsedFor,
          multiSubject: decision.multiSubject,
          coverage: decision.coverage,
          architecture: decision.architecture,
          layoutTemplate: decision.layoutTemplate,
          layoutReferenceLabel: decision.layoutReferenceLabel,
          promptSha256: decision.promptSha256,
          promptReady: decision.promptReady,
          reasonCodes: decision.reasonCodes,
          blockers: decision.blockers,
          warnings: decision.warnings,
          layoutInstructions: decision.layoutInstructions,
          capacity: decision.capacity,
          typography: decision.typography,
          artBrief: decision.artBrief,
          agent: decision.agent,
          textFitStatus: decision.textFitStatus,
          decisionTrace: decision.decisionTrace,
        });
      }

      // Priority #1 — stamp the planning-relevant config so staleness can be
      // detected later. Keep chapter approvals only when we skipped approved work.
      const planMeta = {
        standardLabel: config.publishingStandard.label,
        format: config.publishingStandard.format,
        trimSize: config.trimSize,
        bodyPt: config.typography.bodyPt,
        lineHeight: config.typography.lineHeight,
        plannedAt: new Date().toISOString(),
      };
      const layoutApprovals = mode === 'skip-approved' ? (config.layoutApprovals ?? {}) : {};
      const clearedConfig = { ...config, layoutApprovals, planMeta, pageQualityReview: undefined, pageQualityResolutions: {} };
      await updateProjectConfig(id, clearedConfig);
      const updated = await setProjectStatus(id, 'PLANNED');
      return { project: toContract(updated ?? project), layoutLibrary, plannedPages };
    },
  );

  // Operator/validation override: force a specific layout template onto ONE page,
  // re-plan just that page through the full-page-artwork prompt, and invalidate the
  // chapter's layout approval so it must be re-approved before any image spend.
  // Mirrors the internal automated-quality-fix path (planPage + updatePagePlanning).
  const ForceLayoutBodySchema = z.object({ layoutTemplate: LayoutTemplateIdSchema });
  const ForceLayoutResponseSchema = z.object({
    pageKey: z.string(),
    layoutTemplate: z.string(),
    promptSha256: z.string(),
    warnings: z.array(z.string()),
  });
  app.post(
    '/api/projects/:id/pages/:pageKey/force-layout',
    {
      schema: {
        params: ProjectPageParamsSchema,
        body: ForceLayoutBodySchema,
        response: { 200: ForceLayoutResponseSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id, pageKey } = ProjectPageParamsSchema.parse(request.params);
      const { layoutTemplate } = ForceLayoutBodySchema.parse(request.body);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      const config = parseProjectConfig(project);
      const manifest = (await listManifests(id, 'PAGE'))
        .map((row) => PageManifestSchema.parse(row.content))
        .find((page) => page.pageId === pageKey);
      if (!manifest) return reply.code(404).send({ error: 'Not Found', message: `Page manifest ${pageKey} not found.`, statusCode: 404 });
      const decision = planPage(manifest, config, { forcedLayoutTemplate: layoutTemplate, reasonCode: 'operator_forced_layout' });
      await updatePagePlanning(id, pageKey, {
        layoutTemplate: decision.layoutTemplate,
        imagePrompt: decision.prompt,
        imagePromptSha256: decision.promptSha256,
      });
      // Invalidate the chapter's layout approval — the prompt changed, so the
      // chapter must be re-approved before image generation (spend guard).
      const pageRow = (await listPages(id)).find((p) => p.pageKey === pageKey);
      if (pageRow) {
        const approvals = { ...(config.layoutApprovals ?? {}) };
        delete approvals[String(pageRow.chapterNumber)];
        await updateProjectConfig(id, { ...config, layoutApprovals: approvals });
      }
      return {
        pageKey,
        layoutTemplate: decision.layoutTemplate,
        promptSha256: decision.promptSha256,
        warnings: decision.warnings,
      };
    },
  );

  // Page Generation Inspector — read-only construction chain for ONE page.
  // Deterministic (planPage + analyzeTextFit are pure); never mutates or re-plans.
  // Reflects the page's persisted layout override so it matches what will render.
  app.get(
    '/api/projects/:id/pages/:pageKey/inspector',
    {
      schema: {
        params: ProjectPageParamsSchema,
        response: { 200: PageInspectorResponseSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id, pageKey } = ProjectPageParamsSchema.parse(request.params);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      const config = parseProjectConfig(project);

      const manifest = (await listManifests(id, 'PAGE'))
        .map((row) => PageManifestSchema.parse(row.content))
        .find((page) => page.pageId === pageKey);
      if (!manifest) return reply.code(404).send({ error: 'Not Found', message: `Page manifest ${pageKey} not found.`, statusCode: 404 });

      const pageRow = (await listPages(id)).find((p) => p.pageKey === pageKey);
      const forced = LayoutTemplateIdSchema.safeParse(pageRow?.layoutTemplate);
      const decision = planPage(
        manifest,
        config,
        forced.success ? { forcedLayoutTemplate: forced.data, reasonCode: 'persisted_page_layout_override' } : {},
      );

      const geometry = computePageGeometry(config.trimSize);
      const fit = analyzeTextFit({
        bodyMarkdown: manifest.bodyMarkdown,
        layoutTemplate: decision.layoutTemplate,
        geometry,
        bodyPt: decision.typography.bodyPt,
        lineHeight: decision.typography.lineHeight,
      });

      const imageRows = pageRow ? await listImagesForPage(pageRow.id) : [];

      // Blueprint existence: a small PNG; cheap to probe. Absent until a blueprint
      // generation has run for this page.
      let blueprintAvailable = false;
      try {
        await getProjectStorage().readProjectFile(`${id}/blueprints/${pageKey}.png`);
        blueprintAvailable = true;
      } catch {
        blueprintAvailable = false;
      }

      return {
        page: {
          pageId: pageRow?.id ?? '',
          pageKey,
          entryTitle: decision.entryTitle,
          scientificName: manifest.scientificName ?? null,
          chapterNumber: pageRow?.chapterNumber ?? manifest.chapterNumber,
          status: pageRow?.status ?? 'PLANNED',
        },
        manuscript: {
          bodyMarkdown: manifest.bodyMarkdown,
          imageSubject: manifest.imageSubject,
          wordCount: decision.wordCount,
        },
        manifestStage: (() => {
          const c = getAgentContract('MANUSCRIPT_ANALYST');
          return {
            agentId: c.id,
            name: c.name,
            mission: c.mission,
            expertFrame: c.expertFrame,
            hardRules: c.hardRules,
            requiredOutputs: c.requiredOutputs,
            runtime: c.runtime,
            realityNote: c.realityNote,
          };
        })(),
        layout: {
          template: decision.layoutTemplate,
          label: decision.layoutReferenceLabel,
          contentType: decision.contentType,
          coverage: decision.coverage,
          architecture: decision.artBrief.architecture,
          layoutInstructions: decision.layoutInstructions,
          decisionTrace: decision.decisionTrace,
          capacity: decision.capacity,
          artBrief: {
            imagePercent: decision.artBrief.imagePercent,
            textPercent: decision.artBrief.textPercent,
            placement: decision.artBrief.placement,
            textPlacement: decision.artBrief.textPlacement,
            architecture: decision.artBrief.architecture,
            textSafeZones: decision.artBrief.textSafeZones,
            typographyZones: decision.artBrief.typographyZones,
            imagePriorityZones: decision.artBrief.imagePriorityZones,
            imagePriorityZone: decision.artBrief.imagePriorityZone,
          },
        },
        typography: {
          bodyFont: decision.typography.bodyFont,
          bodyPt: decision.typography.bodyPt,
          lineHeight: decision.typography.lineHeight,
          wordsPerOpeningPage: fit.allocation.wordsPerOpeningPage,
          wordsPerContinuationPage: fit.allocation.wordsPerContinuationPage,
          estimatedRenderedPages: fit.estimatedRenderedPages,
          fit: {
            status: fit.status,
            fits: fit.fits,
            charCount: fit.charCount,
            capacityChars: fit.capacityChars,
            fillRatio: fit.fillRatio,
            estimatedLines: fit.estimatedLines,
            usableLines: fit.usableLines,
            estimatedRenderedPages: fit.estimatedRenderedPages,
            notes: fit.notes,
          },
        },
        prompt: {
          text: decision.prompt,
          sha256: decision.promptSha256,
          ready: decision.promptReady,
          blockers: decision.blockers,
          warnings: decision.warnings,
        },
        images: imageRows.map((img) => ({
          version: img.version,
          status: img.status,
          active: img.active,
          prompt: img.prompt,
          promptSha256: img.promptSha256,
          widthPx: img.widthPx ?? null,
          heightPx: img.heightPx ?? null,
          generatedPath: img.generatedPath ?? null,
          upscaledPath: img.upscaledPath ?? null,
        })),
        model: getEnv().OPENAI_IMAGE_MODEL,
        blueprint: {
          available: blueprintAvailable,
          url: pageRow ? `/api/pages/${pageRow.id}/blueprint` : '',
          instruction: BLUEPRINT_COMPOSITION_INSTRUCTION,
        },
        renderEndpoint: `/api/projects/${id}/pages/${pageKey}/render`,
      };
    },
  );

  app.get(
    '/api/projects/:id/pages',
    { schema: { params: ProjectParamsSchema, response: { 200: PagesListResponseSchema, 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      const rows = await listPages(id);
      return {
        pages: rows.map((p) => ({
          id: p.id,
          pageKey: p.pageKey,
          chapterNumber: p.chapterNumber,
          plannedPageNumber: p.plannedPageNumber,
          layoutTemplate: p.layoutTemplate,
          imagePrompt: p.imagePrompt,
          imagePromptSha256: p.imagePromptSha256,
          status: p.status,
        })),
        layoutApprovals: getLayoutApprovals(project),
      };
    },
  );

  app.post(
    '/api/projects/:id/text-fit-preview',
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: TextFitPreviewResponseSchema, 400: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const rows = await listManifests(id, 'PAGE');
      if (rows.length === 0) {
        const project = await getProject(id);
        if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No page manifests found. Generate manifests before running a text-fit preview.',
          statusCode: 400,
        });
      }
      return previewProjectTextFit(id);
    },
  );

  app.post(
    '/api/projects/:id/chapters/:chapterNumber/format-calibration',
    {
      schema: {
        params: ChapterFormatCalibrationParamsSchema,
        response: { 200: FormatCalibrationResponseSchema, 400: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id, chapterNumber } = ChapterFormatCalibrationParamsSchema.parse(request.params);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      const rows = await listManifests(id, 'PAGE');
      if (rows.length === 0) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Generate the chapter/page breakdown before running format calibration.',
          statusCode: 400,
        });
      }
      const chapterRows = rows.filter((row) => PageManifestSchema.parse(row.content).chapterNumber === chapterNumber);
      if (chapterRows.length === 0) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Chapter ${chapterNumber} has no page entries to calibrate.`,
          statusCode: 404,
        });
      }

      const report = await calibrateProjectChapterFormats(id, chapterNumber);
      if (!report) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      return report;
    },
  );

  app.post(
    '/api/projects/:id/page-quality-review',
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: PageQualityReviewResponseSchema, 400: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const rows = await listManifests(id, 'PAGE');
      if (rows.length === 0) {
        const project = await getProject(id);
        if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No page manifests found. Generate manifests before running Page Quality Review.',
          statusCode: 400,
        });
      }
      const review = await reviewProjectPageQuality(id);
      if (!review) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      const project = await getProject(id);
      if (project) {
        const config = parseProjectConfig(project);
        await updateProjectConfig(id, {
          ...config,
          pageQualityReview: { reviewedAt: new Date().toISOString(), review },
        });
        return withQualityResolutions(review, config);
      }
      return review;
    },
  );

  app.get(
    '/api/projects/:id/publishing-director/decision-ledger',
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: PublishingDirectorDecisionLedgerResponseSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const ledger = await buildPublishingDirectorDecisionLedger(id);
      if (!ledger) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      return ledger;
    },
  );

  app.post(
    '/api/projects/:id/page-quality-resolutions',
    {
      schema: {
        params: ProjectParamsSchema,
        body: ResolvePageQualityFindingBodySchema,
        response: { 200: PageQualityReviewResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const body = ResolvePageQualityFindingBodySchema.parse(request.body);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      const config = parseProjectConfig(project);
      if ((body.status === 'DEFERRED' || body.status === 'OVERRIDDEN') && !body.note?.trim()) {
        return reply.code(409).send({
          error: 'Conflict',
          message: `${body.status === 'DEFERRED' ? 'Defer' : 'Override'} requires a short operator reason.`,
          statusCode: 409,
        });
      }

      let nextConfig = config;
      let action: PageQualityResolution['action'];
      if (body.status === 'FIXED') {
        const review = await reviewProjectPageQuality(id);
        const finding = review?.findings.find((candidate) => candidate.findingId === body.findingId);
        if (!finding) {
          return reply.code(404).send({ error: 'Not Found', message: 'Page Quality finding not found. Refresh Page Quality Review.', statusCode: 404 });
        }
        const fix = await applyAutomatedPageQualityFix(id, config, finding);
        if (!fix) {
          return reply.code(409).send({
            error: 'Conflict',
            message: 'No automatic fix is available for this finding yet. Accept, defer, override, or adjust the page plan manually.',
            statusCode: 409,
          });
        }
        nextConfig = fix.config;
        action = fix.action;
      }

      const resolution = PageQualityResolutionSchema.parse({
        findingId: body.findingId,
        status: body.status,
        note: body.note?.trim() || undefined,
        action,
        resolvedAt: new Date().toISOString(),
        resolvedBy: 'operator',
      });
      nextConfig = {
        ...nextConfig,
        pageQualityResolutions: {
          ...(nextConfig.pageQualityResolutions ?? {}),
          [body.findingId]: resolution,
        },
      };
      await updateProjectConfig(id, nextConfig);
      const review = await reviewProjectPageQuality(id);
      if (!review) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      return withQualityResolutions(review, nextConfig);
    },
  );

  app.post(
    '/api/projects/:id/chapters/:chapterNumber/layout-approval',
    {
      schema: {
        params: ChapterLayoutApprovalParamsSchema,
        response: { 200: ChapterLayoutApprovalResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id, chapterNumber } = ChapterLayoutApprovalParamsSchema.parse(request.params);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      const pageRows = (await listPages(id)).filter((page) => page.chapterNumber === chapterNumber);
      if (pageRows.length === 0) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Chapter ${chapterNumber} has no page rows to approve.`,
          statusCode: 404,
        });
      }

      const unplanned = pageRows.filter((page) => !page.layoutTemplate || !page.imagePrompt || !page.imagePromptSha256);
      if (unplanned.length > 0) {
        return reply.code(409).send({
          error: 'Conflict',
          message: `Chapter ${chapterNumber} still has ${unplanned.length} unplanned page(s). Run Page Plan before approval.`,
          statusCode: 409,
        });
      }

      const preview = await previewProjectTextFit(id);
      const pageKeys = new Set(pageRows.map((page) => page.pageKey));
      const chapterPreview = preview.pages.filter((page) => pageKeys.has(page.pageKey));
      if (chapterPreview.length !== pageRows.length) {
        return reply.code(409).send({
          error: 'Conflict',
          message: `Chapter ${chapterNumber} text-fit preview does not match the persisted page rows. Re-run Page Plan before approval.`,
          statusCode: 409,
        });
      }
      // Only genuine planning blockers (missing/unresolved image prompt) hard-block
      // approval. "Overflow" just means an entry's text spans multiple pages — the
      // Paged.js render flows it cleanly (verified, no text lost), so it's recorded
      // as a warning in the summary, not a gate.
      const blockers = chapterPreview.filter((page) => page.blockers.length > 0);
      if (blockers.length > 0) {
        return reply.code(409).send({
          error: 'Conflict',
          message: `Chapter ${chapterNumber} is not ready: ${blockers.length} page(s) have planning blockers (missing or unresolved image prompt). Re-run Page Plan.`,
          statusCode: 409,
        });
      }

      const textFitSummary = chapterPreview.reduce(
        (totals, page) => {
          totals.pages += 1;
          if (page.fit.status === 'FITS') totals.fits += 1;
          else if (page.fit.status === 'TIGHT') totals.tight += 1;
          else if (page.fit.status === 'OVERFLOW') totals.overflow += 1;
          else totals.underfilled += 1;
          return totals;
        },
        { pages: 0, fits: 0, tight: 0, overflow: 0, underfilled: 0 },
      );

      const config = parseProjectConfig(project);
      const qualityReview = await reviewProjectPageQuality(id);
      if (!qualityReview) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Run Page Quality Review before approving layouts.',
          statusCode: 409,
        });
      }
      const unresolvedQuality = unresolvedChapterQualityFindings(qualityReview, config, chapterNumber, pageKeys);
      if (unresolvedQuality.length > 0) {
        return reply.code(409).send({
          error: 'Conflict',
          message: `Chapter ${chapterNumber} has ${unresolvedQuality.length} unresolved Page Quality finding(s). Accept, fix, defer, or override them before layout approval.`,
          statusCode: 409,
        });
      }

      const approval = LayoutApprovalSchema.parse({
        status: 'APPROVED',
        chapterNumber,
        approvedAt: new Date().toISOString(),
        approvedBy: 'operator',
        pageKeys: pageRows.map((page) => page.pageKey),
        promptSha256ByPage: Object.fromEntries(pageRows.map((page) => [page.pageKey, page.imagePromptSha256!])),
        textFitSummary,
      });
      const layoutApprovals = {
        ...(config.layoutApprovals ?? {}),
        [String(chapterNumber)]: approval,
      };
      await updateProjectConfig(id, { ...config, layoutApprovals });

      return { approval, layoutApprovals };
    },
  );

  // Simple cost estimate: images generated x flat average $/image.
  const CostEstimateResponseSchema = z.object({
    imageCount: z.number(),
    avgCostPerImageUsd: z.number(),
    estimatedCostUsd: z.number(),
  });
  app.get(
    '/api/projects/:id/cost-estimate',
    { schema: { params: ProjectParamsSchema, response: { 200: CostEstimateResponseSchema } } },
    async (request) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const imageCount = await countImagesForProject(id);
      return estimateCost(imageCount);
    },
  );

  const ImageLibraryQuerySchema = z.object({
    q: z.string().optional(),
    status: z.string().optional(),
    layout: z.string().optional(),
    chapter: z.coerce.number().int().positive().optional(),
  });
  const ImageLibraryResponseSchema = z.object({
    total: z.number(),
    assets: z.array(
      z.object({
        imageId: z.string(),
        version: z.number(),
        status: z.string(),
        active: z.boolean(),
        createdAt: z.string(),
        updatedAt: z.string(),
        generatedPath: z.string().nullable(),
        upscaledPath: z.string().nullable(),
        previewUrl: z.string(),
        widthPx: z.number().nullable(),
        heightPx: z.number().nullable(),
        dpiW: z.number().nullable(),
        dpiH: z.number().nullable(),
        prompt: z.string(),
        promptSha256: z.string(),
        source: z.object({
          pageId: z.string(),
          pageKey: z.string(),
          chapterNumber: z.number(),
          plannedPageNumber: z.number(),
          entryTitle: z.string(),
          imageSubject: z.string().nullable(),
          contentType: z.string().nullable(),
          layoutTemplate: z.string().nullable(),
          pageStatus: z.string(),
        }),
        coverage: z
          .object({
            imagePercent: z.number(),
            textPercent: z.number(),
            placement: z.string(),
            placementLabel: z.string(),
            repeatable: z.boolean(),
            summary: z.string(),
          })
          .nullable(),
        compatibility: z.array(z.string()),
        tags: z.array(z.string()),
      }),
    ),
  });
  app.get(
    '/api/projects/:id/image-library',
    { schema: { params: ProjectParamsSchema, querystring: ImageLibraryQuerySchema, response: { 200: ImageLibraryResponseSchema } } },
    async (request) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const query = ImageLibraryQuerySchema.parse(request.query ?? {});
      const rows = await listImagesForProject(id);
      const q = query.q?.trim().toLowerCase();
      const assets = rows
        .map((row) => {
          const manifest = PageManifestSchema.safeParse(row.manifestContent);
          const content = manifest.success ? manifest.data : undefined;
          const entryTitle = content?.entryTitle ?? row.page.pageKey;
          const imageSubject = content?.imageSubject ?? null;
          const contentType = content?.contentType ?? null;
          const layoutTemplate = row.page.layoutTemplate ?? content?.layoutTemplate ?? null;
          const compatibility = layoutCompatibilityLabels(layoutTemplate, contentType ?? undefined);
          const coverage = layoutTemplate ? layoutCoverageMeta(layoutTemplate as LayoutTemplateId) : null;
          const tags = [
            `chapter-${row.page.chapterNumber}`,
            row.page.pageKey,
            row.image.status.toLowerCase(),
            ...(layoutTemplate ? [layoutTemplate] : []),
            ...(contentType ? [contentType] : []),
          ];
          return {
            imageId: row.image.id,
            version: row.image.version,
            status: row.image.status,
            active: row.image.active,
            createdAt: row.image.createdAt.toISOString(),
            updatedAt: row.image.updatedAt.toISOString(),
            generatedPath: row.image.generatedPath,
            upscaledPath: row.image.upscaledPath,
            previewUrl: `/api/images/${row.image.id}/file`,
            widthPx: row.image.widthPx,
            heightPx: row.image.heightPx,
            dpiW: row.image.dpiW,
            dpiH: row.image.dpiH,
            prompt: row.image.prompt,
            promptSha256: row.image.promptSha256,
            source: {
              pageId: row.page.id,
              pageKey: row.page.pageKey,
              chapterNumber: row.page.chapterNumber,
              plannedPageNumber: row.page.plannedPageNumber,
              entryTitle,
              imageSubject,
              contentType,
              layoutTemplate,
              pageStatus: row.page.status,
            },
            coverage,
            compatibility,
            tags,
          };
        })
        .filter((asset) => {
          if (query.status && asset.status !== query.status) return false;
          if (query.layout && asset.source.layoutTemplate !== query.layout) return false;
          if (query.chapter && asset.source.chapterNumber !== query.chapter) return false;
          if (!q) return true;
          const haystack = [
            asset.source.pageKey,
            asset.source.entryTitle,
            asset.source.imageSubject ?? '',
            asset.source.contentType ?? '',
            asset.source.layoutTemplate ?? '',
            asset.status,
            asset.prompt,
            asset.compatibility.join(' '),
            asset.tags.join(' '),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(q);
        });
      return { total: assets.length, assets };
    },
  );

  app.get(
    '/api/projects/:id/chapters/:chapterNumber/operator-intelligence',
    {
      schema: {
        params: ChapterOperatorIntelligenceParamsSchema,
        response: {
          200: OperatorChapterIntelligenceResponseSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id, chapterNumber } = ChapterOperatorIntelligenceParamsSchema.parse(request.params);
      const intelligence = await getChapterOperatorIntelligence(id, chapterNumber);
      if (!intelligence) {
        return reply.code(404).send({
          error: 'Chapter Not Found',
          message: `No chapter ${chapterNumber} manifest exists for this project.`,
          statusCode: 404,
        });
      }
      return intelligence;
    },
  );

  app.get(
    '/api/projects/:id/production-dashboard',
    {
      schema: {
        params: ProjectParamsSchema,
        response: {
          200: ProductionDashboardResponseSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const dashboard = await getProjectProductionDashboard(id);
      if (!dashboard) {
        return reply.code(404).send({
          error: 'Project Not Found',
          message: 'Project not found.',
          statusCode: 404,
        });
      }
      return dashboard;
    },
  );

  app.get(
    '/api/projects/:id/proof-artifacts',
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: ProofArtifactsResponseSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Project Not Found', message: 'Project not found.', statusCode: 404 });
      const config = parseProjectConfig(project);
      return { artifacts: config.proofArtifacts ?? [] };
    },
  );

  app.get('/api/projects/:id/proof-artifacts/:artifactId/file', async (request, reply) => {
    const { id, artifactId } = ProofArtifactParamsSchema.parse(request.params);
    const project = await getProject(id);
    if (!project) return reply.code(404).send({ error: 'Project Not Found', message: 'Project not found.', statusCode: 404 });
    const config = parseProjectConfig(project);
    const artifact = (config.proofArtifacts ?? []).find((candidate) => candidate.id === artifactId);
    if (!artifact) return reply.code(404).send({ error: 'Not Found', message: 'Proof artifact not found.', statusCode: 404 });
    const pdf = await getProjectStorage().readProjectFile(artifact.storagePath);
    reply.header('content-type', 'application/pdf');
    reply.header('content-disposition', `inline; filename="${artifact.id}.pdf"`);
    reply.header('x-total-pages', String(artifact.totalPages));
    reply.header('x-proof-artifact-id', artifact.id);
    reply.header('x-proof-created-at', artifact.createdAt);
    return reply.send(pdf);
  });

  function renderErrorStatus(code: string): 404 | 409 | 503 {
    if (code === 'not_found') return 404;
    if (code === 'no_chromium') return 503;
    return 409;
  }

  // Stage 6 — render one chapter to a PDF (uses approved/upscaled art, else clean
  // placeholders so it works before images exist). Returns the PDF binary.
  app.post('/api/projects/:id/pages/:pageKey/render', async (request, reply) => {
    const { id, pageKey } = ProjectPageParamsSchema.parse(request.params);
    try {
      const { pdf, totalPages, artifact } = await renderPagePdf(id, pageKey);
      if ((request.query as { format?: string } | undefined)?.format === 'json') {
        return reply.send({ ok: true, pageKey, totalPages, bytes: pdf.byteLength, artifact });
      }
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', `inline; filename="${pageKey}.pdf"`);
      reply.header('x-total-pages', String(totalPages));
      if (artifact) {
        reply.header('x-proof-artifact-id', artifact.id);
        reply.header('x-proof-created-at', artifact.createdAt);
      }
      return reply.send(pdf);
    } catch (error) {
      if (error instanceof RenderBlockedError) {
        const status = renderErrorStatus(error.code);
        return reply.code(status).send({ error: 'Render Blocked', message: error.message, statusCode: status });
      }
      throw error;
    }
  });

  const RenderChapterParamsSchema = z.object({ id: z.string().uuid(), chapterNumber: z.coerce.number().int().positive() });
  app.post('/api/projects/:id/chapters/:chapterNumber/render', async (request, reply) => {
    const { id, chapterNumber } = RenderChapterParamsSchema.parse(request.params);
    try {
      const { pdf, totalPages, artifact } = await renderChapterPdf(id, chapterNumber);
      if ((request.query as { format?: string } | undefined)?.format === 'json') {
        return reply.send({ ok: true, chapterNumber, totalPages, bytes: pdf.byteLength, artifact });
      }
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', `inline; filename="chapter-${chapterNumber}.pdf"`);
      reply.header('x-total-pages', String(totalPages));
      if (artifact) {
        reply.header('x-proof-artifact-id', artifact.id);
        reply.header('x-proof-created-at', artifact.createdAt);
      }
      return reply.send(pdf);
    } catch (error) {
      if (error instanceof RenderBlockedError) {
        const status = renderErrorStatus(error.code);
        return reply.code(status).send({ error: 'Render Blocked', message: error.message, statusCode: status });
      }
      throw error;
    }
  });

  // Stage 7 — render every chapter, stitch into the interior book PDF, run KDP
  // preflight, store it, record the export. ?format=json returns the preflight report.
  app.post('/api/projects/:id/render-book', async (request, reply) => {
    const { id } = ProjectParamsSchema.parse(request.params);
    try {
      const result = await renderBookPdf(id);
      if ((request.query as { format?: string } | undefined)?.format === 'json') {
        return reply.send({
          ok: result.preflight.passed,
          pageCount: result.pageCount,
          chaptersRendered: result.chaptersRendered,
          storedPath: result.storedPath,
          artifact: result.artifact,
          preflight: result.preflight,
        });
      }
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', 'inline; filename="wildlands-book.pdf"');
      reply.header('x-page-count', String(result.pageCount));
      reply.header('x-preflight-passed', String(result.preflight.passed));
      if (result.artifact) {
        reply.header('x-proof-artifact-id', result.artifact.id);
        reply.header('x-proof-created-at', result.artifact.createdAt);
      }
      return reply.send(result.pdf);
    } catch (error) {
      if (error instanceof RenderBlockedError) {
        const status = renderErrorStatus(error.code);
        return reply.code(status).send({ error: 'Render Blocked', message: error.message, statusCode: status });
      }
      throw error;
    }
  });

  app.post('/api/projects/:id/generate-cover-artwork', async (request, reply) => {
    const { id } = ProjectParamsSchema.parse(request.params);
    try {
      const body = z.object({ chapters: z.array(z.number().int().positive()).optional() }).default({}).parse(request.body ?? {});
      const result = await generateCoverWrapArtwork(id, { chapters: body.chapters });
      return reply.send({
        ok: true,
        pageCount: result.pageCount,
        scopeChapters: result.scopeChapters,
        dimensions: result.dimensions,
        imagePath: result.imagePath,
        promptPath: result.promptPath,
        promptPreview: result.promptPreview,
        widthPx: result.widthPx,
        heightPx: result.heightPx,
        model: result.model,
      });
    } catch (error) {
      if (error instanceof RenderBlockedError) {
        const status = renderErrorStatus(error.code);
        return reply.code(status).send({ error: 'Render Blocked', message: error.message, statusCode: status });
      }
      throw error;
    }
  });

  // Stage 7 — render the print-ready full-wrap cover PDF (spine width from the
  // interior page count). Returns the cover PDF inline.
  app.post('/api/projects/:id/render-cover', async (request, reply) => {
    const { id } = ProjectParamsSchema.parse(request.params);
    try {
      const body = z.object({ chapters: z.array(z.number().int().positive()).optional() }).default({}).parse(request.body ?? {});
      const result = await renderCoverPdf(id, { chapters: body.chapters });
      if ((request.query as { format?: string } | undefined)?.format === 'json') {
        return reply.send({
          ok: true,
          pageCount: result.pageCount,
          scopeChapters: result.scopeChapters,
          dimensions: result.dimensions,
          validation: result.validation,
          storedPath: result.storedPath,
          coverArtPromptPath: result.coverArtPromptPath,
          coverArtPromptPreview: result.coverArtPromptPreview,
          artifact: result.artifact,
        });
      }
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', 'inline; filename="wildlands-cover.pdf"');
      reply.header('x-page-count', String(result.pageCount));
      reply.header('x-cover-width-in', String(result.dimensions.fullWidthIn));
      reply.header('x-cover-height-in', String(result.dimensions.fullHeightIn));
      reply.header('x-spine-width-in', String(result.dimensions.spineIn));
      if (result.artifact) {
        reply.header('x-proof-artifact-id', result.artifact.id);
        reply.header('x-proof-created-at', result.artifact.createdAt);
      }
      return reply.send(result.pdf);
    } catch (error) {
      if (error instanceof RenderBlockedError) {
        const status = renderErrorStatus(error.code);
        return reply.code(status).send({ error: 'Render Blocked', message: error.message, statusCode: status });
      }
      throw error;
    }
  });
}
