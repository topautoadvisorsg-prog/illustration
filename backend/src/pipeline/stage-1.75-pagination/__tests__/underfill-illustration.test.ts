import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { recoverUnderfilledPages } from '../underfill-illustration.js';
import type { PaginatedPage } from '../flow-engine.js';

const config = ProjectConfigSchema.parse({ volume: 2, title: 'The Wildlands', subtitle: 'Canadian Rockies', authorName: 'W' });

function page(over: Partial<PaginatedPage>): PaginatedPage {
  return {
    plannedPageNumber: 1,
    entryKey: 'CH02_P001',
    entryTitle: '1. Grey Jay',
    pageKey: 'CH02_P001',
    chapterNumber: 2,
    partN: 1,
    totalParts: 1,
    pageRole: 'opener',
    carriesSubject: true,
    compactedEntryKeys: null,
    imageSubject: 'Grey Jay (Perisoreus canadensis)',
    layoutTemplate: 'LAYOUT_B_IMAGE_TOP',
    readingFieldText: 'A short body.',
    readingFieldChars: 13,
    readingFieldWords: 3,
    fitStatus: 'FITS',
    zones: { textSafeZones: [], imagePriorityZones: [] } as unknown as PaginatedPage['zones'],
    warnings: [],
    ...over,
  };
}

describe('recoverUnderfilledPages', () => {
  it('leaves non-underfilled pages untouched', () => {
    const pages = [page({ fitStatus: 'FITS' })];
    const out = recoverUnderfilledPages({ pages, config });
    expect(out.pages[0]).toEqual(pages[0]);
    expect(out.conversions).toHaveLength(0);
  });

  it('Type A: widens an underfilled opener to illustration-dominant, keeps its subject', () => {
    const pages = [page({ fitStatus: 'UNDERFILL', carriesSubject: true, imageSubject: 'Common Loon (Gavia immer)' })];
    const out = recoverUnderfilledPages({ pages, config });
    const p = out.pages[0]!;
    expect(p.layoutTemplate).toBe('LAYOUT_3_ILLUSTRATION_DOMINANT');
    expect(p.fitStatus).toBe('FITS'); // no longer a sparse defect
    expect(p.imageSubject).toBe('Common Loon (Gavia immer)'); // unchanged
    expect(out.conversions[0]?.type).toBe('A');
  });

  it('Type B: gives an underfilled text continuation its own distinct secondary study', () => {
    const pages = [
      page({ pageKey: 'CH02_P001', partN: 1, carriesSubject: true, imageSubject: 'Grey Jay (Perisoreus canadensis)', fitStatus: 'FITS' }),
      page({
        pageKey: 'CH02_P001_c1', partN: 2, totalParts: 2, pageRole: 'continuation',
        carriesSubject: false, imageSubject: null, layoutTemplate: 'LAYOUT_2_TEXT_HEAVY',
        fitStatus: 'UNDERFILL', readingFieldText: 'A small leftover tail of text.',
      }),
    ];
    const out = recoverUnderfilledPages({ pages, config });
    const tail = out.pages[1]!;
    expect(tail.layoutTemplate).toBe('LAYOUT_3_ILLUSTRATION_DOMINANT');
    expect(tail.carriesSubject).toBe(true); // now eligible for its own illustration
    expect(tail.imageSubject).toContain('Grey Jay'); // same species
    expect(tail.imageSubject).toMatch(/never a repeat|DIFFERENT/i); // distinct from opener
    expect(tail.fitStatus).toBe('FITS');
    expect(out.conversions.find((c) => c.pageKey === 'CH02_P001_c1')?.type).toBe('B');
  });
});
