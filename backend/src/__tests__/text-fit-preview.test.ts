import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type PageManifest } from '@wildlands/shared';
import { buildTextFitPreview } from '../pipeline/stage-6-layout/text-fit-preview.js';

const config = ProjectConfigSchema.parse({ volume: 1, title: 'The Wildlands', authorName: 'The Wildlands' });

/** N space-separated words, so the planner's word-count layout logic behaves realistically. */
function words(n: number): string {
  return Array(n).fill('alpha').join(' ');
}

function page(pageId: string, pageNumber: number, body: string): PageManifest {
  return {
    pageId,
    chapterNumber: 1,
    pageNumber,
    entryTitle: `Entry ${pageNumber}`,
    layoutTemplate: 'LAYOUT_1_STANDARD',
    imageSubject: 'subject',
    bodyMarkdown: body,
    warnings: [],
  };
}

describe('buildTextFitPreview', () => {
  it('aggregates per-page fit status and blocks image spend on overflow', () => {
    const pages = [
      page('CH01_P001', 1, words(300)), // ~300 words -> LAYOUT_1_STANDARD -> FITS
      page('CH01_P002', 2, words(20)), // short -> illustration-dominant -> UNDERFILLED
      page('CH01_P003', 3, words(2000)), // very long -> text-heavy -> OVERFLOW
    ];
    const preview = buildTextFitPreview(pages, config);

    expect(preview.totals.pages).toBe(3);
    expect(preview.totals.overflow).toBe(1);
    expect(preview.totals.underfilled).toBe(1);
    expect(preview.readyForImageSpend).toBe(false);
    expect(preview.geometry.pageWidthIn).toBe(8.625);
    expect(preview.pages).toHaveLength(3);
  });

  it('is ready for image spend when no page overflows', () => {
    const preview = buildTextFitPreview([page('CH01_P001', 1, words(300))], config);
    expect(preview.readyForImageSpend).toBe(true);
    expect(preview.pages[0]!.fit.status).toBe('FITS');
    expect(preview.pages[0]!.layoutTemplate).toBe('LAYOUT_1_STANDARD');
  });
});
