/**
 * Stage 6 — text-fit preview orchestrator.
 *
 * What it does: for every planned page in a project, runs the Stage 2 planner to
 * get the layout decision and the deterministic text-fit analyzer to estimate
 * whether the body copy fits — BEFORE any image-generation spend. Returns an
 * operator-facing report with per-page status and an aggregate gate.
 *
 * The pure combiner `buildTextFitPreview` takes plain page manifests so it is
 * fully unit-testable; `previewProjectTextFit` is the thin DB-backed wrapper.
 */

import { LayoutTemplateIdSchema, PageManifestSchema, type LayoutTemplateId, type PageManifest, type ProjectConfig } from '@wildlands/shared';
import { planPage } from '../stage-2-planner/plan-pages.js';
import { computePageGeometry, type PageGeometry } from './page-geometry.js';
import { analyzeTextFit, type TextFitStatus } from './text-fit.js';
import { getProject } from '../../db/repositories/projects.repo.js';
import { listManifests, listPages } from '../../db/repositories/manifests.repo.js';

export interface PageFitPreview {
  pageKey: string;
  entryTitle: string;
  layoutTemplate: string;
  layoutReasonCodes: string[];
  promptReady: boolean;
  blockers: string[];
  fit: {
    status: TextFitStatus;
    fits: boolean;
    charCount: number;
    capacityChars: number;
    fillRatio: number;
    estimatedLines: number;
    usableLines: number;
    estimatedRenderedPages: number;
    notes: string[];
  };
  allocation: {
    architecture: string;
    imagePlacement: string;
    textPlacement: string;
    openingPageImagePercent: number;
    openingPageTextPercent: number;
    continuationPageImagePercent: number;
    continuationPageTextPercent: number;
    estimatedRenderedPages: number;
    wordsPerOpeningPage: number;
    wordsPerContinuationPage: number;
    textSafeZones: {
      id: string;
      role: string;
      shape: string;
      xPct: number;
      yPct: number;
      widthPct: number;
      heightPct: number;
      instruction: string;
    }[];
    typographyZones: {
      id: string;
      role: string;
      shape: string;
      xPct: number;
      yPct: number;
      widthPct: number;
      heightPct: number;
      instruction: string;
    }[];
    imagePriorityZones: {
      id: string;
      role: string;
      shape: string;
      xPct: number;
      yPct: number;
      widthPct: number;
      heightPct: number;
      instruction: string;
    }[];
    imagePriorityZone: {
      xIn: number;
      yIn: number;
      widthIn: number;
      heightIn: number;
      recommendedWidthPx: number;
      recommendedHeightPx: number;
      bleedPaddingPx: number;
      aspectRatio: string;
      overlaySafeArea: string;
    };
    /** @deprecated Use `imagePriorityZone`. */
    artBox: {
      xIn: number;
      yIn: number;
      widthIn: number;
      heightIn: number;
      recommendedWidthPx: number;
      recommendedHeightPx: number;
      bleedPaddingPx: number;
      aspectRatio: string;
      overlaySafeArea: string;
    };
    notes: string[];
  };
}

export interface ProjectTextFitPreview {
  geometry: {
    pageWidthIn: number;
    pageHeightIn: number;
    textWidthIn: number;
    textHeightIn: number;
  };
  totals: { pages: number; fits: number; tight: number; overflow: number; underfilled: number };
  /** True only when no page overflows — the gate before image spend. */
  readyForImageSpend: boolean;
  pages: PageFitPreview[];
}

export function buildTextFitPreview(
  pages: PageManifest[],
  config: ProjectConfig,
  layoutOverrides: Record<string, LayoutTemplateId> = {},
): ProjectTextFitPreview {
  const geometry: PageGeometry = computePageGeometry(config.trimSize);
  const previews: PageFitPreview[] = [];
  const totals = { pages: pages.length, fits: 0, tight: 0, overflow: 0, underfilled: 0 };

  for (const page of pages) {
    const forcedLayoutTemplate = layoutOverrides[page.pageId];
    const decision = planPage(
      page,
      config,
      forcedLayoutTemplate
        ? { forcedLayoutTemplate, reasonCode: 'persisted_page_layout_override' }
        : {},
    );
    const fit = analyzeTextFit({
      bodyMarkdown: page.bodyMarkdown,
      layoutTemplate: decision.layoutTemplate,
      geometry,
      bodyPt: decision.typography.bodyPt,
      lineHeight: decision.typography.lineHeight,
    });

    if (fit.status === 'FITS') totals.fits += 1;
    else if (fit.status === 'TIGHT') totals.tight += 1;
    else if (fit.status === 'OVERFLOW') totals.overflow += 1;
    else totals.underfilled += 1;

    previews.push({
      pageKey: page.pageId,
      entryTitle: page.entryTitle,
      layoutTemplate: decision.layoutTemplate,
      layoutReasonCodes: decision.reasonCodes,
      promptReady: decision.promptReady,
      blockers: decision.blockers,
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
      allocation: fit.allocation,
    });
  }

  return {
    geometry: {
      pageWidthIn: geometry.pageWidthIn,
      pageHeightIn: geometry.pageHeightIn,
      textWidthIn: geometry.textWidthIn,
      textHeightIn: geometry.textHeightIn,
    },
    totals,
    readyForImageSpend: totals.overflow === 0,
    pages: previews,
  };
}

export async function previewProjectTextFit(projectId: string): Promise<ProjectTextFitPreview> {
  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found');

  const manifestRows = await listManifests(projectId, 'PAGE');
  const pages = manifestRows
    .map((row) => PageManifestSchema.parse(row.content))
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const pageRows = await listPages(projectId);
  const layoutOverrides = Object.fromEntries(
    pageRows.flatMap((row) => {
      const parsed = LayoutTemplateIdSchema.safeParse(row.layoutTemplate);
      return parsed.success ? [[row.pageKey, parsed.data]] : [];
    }),
  );

  return buildTextFitPreview(pages, project.config as ProjectConfig, layoutOverrides);
}
