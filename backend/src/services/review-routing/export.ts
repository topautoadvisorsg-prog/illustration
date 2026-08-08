/**
 * REVIEW EXPORT — package page renders for review outside the platform.
 *
 * The operator drives forensic review by hand, in a chat UI, from files on
 * disk. That is a first-class workflow, not a fallback: subscription limits,
 * token budgets, and model choice all change, and the platform must never be
 * the reason a review cannot happen. So the platform's job is to organise
 * exactly which pages need which review and hand over the images.
 *
 * TWO RULES THIS FILE EXISTS TO ENFORCE
 *
 * 1. A reviewer must never be able to confuse which render they looked at.
 *    Every filename carries the page key AND the render version AND a slice of
 *    the render id. `CH04_P010_c1__v3__3ebb539b.png` can only be one artefact.
 *    Generic names like `page1.png` are how a verdict ends up attached to the
 *    wrong image.
 *
 * 2. The manifest is the bridge back to platform records. Without it, a chat
 *    transcript full of verdicts is unattributable and the review is wasted.
 *
 * Planning is pure and testable. IO lives in review-export.service.ts.
 */
import { classifyReviewRoute, type PageRoutingInput, type ReviewRoute, type ReviewRoutingPolicy } from './policy.js';

/** ~9 pages per batch worked well in the blinded beta: enough context for the
 *  reviewer to stay calibrated, small enough to upload and to keep a chat
 *  session focused. Configurable — this is a starting default, not a law. */
export const DEFAULT_BATCH_SIZE = 9;

export type ReviewStatus = 'UNREVIEWED' | 'APPROVED' | 'ISSUE_FOUND' | 'UNCERTAIN';

export interface ExportablePage extends PageRoutingInput {
  pageKey: string;
  pageId: string;
  renderId: string | null;
  renderVersion: number | null;
  imagePath: string | null;
  chapterNumber: number | null;
  plannedPageNumber: number | null;
  spineOrder: number | null;
  reviewStatus: ReviewStatus;
}

export interface ManifestEntry {
  projectId: string;
  pageId: string;
  pageKey: string;
  renderId: string;
  renderVersion: number;
  chapterNumber: number | null;
  plannedPageNumber: number | null;
  /** Canonical SOURCE word count — the routing input, never OCR output. */
  wordCount: number | null;
  reviewRoute: ReviewRoute;
  routingReason: string;
  routeOverridden: boolean;
  escalated: boolean;
  manualCheckRequired: boolean;
  reviewStatus: ReviewStatus;
  file: string;
  exportedAt: string;
}

export interface ExportBatch {
  route: ReviewRoute;
  /** 1-based, zero-padded in the directory name: BATCH_01. */
  index: number;
  dir: string;
  entries: ManifestEntry[];
}

export interface ExportPlan {
  projectId: string;
  exportedAt: string;
  threshold: number;
  batchSize: number;
  batches: ExportBatch[];
  manifest: ManifestEntry[];
  skipped: Array<{ pageKey: string; reason: string }>;
  counts: { aiReview: number; manualReview: number; total: number; batches: number };
}

export type ExportSelection =
  | { kind: 'ROUTE'; route: ReviewRoute }
  | { kind: 'ALL_UNREVIEWED' }
  | { kind: 'PAGE_KEYS'; pageKeys: string[] };

/** Book order. Front/back matter carry spineOrder; body pages use the planned
 *  page number. Reviewers read in book order, so exports must too. */
function bookOrder(a: ExportablePage, b: ExportablePage): number {
  const av = a.spineOrder ?? a.plannedPageNumber ?? Number.MAX_SAFE_INTEGER;
  const bv = b.spineOrder ?? b.plannedPageNumber ?? Number.MAX_SAFE_INTEGER;
  if (av !== bv) return av - bv;
  return a.pageKey.localeCompare(b.pageKey);
}

/** `CH04_P010_c1__v3__3ebb539b.png` — page identity, render version, render id. */
export function exportFileName(pageKey: string, version: number, renderId: string): string {
  return `${pageKey}__v${version}__${renderId.slice(0, 8)}.png`;
}

export function planReviewExport(
  projectId: string,
  pages: ExportablePage[],
  selection: ExportSelection,
  policy: ReviewRoutingPolicy,
  opts: { batchSize?: number; now?: Date } = {},
): ExportPlan {
  const batchSize = Math.max(1, opts.batchSize ?? DEFAULT_BATCH_SIZE);
  const exportedAt = (opts.now ?? new Date()).toISOString();
  const skipped: Array<{ pageKey: string; reason: string }> = [];

  const chosen: Array<{ page: ExportablePage; route: ReviewRoute; entry: ManifestEntry }> = [];

  for (const page of [...pages].sort(bookOrder)) {
    const r = classifyReviewRoute(page, policy);

    // Out-of-scope pages are never exported for forensic image review.
    if (!r.inScope) continue;

    let wanted = false;
    if (selection.kind === 'ROUTE') wanted = r.route === selection.route;
    else if (selection.kind === 'ALL_UNREVIEWED') wanted = page.reviewStatus === 'UNREVIEWED';
    else wanted = selection.pageKeys.includes(page.pageKey);

    if (!wanted) continue;

    // A page with no usable render cannot be reviewed; say so rather than
    // silently shrinking the batch.
    if (!page.renderId || page.renderVersion === null || !page.imagePath) {
      skipped.push({ pageKey: page.pageKey, reason: 'no usable render' });
      continue;
    }

    chosen.push({
      page,
      route: r.route,
      entry: {
        projectId,
        pageId: page.pageId,
        pageKey: page.pageKey,
        renderId: page.renderId,
        renderVersion: page.renderVersion,
        chapterNumber: page.chapterNumber,
        plannedPageNumber: page.plannedPageNumber,
        wordCount: page.readableWords,
        reviewRoute: r.route,
        routingReason: r.reason,
        routeOverridden: r.overridden,
        escalated: r.escalated,
        manualCheckRequired: r.manualCheckRequired,
        reviewStatus: page.reviewStatus,
        file: '', // filled once the batch directory is known
        exportedAt,
      },
    });
  }

  const batches: ExportBatch[] = [];
  for (const route of ['AI_REVIEW', 'MANUAL_REVIEW'] as const) {
    const forRoute = chosen.filter((c) => c.route === route);
    for (let i = 0; i < forRoute.length; i += batchSize) {
      const slice = forRoute.slice(i, i + batchSize);
      const index = Math.floor(i / batchSize) + 1;
      const dir = `${route}/BATCH_${String(index).padStart(2, '0')}`;
      for (const c of slice) {
        c.entry.file = `${dir}/${exportFileName(c.page.pageKey, c.page.renderVersion!, c.page.renderId!)}`;
      }
      batches.push({ route, index, dir, entries: slice.map((c) => c.entry) });
    }
  }

  const manifest = batches.flatMap((b) => b.entries);
  return {
    projectId,
    exportedAt,
    threshold: policy.highTextWordThreshold,
    batchSize,
    batches,
    manifest,
    skipped,
    counts: {
      aiReview: manifest.filter((m) => m.reviewRoute === 'AI_REVIEW').length,
      manualReview: manifest.filter((m) => m.reviewRoute === 'MANUAL_REVIEW').length,
      total: manifest.length,
      batches: batches.length,
    },
  };
}
