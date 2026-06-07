import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type ProjectConfig } from '@wildlands/shared';
import { isChromiumAvailable } from '../../stage-6-layout/render-pdf.js';
import { renderPreviewPdf } from '../render-preview.js';
import type { PaginatedPage } from '../../stage-1.75-pagination/types.js';

function makeConfig(): ProjectConfig {
  return ProjectConfigSchema.parse({ volume: 1, title: 'T', authorName: 'A' });
}

const fakeZones = {
  priorityEdge: 'LEFT',
  imagePriorityZone: { xPct: 5, yPct: 60, widthPct: 40, heightPct: 35 },
  textSafeZones: [{ id: 'rf', role: 'reading-field', regionType: 'TEXT_SAFE', shape: 'rect', xPct: 50, yPct: 10, widthPct: 45, heightPct: 80, instruction: '' }],
  typographyZones: [{ id: 't', role: 'title', regionType: 'TYPOGRAPHY', shape: 'rect', xPct: 5, yPct: 3, widthPct: 90, heightPct: 6, instruction: '' }],
  imagePriorityZones: [{ id: 'i', role: 'image-priority', regionType: 'IMAGE_PRIORITY', shape: 'rect', xPct: 5, yPct: 60, widthPct: 40, heightPct: 35, instruction: '' }],
  regions: [],
  imagePlacement: 'left',
  textPlacement: 'right',
  openingPageImagePercent: 40,
  openingPageTextPercent: 60,
  continuationPageImagePercent: 0,
  continuationPageTextPercent: 100,
  estimatedRenderedPages: 1,
  wordsPerOpeningPage: 0,
  wordsPerContinuationPage: 0,
  notes: [],
  architecture: 'FLOAT_LEFT',
  artBox: { xPct: 5, yPct: 60, widthPct: 40, heightPct: 35 },
} as unknown as PaginatedPage['zones'];

function makePage(): PaginatedPage {
  return {
    plannedPageNumber: 1,
    entryKey: 'CH01_P001',
    entryTitle: 'Preview Smoke Test',
    pageKey: 'CH01_P001',
    chapterNumber: 1,
    partN: 1,
    totalParts: 1,
    pageRole: 'opener',
    carriesSubject: true,
    compactedEntryKeys: null,
    imageSubject: 'a smoke-test subject',
    layoutTemplate: 'LAYOUT_1_STANDARD',
    readingFieldText: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
      'Phasellus eu eros vel turpis dictum efficitur.',
    readingFieldChars: 110,
    readingFieldWords: 16,
    fitStatus: 'FITS',
    zones: fakeZones,
    warnings: [],
  };
}

const HAS_CHROMIUM = isChromiumAvailable();

describe.skipIf(!HAS_CHROMIUM)('renderPreviewPdf — end-to-end (requires Chromium)', () => {
  it('produces a single-page PDF buffer', async () => {
    const result = await renderPreviewPdf({ page: makePage(), config: makeConfig() });
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(1000); // PDFs are never this tiny
    expect(result.totalPages).toBe(1);
    // PDF magic bytes.
    expect(result.buffer.slice(0, 4).toString('utf8')).toBe('%PDF');
  }, 60_000);
});

describe.skipIf(HAS_CHROMIUM)('renderPreviewPdf — skipped (no Chromium in this environment)', () => {
  it('would have run with a real PDF render', () => {
    // Placeholder so the test runner reports this describe block as not silently empty.
    expect(true).toBe(true);
  });
});
