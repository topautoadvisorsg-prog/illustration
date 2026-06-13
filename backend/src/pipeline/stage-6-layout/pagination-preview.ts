/**
 * Pagination preview — the TRUTHFUL Step-5 planning view.
 *
 * Shows the operator the SAME page records the production renderer will use: the
 * Stage-1.75 flow-engine paginated pages (opener + continuation pages), each with
 * its own allotted Reading-Field text measured against its own layout.
 *
 * This replaces the legacy text-fit-preview at Step 5, which re-ran the Stage-2
 * planner on the un-split per-entry manifests and therefore reported false
 * OVERFLOW + missing_layout_asset for any real-length section (e.g. a 5k-char
 * section shown as one 321%-full page instead of an opener + two continuations).
 *
 * The fit numbers and zone allocation come from the SAME analyzeTextFit the flow
 * engine used to split the text, and the status is the flow engine's own
 * persisted verdict (row.fitStatus) — so the preview can never disagree with what
 * production actually paginated.
 */

import type { LayoutTemplateId, ProjectConfig } from '@wildlands/shared';
import { ProjectConfigSchema } from '@wildlands/shared';
import { analyzeTextFit } from './text-fit.js';
import { computePageGeometry } from './page-geometry.js';
import { getProject } from '../../db/repositories/projects.repo.js';
import { getEntryMetaByKeys, listPaginatedPagesForProject } from '../../db/repositories/pagination.repo.js';

export interface PaginationPagePreview {
  pageKey: string;
  entryTitle: string;
  layoutTemplate: string;
  pageRole: string;
  partN: number;
  totalParts: number;
  /** Always empty here — this path has no Stage-2 layout-library gate. */
  blockers: string[];
  fit: {
    status: string;
    fits: boolean;
    charCount: number;
    capacityChars: number;
    fillRatio: number;
    estimatedLines: number;
    usableLines: number;
    estimatedRenderedPages: number;
    notes: string[];
  };
  allocation: ReturnType<typeof analyzeTextFit>['allocation'];
}

export interface ProjectPaginationPreview {
  geometry: { pageWidthIn: number; pageHeightIn: number; textWidthIn: number; textHeightIn: number };
  totals: { pages: number; fits: number; tight: number; overflow: number; underfill: number };
  /** True only when no body page overflows — the gate before image spend. */
  readyForImageSpend: boolean;
  pages: PaginationPagePreview[];
}

export async function previewProjectPagination(projectId: string): Promise<ProjectPaginationPreview> {
  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found');
  const config: ProjectConfig = ProjectConfigSchema.parse(project.config);
  const geometry = computePageGeometry(config.trimSize);

  // Pagination owns the BODY section; front/back matter is planned in Step 6.
  const rows = (await listPaginatedPagesForProject(projectId)).filter(
    (r) => ((r as { section?: string }).section ?? 'BODY') === 'BODY',
  );
  const entryKeys = [...new Set(rows.map((r) => r.entryKey ?? r.pageKey))];
  const meta = await getEntryMetaByKeys(projectId, entryKeys);

  const totals = { pages: rows.length, fits: 0, tight: 0, overflow: 0, underfill: 0 };
  const pages: PaginationPagePreview[] = [];

  for (const row of rows) {
    const text = row.readingFieldText ?? '';
    const layoutTemplate = (row.layoutTemplate ?? 'LAYOUT_1_STANDARD') as LayoutTemplateId;
    // Same analyzer the flow engine used to split — guarantees agreement.
    const fit = analyzeTextFit({
      bodyMarkdown: text,
      layoutTemplate,
      geometry,
      bodyPt: config.typography.bodyPt,
      lineHeight: config.typography.lineHeight,
    });
    // The flow engine's own persisted verdict is the source of truth for status.
    const status = String(row.fitStatus);
    if (status === 'FITS') totals.fits += 1;
    else if (status === 'TIGHT') totals.tight += 1;
    else if (status === 'OVERFLOW') totals.overflow += 1;
    else if (status === 'UNDERFILL') totals.underfill += 1;

    pages.push({
      pageKey: row.pageKey,
      entryTitle: meta.get(row.entryKey ?? row.pageKey)?.entryTitle ?? row.pageKey,
      layoutTemplate,
      pageRole: String(row.pageRole),
      partN: row.partN,
      totalParts: row.totalParts,
      blockers: [],
      fit: {
        status,
        fits: status === 'FITS' || status === 'TIGHT' || status === 'UNDERFILL',
        charCount: row.readingFieldChars ?? fit.charCount,
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
    pages,
  };
}
