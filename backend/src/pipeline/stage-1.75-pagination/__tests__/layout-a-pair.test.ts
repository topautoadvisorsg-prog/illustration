import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type ProjectConfig } from '@wildlands/shared';
import { expandLayoutAPairs } from '../layout-a-pair.js';
import type { PaginatedPage } from '../types.js';

function makeConfig(): ProjectConfig {
  return ProjectConfigSchema.parse({ volume: 1, title: 'T', authorName: 'A' });
}

const emptyZones = {
  priorityEdge: 'LEFT',
  imagePriorityZone: { xPct: 0, yPct: 0, widthPct: 0, heightPct: 0 },
  textSafeZones: [],
  typographyZones: [],
  imagePriorityZones: [],
  regions: [],
  imagePlacement: '',
  textPlacement: '',
  openingPageImagePercent: 0,
  openingPageTextPercent: 0,
  continuationPageImagePercent: 0,
  continuationPageTextPercent: 0,
  estimatedRenderedPages: 1,
  wordsPerOpeningPage: 0,
  wordsPerContinuationPage: 0,
  notes: [],
  architecture: 'FLOAT_LEFT',
  artBox: { xPct: 0, yPct: 0, widthPct: 0, heightPct: 0 },
} as unknown as PaginatedPage['zones'];

function page(o: Partial<PaginatedPage> & Pick<PaginatedPage, 'entryKey' | 'pageKey' | 'layoutTemplate'>): PaginatedPage {
  return {
    plannedPageNumber: 1,
    entryTitle: 'T',
    chapterNumber: 1,
    partN: 1,
    totalParts: 1,
    pageRole: 'opener',
    carriesSubject: true,
    compactedEntryKeys: null,
    imageSubject: 'x',
    readingFieldText: 'body',
    readingFieldChars: 4,
    readingFieldWords: 1,
    fitStatus: 'FITS',
    zones: emptyZones,
    warnings: [],
    ...o,
  };
}

describe('expandLayoutAPairs', () => {
  it('returns the input unchanged when no Layout A pages are present', () => {
    const input = [
      page({ entryKey: 'A', pageKey: 'A', layoutTemplate: 'LAYOUT_1_STANDARD' }),
      page({ entryKey: 'B', pageKey: 'B', layoutTemplate: 'LAYOUT_2_TEXT_HEAVY' }),
    ];
    const result = expandLayoutAPairs(input, makeConfig());
    expect(result.length).toBe(2);
    // plannedPageNumber gets re-numbered to 1,2 even on the no-op path
    expect(result.map((p) => p.layoutTemplate)).toEqual(['LAYOUT_1_STANDARD', 'LAYOUT_2_TEXT_HEAVY']);
  });

  it('inserts a facing illustration page after a single Layout A opener', () => {
    const input = [page({ entryKey: 'A', pageKey: 'A', layoutTemplate: 'LAYOUT_A_TEXT' })];
    const result = expandLayoutAPairs(input, makeConfig());
    expect(result.length).toBe(2);
    expect(result[0]!.layoutTemplate).toBe('LAYOUT_A_TEXT');
    expect(result[1]!.layoutTemplate).toBe('LAYOUT_A_ILLUSTRATION');
    expect(result[1]!.pageKey).toBe('A_illus');
    expect(result[1]!.readingFieldText).toBe('');
  });

  it('moves carriesSubject from the text page to the illustration page', () => {
    const input = [
      page({ entryKey: 'A', pageKey: 'A', layoutTemplate: 'LAYOUT_A_TEXT', carriesSubject: true }),
    ];
    const result = expandLayoutAPairs(input, makeConfig());
    expect(result[0]!.carriesSubject).toBe(false);
    expect(result[0]!.imageSubject).toBeNull();
    expect(result[1]!.carriesSubject).toBe(true);
  });

  it('inserts the illustration AFTER the last continuation of a multi-page chain', () => {
    const input = [
      page({ entryKey: 'A', pageKey: 'A', layoutTemplate: 'LAYOUT_A_TEXT', partN: 1, totalParts: 3 }),
      page({ entryKey: 'A', pageKey: 'A_c1', layoutTemplate: 'LAYOUT_A_TEXT', partN: 2, totalParts: 3, pageRole: 'continuation', carriesSubject: false }),
      page({ entryKey: 'A', pageKey: 'A_c2', layoutTemplate: 'LAYOUT_A_TEXT', partN: 3, totalParts: 3, pageRole: 'continuation', carriesSubject: false }),
    ];
    const result = expandLayoutAPairs(input, makeConfig());
    expect(result.length).toBe(4);
    expect(result[0]!.layoutTemplate).toBe('LAYOUT_A_TEXT');
    expect(result[3]!.layoutTemplate).toBe('LAYOUT_A_ILLUSTRATION');
    // totalParts recomputed to 4 for every page in the chain.
    for (const p of result) {
      expect(p.totalParts).toBe(4);
    }
    expect(result.map((p) => p.partN)).toEqual([1, 2, 3, 4]);
  });

  it('renumbers plannedPageNumber across the whole book after insertion', () => {
    const input = [
      page({ entryKey: 'A', pageKey: 'A', layoutTemplate: 'LAYOUT_A_TEXT', plannedPageNumber: 1 }),
      page({ entryKey: 'B', pageKey: 'B', layoutTemplate: 'LAYOUT_1_STANDARD', plannedPageNumber: 2 }),
    ];
    const result = expandLayoutAPairs(input, makeConfig());
    expect(result.length).toBe(3);
    expect(result.map((p) => p.plannedPageNumber)).toEqual([1, 2, 3]);
    // B should now be page 3 (was 2; pushed back by the inserted illustration).
    expect(result.find((p) => p.entryKey === 'B')!.plannedPageNumber).toBe(3);
  });

  it('does not touch chains whose opener uses a different layout', () => {
    const input = [
      page({ entryKey: 'A', pageKey: 'A', layoutTemplate: 'LAYOUT_A_TEXT' }),
      page({ entryKey: 'B', pageKey: 'B', layoutTemplate: 'LAYOUT_B_IMAGE_TOP' }),
    ];
    const result = expandLayoutAPairs(input, makeConfig());
    expect(result.length).toBe(3); // A + A_illus + B
    expect(result.filter((p) => p.entryKey === 'B').length).toBe(1);
  });
});
