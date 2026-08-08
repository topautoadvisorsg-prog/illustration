import { describe, expect, it } from 'vitest';

import { DEFAULT_POLICY } from '../policy.js';
import { exportFileName, planReviewExport, type ExportablePage } from '../export.js';

const PROJECT = '00000000-0000-0000-0000-000000000001';

function page(over: Partial<ExportablePage> & { pageKey: string }): ExportablePage {
  return {
    pageId: `id-${over.pageKey}`,
    renderId: `render-${over.pageKey}-aaaabbbbccc`,
    renderVersion: 1,
    imagePath: `path/${over.pageKey}.png`,
    chapterNumber: 1,
    plannedPageNumber: 1,
    spineOrder: null,
    readableWords: 250,
    textBlocks: 3,
    layoutTemplate: null,
    reviewRouteOverride: null,
    reviewEscalationReason: null,
    reviewStatus: 'UNREVIEWED',
    ...over,
  };
}

describe('review export planning', () => {
  it('names files with page key, render version and render id', () => {
    expect(exportFileName('CH04_P010_c1', 3, '3ebb539b-7784-404b-90f4-6f6c30615fa8')).toBe(
      'CH04_P010_c1__v3__3ebb539b.png',
    );
  });

  it('splits a route into predictable batches', () => {
    const list = Array.from({ length: 20 }, (_, i) =>
      page({ pageKey: `P${String(i).padStart(3, '0')}`, plannedPageNumber: i }),
    );
    const plan = planReviewExport(PROJECT, list, { kind: 'ROUTE', route: 'AI_REVIEW' }, DEFAULT_POLICY, { batchSize: 9 });
    expect(plan.batches.map((b) => b.dir)).toEqual([
      'AI_REVIEW/BATCH_01',
      'AI_REVIEW/BATCH_02',
      'AI_REVIEW/BATCH_03',
    ]);
    expect(plan.batches.map((b) => b.entries.length)).toEqual([9, 9, 2]);
    expect(plan.counts.total).toBe(20);
  });

  it('keeps book order inside batches', () => {
    const list = [
      page({ pageKey: 'C', plannedPageNumber: 3 }),
      page({ pageKey: 'A', plannedPageNumber: 1 }),
      page({ pageKey: 'B', plannedPageNumber: 2 }),
    ];
    const plan = planReviewExport(PROJECT, list, { kind: 'ROUTE', route: 'AI_REVIEW' }, DEFAULT_POLICY);
    expect(plan.manifest.map((m) => m.pageKey)).toEqual(['A', 'B', 'C']);
  });

  it('orders front matter by spineOrder ahead of body pages', () => {
    const list = [
      page({ pageKey: 'CH01_P001', plannedPageNumber: 20, spineOrder: null }),
      page({ pageKey: 'FM_007', plannedPageNumber: null, spineOrder: 7 }),
    ];
    const plan = planReviewExport(PROJECT, list, { kind: 'ROUTE', route: 'AI_REVIEW' }, DEFAULT_POLICY);
    expect(plan.manifest.map((m) => m.pageKey)).toEqual(['FM_007', 'CH01_P001']);
  });

  it('separates AI and manual routes into their own trees', () => {
    const list = [
      page({ pageKey: 'DENSE', readableWords: 400, plannedPageNumber: 1 }),
      page({ pageKey: 'SPARSE', readableWords: 100, plannedPageNumber: 2 }),
    ];
    const ai = planReviewExport(PROJECT, list, { kind: 'ROUTE', route: 'AI_REVIEW' }, DEFAULT_POLICY);
    const manual = planReviewExport(PROJECT, list, { kind: 'ROUTE', route: 'MANUAL_REVIEW' }, DEFAULT_POLICY);
    expect(ai.manifest.map((m) => m.pageKey)).toEqual(['DENSE']);
    expect(ai.manifest[0]!.file).toBe('AI_REVIEW/BATCH_01/DENSE__v1__render-D.png');
    expect(manual.manifest.map((m) => m.pageKey)).toEqual(['SPARSE']);
    expect(manual.manifest[0]!.file.startsWith('MANUAL_REVIEW/BATCH_01/')).toBe(true);
  });

  it('exports an arbitrary selection of pages', () => {
    const list = [
      page({ pageKey: 'A', plannedPageNumber: 1 }),
      page({ pageKey: 'B', plannedPageNumber: 2 }),
      page({ pageKey: 'C', plannedPageNumber: 3 }),
    ];
    const plan = planReviewExport(PROJECT, list, { kind: 'PAGE_KEYS', pageKeys: ['C', 'A'] }, DEFAULT_POLICY);
    expect(plan.manifest.map((m) => m.pageKey)).toEqual(['A', 'C']);
  });

  it('selects every unreviewed page regardless of route', () => {
    const list = [
      page({ pageKey: 'DENSE', readableWords: 400, plannedPageNumber: 1, reviewStatus: 'UNREVIEWED' }),
      page({ pageKey: 'SPARSE', readableWords: 100, plannedPageNumber: 2, reviewStatus: 'UNREVIEWED' }),
      page({ pageKey: 'DONE', readableWords: 400, plannedPageNumber: 3, reviewStatus: 'APPROVED' }),
    ];
    const plan = planReviewExport(PROJECT, list, { kind: 'ALL_UNREVIEWED' }, DEFAULT_POLICY);
    expect(plan.manifest.map((m) => m.pageKey).sort()).toEqual(['DENSE', 'SPARSE']);
    expect(plan.counts.aiReview).toBe(1);
    expect(plan.counts.manualReview).toBe(1);
  });

  it('skips pages with no usable render instead of silently shrinking the batch', () => {
    const list = [
      page({ pageKey: 'OK', plannedPageNumber: 1 }),
      page({ pageKey: 'NORENDER', plannedPageNumber: 2, renderId: null, renderVersion: null, imagePath: null }),
    ];
    const plan = planReviewExport(PROJECT, list, { kind: 'ROUTE', route: 'AI_REVIEW' }, DEFAULT_POLICY);
    expect(plan.counts.total).toBe(1);
    expect(plan.skipped).toEqual([{ pageKey: 'NORENDER', reason: 'no usable render' }]);
  });

  it('never exports an out-of-scope typeset page', () => {
    const list = [page({ pageKey: 'TYPESET', readableWords: 900, isAiImageTextPage: false })];
    const plan = planReviewExport(PROJECT, list, { kind: 'ROUTE', route: 'AI_REVIEW' }, DEFAULT_POLICY);
    expect(plan.counts.total).toBe(0);
  });

  it('carries routing provenance into the manifest', () => {
    const list = [
      page({ pageKey: 'ESC', readableWords: 150, reviewEscalationReason: 'tiny diagram labels', plannedPageNumber: 1 }),
    ];
    const plan = planReviewExport(PROJECT, list, { kind: 'ROUTE', route: 'AI_REVIEW' }, DEFAULT_POLICY);
    const m = plan.manifest[0]!;
    expect(m.reviewRoute).toBe('AI_REVIEW');
    expect(m.escalated).toBe(true);
    expect(m.wordCount).toBe(150);
    expect(m.routingReason).toContain('tiny diagram labels');
    expect(m.renderVersion).toBe(1);
    expect(m.reviewStatus).toBe('UNREVIEWED');
  });
});
