import { describe, expect, it } from 'vitest';
import { deriveEntries, validateEntries, type DeriveSourcePage } from '../derive-entries.js';

function page(p: Partial<DeriveSourcePage> & { pageKey: string }): DeriveSourcePage {
  return { chapterNumber: 1, plannedPageNumber: 1, section: 'BODY', pageRole: 'opener', ...p };
}

const chapterTitles = new Map<number, string>([[1, 'Trees'], [2, 'Animals']]);
const entryMeta = new Map([
  ['CH01_P001', { entryTitle: 'Eastern White Pine', contentType: 'PLANT' }],
  ['CH01_P005', { entryTitle: 'Eastern Hemlock', contentType: 'TREE' }],
  ['CH02_P001', { entryTitle: 'Black Bear', contentType: 'SPECIES' }],
]);

const pages: DeriveSourcePage[] = [
  page({ pageKey: 'FM_001', section: 'FRONT_MATTER', chapterNumber: 0, entryKey: 'FM_001', readingFieldText: 'title page' }),
  page({ pageKey: 'CH01_P001', entryKey: 'CH01_P001', plannedPageNumber: 1, readingFieldText: '*Pinus strobus* | tree\n\nThe white pine is tall.' }),
  page({ pageKey: 'CH01_P001_c1', entryKey: 'CH01_P001', pageRole: 'continuation', plannedPageNumber: 2, readingFieldText: 'It has soft needles in bundles of five.' }),
  page({ pageKey: 'CH01_P005', entryKey: 'CH01_P005', plannedPageNumber: 5, readingFieldText: 'The hemlock prefers shade.' }),
  page({ pageKey: 'CH02_P001', entryKey: 'CH02_P001', chapterNumber: 2, plannedPageNumber: 10, readingFieldText: '*Ursus americanus* | mammal\n\nThe black bear forages widely.' }),
];

describe('deriveEntries', () => {
  it('groups body pages into entries by entryKey, excludes front matter', () => {
    const entries = deriveEntries({ pages, chapterTitles, entryMeta });
    expect(entries).toHaveLength(3); // 2 trees + 1 animal; front matter excluded
    const pine = entries.find((e) => e.entryKey === 'CH01_P001')!;
    expect(pine.entryTitle).toBe('Eastern White Pine');
    expect(pine.scientificName).toBe('Pinus strobus'); // extracted from the binomial header
    expect(pine.entryType).toBe('PLANT');
    expect(pine.pageCount).toBe(2); // opener + continuation
    expect(pine.pageKeys).toEqual(['CH01_P001', 'CH01_P001_c1']);
    expect(pine.firstPageKey).toBe('CH01_P001');
    expect(pine.chapterTitle).toBe('Trees');
    expect(pine.wordCount).toBeGreaterThan(0);
  });

  it('assigns 1..N reading order across chapters', () => {
    const entries = deriveEntries({ pages, chapterTitles, entryMeta });
    expect(entries.map((e) => e.readingOrder)).toEqual([1, 2, 3]);
    expect(entries.map((e) => e.entryKey)).toEqual(['CH01_P001', 'CH01_P005', 'CH02_P001']);
    expect(entries[2]!.chapterNumber).toBe(2);
  });

  it('validation passes for a clean derivation', () => {
    const entries = deriveEntries({ pages, chapterTitles, entryMeta });
    const report = validateEntries(entries, pages);
    expect(report.passed).toBe(true);
    expect(report.entryCount).toBe(3);
    expect(report.bodyOpeners).toBe(3);
  });

  it('validation flags an orphan body page', () => {
    const withOrphan = [...pages, page({ pageKey: 'CH02_P002', entryKey: 'GHOST', chapterNumber: 2, pageRole: 'continuation', plannedPageNumber: 11, readingFieldText: 'orphan' })];
    const entries = deriveEntries({ pages, chapterTitles, entryMeta }); // derived from the clean set
    const report = validateEntries(entries, withOrphan);
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.name === 'no orphan body pages')!.passed).toBe(false);
  });
});
