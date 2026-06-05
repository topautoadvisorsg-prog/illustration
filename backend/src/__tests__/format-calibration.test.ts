import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type PageManifest } from '@wildlands/shared';
import { buildFormatCalibrationReport } from '../services/calibration/format-calibration.js';

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'The Wildlands',
  authorName: 'The Wildlands',
  publishingStandard: {
    format: 'HARDCOVER_7X10',
    label: 'Hardcover 7 x 10',
    typographyPackage: 'Wild Lands Default',
    status: 'CONFIGURED',
  },
  trimSize: { widthIn: 7, heightIn: 10, bleedIn: 0.125 },
  typography: { bodyPt: 11, lineHeight: 1.4 },
});

function words(n: number): string {
  return Array(n).fill('wilderness').join(' ');
}

function page(pageId: string, bodyWords = 320, overrides: Partial<PageManifest> = {}): PageManifest {
  return {
    pageId,
    chapterNumber: Number(pageId.slice(2, 4)),
    pageNumber: Number(pageId.slice(-3)),
    entryTitle: `Entry ${pageId}`,
    layoutTemplate: 'LAYOUT_1_STANDARD',
    imageSubject: 'New England wilderness',
    bodyMarkdown: words(bodyWords),
    warnings: [],
    ...overrides,
  };
}

describe('format calibration', () => {
  it('compares chapter text across publishing standards and recommends a format', () => {
    const report = buildFormatCalibrationReport(
      [
        page('CH01_P001', 260, { contentType: 'TERRAIN_ANALYSIS' }),
        page('CH01_P002', 420, { contentType: 'ENCYCLOPEDIA_ENTRY' }),
        page('CH02_P001', 300),
      ],
      config,
      1,
    );

    expect(report.chapterNumber).toBe(1);
    expect(report.currentFormat).toBe('HARDCOVER_7X10');
    expect(report.recommendedFormat).toBeTruthy();
    expect(report.options).toHaveLength(4);
    const first = report.options[0];
    const second = report.options[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first!.score).toBeGreaterThanOrEqual(second!.score);
    expect(report.options.every((option) => option.entries === 2)).toBe(true);
    expect(report.options.every((option) => option.operatorSummary.length > 0)).toBe(true);
    expect(report.nextAction).toContain(report.recommendedLabel);
  });
});
