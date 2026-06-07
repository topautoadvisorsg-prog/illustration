import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type ProjectConfig } from '@wildlands/shared';
import {
  clearPreviewCache,
  previewCacheKey,
  readPreviewFromCache,
  writePreviewToCache,
} from '../preview-cache.js';
import type { PaginatedPage } from '../../stage-1.75-pagination/types.js';

function makeConfig(): ProjectConfig {
  return ProjectConfigSchema.parse({ volume: 1, title: 'T', authorName: 'A' });
}

const fakeZones = {
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

function makePage(o: Partial<PaginatedPage> = {}): PaginatedPage {
  return {
    plannedPageNumber: 1,
    entryKey: 'CH01_P001',
    entryTitle: 'T',
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
    zones: fakeZones,
    warnings: [],
    ...o,
  };
}

beforeEach(async () => {
  await clearPreviewCache();
});

afterEach(async () => {
  await clearPreviewCache();
});

describe('previewCacheKey', () => {
  it('returns the same key for the same input', () => {
    const config = makeConfig();
    const page = makePage();
    expect(previewCacheKey({ page, config })).toBe(previewCacheKey({ page, config }));
  });

  it('changes the key when readingFieldText changes', () => {
    const config = makeConfig();
    const a = previewCacheKey({ page: makePage({ readingFieldText: 'A' }), config });
    const b = previewCacheKey({ page: makePage({ readingFieldText: 'B' }), config });
    expect(a).not.toBe(b);
  });

  it('changes the key when layoutTemplate changes', () => {
    const config = makeConfig();
    const a = previewCacheKey({ page: makePage({ layoutTemplate: 'LAYOUT_1_STANDARD' }), config });
    const b = previewCacheKey({ page: makePage({ layoutTemplate: 'LAYOUT_2_TEXT_HEAVY' }), config });
    expect(a).not.toBe(b);
  });

  it('changes the key when typography changes', () => {
    const page = makePage();
    const a = previewCacheKey({ page, config: makeConfig() });
    const altConfig = ProjectConfigSchema.parse({
      volume: 1,
      title: 'T',
      authorName: 'A',
      typography: { bodyPt: 14 },
    });
    const b = previewCacheKey({ page, config: altConfig });
    expect(a).not.toBe(b);
  });

  it('changes the key when colorPalette.ink changes (fix #2 regression guard)', () => {
    const page = makePage();
    const a = previewCacheKey({ page, config: makeConfig() });
    const altConfig = ProjectConfigSchema.parse({
      volume: 1,
      title: 'T',
      authorName: 'A',
      colorPalette: { ink: '#000000' },
    });
    const b = previewCacheKey({ page, config: altConfig });
    expect(a).not.toBe(b);
  });

  it('changes the key when colorPalette.accent changes', () => {
    const page = makePage();
    const a = previewCacheKey({ page, config: makeConfig() });
    const altConfig = ProjectConfigSchema.parse({
      volume: 1,
      title: 'T',
      authorName: 'A',
      colorPalette: { accent: '#abcdef' },
    });
    const b = previewCacheKey({ page, config: altConfig });
    expect(a).not.toBe(b);
  });
});

describe('preview cache read/write', () => {
  it('returns null on cache miss', async () => {
    expect(await readPreviewFromCache('nonexistent-key-12345')).toBeNull();
  });

  it('round-trips a buffer', async () => {
    const buf = Buffer.from('hello pdf', 'utf8');
    const key = previewCacheKey({ page: makePage(), config: makeConfig() });
    await writePreviewToCache(key, buf);
    const got = await readPreviewFromCache(key);
    expect(got).not.toBeNull();
    expect(got!.equals(buf)).toBe(true);
  });

  it('clearPreviewCache wipes entries', async () => {
    const buf = Buffer.from('x', 'utf8');
    const key = previewCacheKey({ page: makePage(), config: makeConfig() });
    await writePreviewToCache(key, buf);
    expect(await readPreviewFromCache(key)).not.toBeNull();
    await clearPreviewCache();
    expect(await readPreviewFromCache(key)).toBeNull();
  });
});
