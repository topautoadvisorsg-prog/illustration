import { describe, expect, it } from 'vitest';
import type { LayoutTemplateId } from '@wildlands/shared';
import { tailRebalance } from '../tail-rebalance.js';
import type { PaginatedPage } from '../flow-engine.js';

function page(o: Partial<PaginatedPage> & Pick<PaginatedPage, 'entryKey' | 'pageKey' | 'layoutTemplate' | 'fitStatus' | 'pageRole'>): PaginatedPage {
  return {
    entryTitle: 'T',
    chapterNumber: 1,
    partN: 1,
    totalParts: 1,
    carriesSubject: true,
    compactedEntryKeys: null,
    imageSubject: 'x',
    readingFieldText: '',
    readingFieldChars: 0,
    readingFieldWords: 0,
    warnings: [],
    ...o,
  };
}

describe('tailRebalance', () => {
  it('returns early when there are no pages', () => {
    const r = tailRebalance({ pages: [] });
    expect(r.warnings).toEqual([]);
    expect(r.shouldReflowFromIndex).toBeNull();
  });

  it('returns early when the last page is not UNDERFILL', () => {
    const r = tailRebalance({
      pages: [
        page({ entryKey: 'a', pageKey: 'a', layoutTemplate: 'LAYOUT_1_STANDARD', fitStatus: 'FITS', pageRole: 'opener' }),
      ],
    });
    expect(r.shouldReflowFromIndex).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it('identifies a discretionary opener as a drop candidate when the last page is UNDERFILL', () => {
    const pages = [
      page({ entryKey: 'a', pageKey: 'a', layoutTemplate: 'LAYOUT_1_STANDARD', fitStatus: 'FITS', pageRole: 'opener' }),
      page({ entryKey: 'b', pageKey: 'b', layoutTemplate: 'LAYOUT_3_ILLUSTRATION_DOMINANT', fitStatus: 'FITS', pageRole: 'opener' }),
      page({ entryKey: 'c', pageKey: 'c', layoutTemplate: 'LAYOUT_1_STANDARD', fitStatus: 'UNDERFILL', pageRole: 'opener' }),
    ];
    const r = tailRebalance({ pages });
    expect(r.shouldReflowFromIndex).toBe(1);
    expect(r.dropSlotForEntryKey).toBe('b');
    expect(r.warnings.some((w) => w.startsWith('tail_rebalance_candidate'))).toBe(true);
  });

  it('accepts the orphan when no discretionary layout is upstream', () => {
    const pages = [
      page({ entryKey: 'a', pageKey: 'a', layoutTemplate: 'LAYOUT_1_STANDARD', fitStatus: 'FITS', pageRole: 'opener' }),
      page({ entryKey: 'b', pageKey: 'b', layoutTemplate: 'LAYOUT_2_TEXT_HEAVY', fitStatus: 'FITS', pageRole: 'opener' }),
      page({ entryKey: 'c', pageKey: 'c', layoutTemplate: 'LAYOUT_1_STANDARD', fitStatus: 'UNDERFILL', pageRole: 'opener' }),
    ];
    const r = tailRebalance({ pages });
    expect(r.shouldReflowFromIndex).toBeNull();
    expect(r.dropSlotForEntryKey).toBeNull();
    expect(r.warnings).toContain('orphan_tail_accepted');
  });

  it('does not consider a continuation page as a drop candidate', () => {
    const pages = [
      page({ entryKey: 'a', pageKey: 'a', layoutTemplate: 'LAYOUT_1_STANDARD', fitStatus: 'FITS', pageRole: 'opener' }),
      page({ entryKey: 'a', pageKey: 'a_c1', layoutTemplate: 'LAYOUT_3_ILLUSTRATION_DOMINANT' as LayoutTemplateId, fitStatus: 'FITS', pageRole: 'continuation' }),
      page({ entryKey: 'b', pageKey: 'b', layoutTemplate: 'LAYOUT_1_STANDARD', fitStatus: 'UNDERFILL', pageRole: 'opener' }),
    ];
    const r = tailRebalance({ pages });
    expect(r.shouldReflowFromIndex).toBeNull();
    expect(r.warnings).toContain('orphan_tail_accepted');
  });
});
