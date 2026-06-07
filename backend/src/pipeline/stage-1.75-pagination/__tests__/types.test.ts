import { describe, expect, it } from 'vitest';
import { PaginatedPageSchema, type PaginatedPage } from '../types.js';

/** Build a valid PaginatedPage from a partial override. The defaults below
 *  pass the schema; tests mutate one field at a time to assert which kinds
 *  of bad data the schema catches. */
function makePage(overrides: Partial<PaginatedPage> = {}): unknown {
  const base: Record<string, unknown> = {
    plannedPageNumber: 1,
    entryKey: 'CH01_P001',
    entryTitle: 'Test',
    pageKey: 'CH01_P001',
    chapterNumber: 1,
    partN: 1,
    totalParts: 1,
    pageRole: 'opener',
    carriesSubject: true,
    compactedEntryKeys: null,
    imageSubject: 'x',
    layoutTemplate: 'LAYOUT_1_STANDARD',
    readingFieldText: 'body',
    readingFieldChars: 4,
    readingFieldWords: 1,
    fitStatus: 'FITS',
    zones: {
      // Shape minimal enough to pass the zones predicate (must be an object
      // with textSafeZones[] and imagePriorityZones[]).
      textSafeZones: [],
      imagePriorityZones: [],
    },
    warnings: [],
  };
  return { ...base, ...overrides };
}

describe('PaginatedPageSchema — zones validator (fix #1)', () => {
  it('rejects a page whose zones are missing entirely', () => {
    const bad = makePage();
    delete (bad as Record<string, unknown>).zones;
    expect(() => PaginatedPageSchema.parse(bad)).toThrow();
  });

  it('rejects a page whose zones is null', () => {
    const bad = makePage({ zones: null as unknown as PaginatedPage['zones'] });
    expect(() => PaginatedPageSchema.parse(bad)).toThrow();
  });

  it('rejects a page whose zones is a primitive', () => {
    const bad = makePage({ zones: 'not an object' as unknown as PaginatedPage['zones'] });
    expect(() => PaginatedPageSchema.parse(bad)).toThrow();
  });

  it('rejects zones missing textSafeZones', () => {
    const bad = makePage({
      zones: { imagePriorityZones: [] } as unknown as PaginatedPage['zones'],
    });
    expect(() => PaginatedPageSchema.parse(bad)).toThrow();
  });

  it('accepts a minimal valid zones object', () => {
    const ok = makePage();
    expect(() => PaginatedPageSchema.parse(ok)).not.toThrow();
  });
});

describe('PaginatedPageSchema — pageRole/compactedEntryKeys invariant (fix #2)', () => {
  it('rejects pageRole=compacted with compactedEntryKeys=null', () => {
    const bad = makePage({ pageRole: 'compacted', compactedEntryKeys: null });
    expect(() => PaginatedPageSchema.parse(bad)).toThrow();
  });

  it('rejects pageRole=opener with non-null compactedEntryKeys', () => {
    const bad = makePage({
      pageRole: 'opener',
      compactedEntryKeys: ['CH01_P001', 'CH01_P002'],
    });
    expect(() => PaginatedPageSchema.parse(bad)).toThrow();
  });

  it('rejects pageRole=continuation with non-null compactedEntryKeys', () => {
    const bad = makePage({
      pageRole: 'continuation',
      compactedEntryKeys: ['CH01_P001', 'CH01_P002'],
      carriesSubject: false,
      imageSubject: null,
    });
    expect(() => PaginatedPageSchema.parse(bad)).toThrow();
  });

  it('accepts pageRole=compacted with compactedEntryKeys of length 2+', () => {
    const ok = makePage({
      pageRole: 'compacted',
      compactedEntryKeys: ['CH01_P001', 'CH01_P002'],
    });
    expect(() => PaginatedPageSchema.parse(ok)).not.toThrow();
  });

  it('rejects compactedEntryKeys array of length 1 (must be ≥ 2)', () => {
    const bad = makePage({
      pageRole: 'compacted',
      compactedEntryKeys: ['CH01_P001'],
    });
    expect(() => PaginatedPageSchema.parse(bad)).toThrow();
  });
});
