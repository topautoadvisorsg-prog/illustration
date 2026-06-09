/**
 * Stage 1.75 — pagination orchestrator.
 *
 * Composes the pipeline: entries → stream → layout sequence → flow engine →
 * tail rebalance → final pages. Stateless / pure. The caller is responsible
 * for persisting the result.
 *
 * IMPORTANT: this module never touches the database directly. Persistence
 * lives in a separate repository function so the engine stays unit-testable
 * without a Postgres instance.
 *
 * See SPEC_PAGINATION_V1.md §5.
 */

import type { PageManifest, ProjectConfig, TrimSize } from '@wildlands/shared';
import { resolveGeometry } from '../publishing-standard/index.js';
import { buildLayoutSequence, type LayoutSequence } from './layout-sequence.js';
import { entriesToStream, type EntryBreakPolicy, type StreamToken } from './stream.js';
import { flowEngine, type EntryMeta, type EntryMetaMap } from './flow-engine.js';
import { rebalanceEntries } from './entry-rebalance.js';
import { tailRebalance } from './tail-rebalance.js';
import { expandLayoutAPairs } from './layout-a-pair.js';
import { PaginatedPageSchema, type PaginatedPage } from './types.js';

export type { PaginatedPage } from './types.js';

export interface PaginateProjectInput {
  /** Ordered PAGE manifests (one per Breakdown entry) for the project. */
  entries: PageManifest[];
  config: ProjectConfig;
  /** Trim size to use for capacity math. Caller usually passes config.trimSize. */
  trimSize?: TrimSize;
  /** Override the default entry-break policy (testing or per-project tuning). */
  policy?: EntryBreakPolicy;
}

export interface PaginateProjectResult {
  pages: PaginatedPage[];
  /** Provisional sequence used to seed the flow engine. The actual page-by-page
   *  layouts live on `pages[*].layoutTemplate` — the sequence is kept here for
   *  diagnostics + the Pagination Report API. */
  sequence: LayoutSequence;
  /** Token stream the flow consumed; kept for diagnostics (small projects only). */
  stream: StreamToken[];
  /** Engine + rebalance warnings (joined). */
  warnings: string[];
  summary: {
    totalEntries: number;
    totalPages: number;
    openers: number;
    continuations: number;
    compactions: number;
    fitDistribution: Record<PaginatedPage['fitStatus'], number>;
  };
}

function buildEntryMeta(entries: PageManifest[]): EntryMetaMap {
  const map = new Map<string, EntryMeta>();
  for (const entry of entries) {
    map.set(entry.pageId, {
      chapterNumber: entry.chapterNumber,
      imageSubject: entry.imageSubject,
      entryTitle: entry.entryTitle,
      contentType: entry.contentType,
    });
  }
  return map;
}

function summarize(pages: PaginatedPage[], entryCount: number): PaginateProjectResult['summary'] {
  const distribution: Record<PaginatedPage['fitStatus'], number> = {
    PENDING: 0,
    FITS: 0,
    TIGHT: 0,
    OVERFLOW: 0,
    UNDERFILL: 0,
  };
  let openers = 0;
  let continuations = 0;
  let compactions = 0;
  for (const page of pages) {
    distribution[page.fitStatus] += 1;
    if (page.pageRole === 'opener') openers += 1;
    else if (page.pageRole === 'continuation') continuations += 1;
    else if (page.pageRole === 'compacted') compactions += 1;
  }
  return {
    totalEntries: entryCount,
    totalPages: pages.length,
    openers,
    continuations,
    compactions,
    fitDistribution: distribution,
  };
}

/**
 * Paginate a project. Pure function — no side effects, no I/O. Returns the
 * full ordered list of `PaginatedPage` records ready for persistence.
 */
export function paginateProject(input: PaginateProjectInput): PaginateProjectResult {
  // Single source of truth (SPEC_GEOMETRY_RECONCILIATION §1): capacity math
  // uses the resolved trim — never a raw config default. An explicit override
  // (input.trimSize) is honored but must still be a supported trim.
  const trimSize = resolveGeometry({ trimSize: input.trimSize ?? input.config.trimSize }).trimSize;
  // CRITICAL: entries MUST be in book order (chapter, then page) before the
  // stream is built. The manifest query has no ORDER BY, so callers pass them
  // in Postgres-arbitrary order — which made compaction merge cross-chapter
  // neighbours (e.g. a Ch2 loon onto a Ch8 bushcraft page) and could scramble
  // the whole book. Sort here defensively so order never depends on the DB.
  const entries = [...input.entries].sort(
    (a, b) => a.chapterNumber - b.chapterNumber || a.pageNumber - b.pageNumber,
  );
  const entryMeta = buildEntryMeta(entries);
  const stream = entriesToStream(entries, { policy: input.policy });
  const sequence = buildLayoutSequence(entries, input.config);

  const flowResult = flowEngine(
    { stream, sequence, config: input.config, trimSize, policy: input.policy },
    entryMeta,
  );

  // Entry-rebalance (Patch B): the flow engine pours greedily so every full
  // page sits AT capacity — a cliff that small markdown↔stripped char drift
  // can push into OVERFLOW. This pass re-pours each multi-part STANDALONE
  // entry across its own parts (adding at most one continuation when needed)
  // so no page lands above ~85% fill while a sibling has slack. Pure;
  // skips compacted pages and never crosses entry/chapter boundaries.
  const entryRebalance = rebalanceEntries({
    pages: flowResult.pages,
    trimSize,
    bodyPt: input.config.typography.bodyPt,
    lineHeight: input.config.typography.lineHeight,
  });

  // Tail-rebalance v1: surface the candidate / orphan warning; reflow is not
  // performed automatically yet (deferred — the orchestrator stays simple, and
  // the operator can manually re-paginate after editing the layout sequence in
  // a future UI). The warning lets the operator know what could be improved.
  const rebalance = tailRebalance({ pages: entryRebalance.pages });

  // Assign global 1-based printed page numbers across the whole book. This is
  // the orchestrator's job — the flow engine doesn't know the final order
  // until tail-rebalance has run.
  const numbered = rebalance.pages.map((page, idx) => ({ ...page, plannedPageNumber: idx + 1 }));

  // Layout A pair expansion: insert a facing-illustration page after each
  // Layout A text chain. No-op when no Layout A entries are present (flag off
  // or unrelated content types), so the legacy 16-template flow is untouched.
  const paired = expandLayoutAPairs(numbered, input.config);

  // Runtime validation: a Zod parse before the result leaves the orchestrator
  // catches any engine bug that would otherwise silently land bad rows in the
  // pages table. Throws if any required field is missing or out of range.
  const validated = paired.map((p) => PaginatedPageSchema.parse(p));

  const warnings = [...flowResult.warnings, ...entryRebalance.warnings, ...rebalance.warnings];

  return {
    pages: validated,
    sequence,
    stream,
    warnings,
    summary: summarize(validated, input.entries.length),
  };
}
