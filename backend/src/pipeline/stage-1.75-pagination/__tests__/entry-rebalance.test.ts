/**
 * entry-rebalance (Patch B) — pure unit tests.
 *
 * Locks in the rebalance contract: cliff entries are flattened, single-part
 * entries are untouched, compacted pages are skipped, chapter boundaries hold,
 * the opener keeps its layout + subject + carriesSubject.
 */

import { describe, expect, it } from 'vitest';
import type { TrimSize } from '@wildlands/shared';
import { rebalanceEntries } from '../entry-rebalance.js';
import { directLayout } from '../../stage-6-layout/layout-director.js';
import { computePageGeometry } from '../../stage-6-layout/page-geometry.js';
import type { PaginatedPage } from '../types.js';

const TRIM_7x10: TrimSize = { widthIn: 7, heightIn: 10, bleedIn: 0.125 };
const BODY_PT = 11;
const LINE_HEIGHT = 1.4;

function paragraphs(text: string, n: number): string {
  return Array.from({ length: n }, () => text).join('\n\n');
}

function zonesFor(text: string, layoutTemplate: PaginatedPage['layoutTemplate']) {
  return directLayout({
    bodyMarkdown: text,
    layoutTemplate,
    geometry: computePageGeometry(TRIM_7x10),
    bodyPt: BODY_PT,
    lineHeight: LINE_HEIGHT,
  });
}

function makePage(o: Partial<PaginatedPage> & Pick<PaginatedPage, 'entryKey' | 'pageKey' | 'partN' | 'totalParts' | 'layoutTemplate' | 'readingFieldText'>): PaginatedPage {
  const chars = o.readingFieldText.length;
  return {
    plannedPageNumber: o.plannedPageNumber ?? 1,
    entryKey: o.entryKey,
    entryTitle: o.entryTitle ?? 'Entry',
    pageKey: o.pageKey,
    chapterNumber: o.chapterNumber ?? 1,
    partN: o.partN,
    totalParts: o.totalParts,
    pageRole: o.pageRole ?? (o.partN === 1 ? 'opener' : 'continuation'),
    carriesSubject: o.carriesSubject ?? o.partN === 1,
    compactedEntryKeys: o.compactedEntryKeys ?? null,
    imageSubject: o.imageSubject ?? (o.partN === 1 ? 'subject' : null),
    layoutTemplate: o.layoutTemplate,
    readingFieldText: o.readingFieldText,
    readingFieldChars: o.readingFieldChars ?? chars,
    readingFieldWords: o.readingFieldWords ?? Math.max(1, Math.floor(chars / 6)),
    fitStatus: o.fitStatus ?? 'FITS',
    zones: o.zones ?? zonesFor(o.readingFieldText, o.layoutTemplate),
    warnings: o.warnings ?? [],
  };
}

describe('rebalanceEntries', () => {
  it('does nothing to a single-part FITS entry', () => {
    const pages = [
      makePage({
        entryKey: 'X', pageKey: 'X', partN: 1, totalParts: 1,
        layoutTemplate: 'LAYOUT_B_IMAGE_RIGHT',
        readingFieldText: paragraphs('A short paragraph about X. ', 5),
      }),
    ];
    const out = rebalanceEntries({ pages, trimSize: TRIM_7x10, bodyPt: BODY_PT, lineHeight: LINE_HEIGHT });
    expect(out.pages).toEqual(pages);
    expect(out.rebalancedEntryKeys).toEqual([]);
    expect(out.expandedEntryKeys).toEqual([]);
  });

  it('flattens a cliff: c1 at ceiling + c2 sparse → both move toward 50/50', () => {
    // Build a two-part entry where c1 is packed and c2 is sparse — the exact
    // pattern Patch A leaves behind.
    const heavyPart = paragraphs('This paragraph is meaningfully sized and exists to load up part one. ', 38); // ~2660 chars
    const sparsePart = paragraphs('Tiny tail paragraph. ', 2);                                                   // ~40 chars
    const pages = [
      makePage({
        entryKey: 'E', pageKey: 'E', partN: 1, totalParts: 2,
        layoutTemplate: 'LAYOUT_B_IMAGE_RIGHT',
        readingFieldText: heavyPart,
        fitStatus: 'OVERFLOW',
      }),
      makePage({
        entryKey: 'E', pageKey: 'E_c1', partN: 2, totalParts: 2,
        layoutTemplate: 'LAYOUT_2_TEXT_HEAVY',
        readingFieldText: sparsePart,
        fitStatus: 'UNDERFILL',
      }),
    ];
    const out = rebalanceEntries({ pages, trimSize: TRIM_7x10, bodyPt: BODY_PT, lineHeight: LINE_HEIGHT });
    expect(out.rebalancedEntryKeys).toContain('E');
    // Same total chars (paragraph splitting is conservative; may differ by
    // whitespace), but parts should now be balanced — max fillRatio < 1.
    const newParts = out.pages.filter((p) => p.entryKey === 'E');
    expect(newParts.length).toBeGreaterThanOrEqual(2);
    expect(newParts.every((p) => p.fitStatus !== 'OVERFLOW')).toBe(true);
    // Opener kept its layout + image subject + carriesSubject.
    const opener = newParts.find((p) => p.partN === 1)!;
    expect(opener.layoutTemplate).toBe('LAYOUT_B_IMAGE_RIGHT');
    expect(opener.carriesSubject).toBe(true);
    expect(opener.imageSubject).toBe('subject');
    // Continuations don't carry the subject.
    for (const c of newParts.filter((p) => p.partN > 1)) {
      expect(c.carriesSubject).toBe(false);
      expect(c.imageSubject).toBeNull();
      expect(c.layoutTemplate).toBe('LAYOUT_2_TEXT_HEAVY');
    }
  });

  it('adds one continuation when the entry exceeds safe distributed capacity', () => {
    // Total body bigger than 2 × continuation capacity × 0.85 — needs a 3rd part.
    const hugePart = paragraphs('A paragraph long enough to keep filling capacity. ', 90); // ~4500 chars
    const pages = [
      makePage({
        entryKey: 'BIG', pageKey: 'BIG', partN: 1, totalParts: 2,
        layoutTemplate: 'LAYOUT_B_IMAGE_RIGHT',
        readingFieldText: hugePart.slice(0, Math.floor(hugePart.length / 2)),
        fitStatus: 'OVERFLOW',
      }),
      makePage({
        entryKey: 'BIG', pageKey: 'BIG_c1', partN: 2, totalParts: 2,
        layoutTemplate: 'LAYOUT_2_TEXT_HEAVY',
        readingFieldText: hugePart.slice(Math.floor(hugePart.length / 2)),
        fitStatus: 'OVERFLOW',
      }),
    ];
    const out = rebalanceEntries({ pages, trimSize: TRIM_7x10, bodyPt: BODY_PT, lineHeight: LINE_HEIGHT });
    expect(out.expandedEntryKeys).toContain('BIG');
    const newParts = out.pages.filter((p) => p.entryKey === 'BIG');
    expect(newParts.length).toBe(3);
    // partN sequential, totalParts uniform.
    expect(newParts.map((p) => p.partN)).toEqual([1, 2, 3]);
    expect(newParts.every((p) => p.totalParts === 3)).toBe(true);
    // pageKey format for the new third part.
    expect(newParts[2]!.pageKey).toBe('BIG_c2');
  });

  it('does not touch compacted pages or their entries', () => {
    const compacted = makePage({
      entryKey: 'A', pageKey: 'A_m', partN: 1, totalParts: 1,
      layoutTemplate: 'LAYOUT_B_IMAGE_RIGHT',
      readingFieldText: paragraphs('compacted', 20),
      pageRole: 'compacted',
      compactedEntryKeys: ['A', 'B'],
      fitStatus: 'TIGHT',
    });
    const out = rebalanceEntries({ pages: [compacted], trimSize: TRIM_7x10, bodyPt: BODY_PT, lineHeight: LINE_HEIGHT });
    expect(out.pages).toEqual([compacted]);
    expect(out.rebalancedEntryKeys).toEqual([]);
  });

  it('preserves spine order: rebalanced entry stays at its original slot', () => {
    const heavyPart = paragraphs('Body text for entry M, plenty of it. ', 38);
    const sparsePart = paragraphs('Small tail. ', 2);
    const pages = [
      makePage({ entryKey: 'L', pageKey: 'L', partN: 1, totalParts: 1, layoutTemplate: 'LAYOUT_B_IMAGE_RIGHT', readingFieldText: 'left', chapterNumber: 1 }),
      makePage({ entryKey: 'M', pageKey: 'M', partN: 1, totalParts: 2, layoutTemplate: 'LAYOUT_B_IMAGE_RIGHT', readingFieldText: heavyPart, fitStatus: 'OVERFLOW', chapterNumber: 2 }),
      makePage({ entryKey: 'M', pageKey: 'M_c1', partN: 2, totalParts: 2, layoutTemplate: 'LAYOUT_2_TEXT_HEAVY', readingFieldText: sparsePart, fitStatus: 'UNDERFILL', chapterNumber: 2 }),
      makePage({ entryKey: 'R', pageKey: 'R', partN: 1, totalParts: 1, layoutTemplate: 'LAYOUT_B_IMAGE_RIGHT', readingFieldText: 'right', chapterNumber: 3 }),
    ];
    const out = rebalanceEntries({ pages, trimSize: TRIM_7x10, bodyPt: BODY_PT, lineHeight: LINE_HEIGHT });
    // L stays first, R stays last, M's parts in between — chapter order
    // is preserved structurally because we splice replacements in place.
    expect(out.pages[0]!.entryKey).toBe('L');
    expect(out.pages[out.pages.length - 1]!.entryKey).toBe('R');
    const mParts = out.pages.filter((p) => p.entryKey === 'M');
    expect(mParts.every((p) => p.chapterNumber === 2)).toBe(true);
  });
});
