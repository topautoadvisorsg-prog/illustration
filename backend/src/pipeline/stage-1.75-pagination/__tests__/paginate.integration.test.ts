import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type PageManifest, type ProjectConfig } from '@wildlands/shared';
import { paginateProject } from '../paginate.js';
import { PaginatedPageSchema } from '../types.js';

function makeConfig(): ProjectConfig {
  return ProjectConfigSchema.parse({ volume: 1, title: 'T', authorName: 'A' });
}

function makeEntry(o: Partial<PageManifest>): PageManifest {
  return {
    pageId: 'CH01_P001',
    projectId: 'p',
    chapterNumber: 1,
    pageNumber: 1,
    entryTitle: 'Entry',
    layoutTemplate: 'LAYOUT_1_STANDARD',
    imageSubject: 'subject',
    bodyMarkdown: 'body',
    warnings: [],
    ...o,
  } as PageManifest;
}

function paraOf(words: number): string {
  return Array.from({ length: words }, () => 'word').join(' ') + '.';
}

function bodyOf(paragraphCount: number, wordsEach: number): string {
  return Array.from({ length: paragraphCount }, () => paraOf(wordsEach)).join('\n\n');
}

describe('paginateProject — end-to-end orchestrator', () => {
  it('paginates a small realistic book: opener + species + warning + reference', () => {
    const entries: PageManifest[] = [
      makeEntry({
        pageId: 'CH01_P001',
        entryTitle: 'Chapter 1 — The Wildlands',
        bodyMarkdown: bodyOf(2, 30),
        contentType: 'CHAPTER_OPENER',
        imageSubject: 'a misty New England mountain range',
      }),
      makeEntry({
        pageId: 'CH01_P002',
        chapterNumber: 1,
        pageNumber: 2,
        entryTitle: 'White-tailed Deer',
        bodyMarkdown: bodyOf(10, 60),
        contentType: 'ANIMAL_PROFILE',
        imageSubject: 'a white-tailed deer at the forest edge',
      }),
      makeEntry({
        pageId: 'CH01_P003',
        chapterNumber: 1,
        pageNumber: 3,
        entryTitle: 'Hazard 5 — Hypothermia in All Seasons',
        bodyMarkdown: bodyOf(8, 90),
        contentType: 'WARNING_PAGE',
        category: 'DANGER',
        imageSubject: 'cold exposed wilderness',
      }),
      makeEntry({
        pageId: 'CH01_P004',
        chapterNumber: 1,
        pageNumber: 4,
        entryTitle: 'Glossary',
        bodyMarkdown: bodyOf(3, 25),
        contentType: 'REFERENCE_PAGE',
        imageSubject: 'small supporting wilderness illustration for glossary',
      }),
    ];

    // Pin the trim so this mechanics test (hard-breaks, linkage, part
    // accounting) is deterministic and decoupled from the Standard default trim
    // — capacity, and therefore the exact compaction distribution, depends on it.
    const result = paginateProject({
      entries,
      config: makeConfig(),
      trimSize: { widthIn: 7, heightIn: 10, bleedIn: 0.125 },
    });

    expect(result.summary.totalEntries).toBe(4);
    expect(result.summary.totalPages).toBeGreaterThanOrEqual(4);

    // Every entry has at least one page that carries its subject.
    for (const entry of entries) {
      const openers = result.pages.filter((p) => p.entryKey === entry.pageId && p.carriesSubject);
      const compactedOpeners = result.pages.filter(
        (p) => p.compactedEntryKeys?.includes(entry.pageId) && p.carriesSubject,
      );
      expect(openers.length + compactedOpeners.length).toBeGreaterThanOrEqual(1);
    }

    // The hazard page must be hard-broken: its first page is a standalone opener,
    // never compacted with the previous entry.
    const hazardPages = result.pages.filter((p) => p.entryKey === 'CH01_P003' || p.compactedEntryKeys?.includes('CH01_P003'));
    expect(hazardPages.length).toBeGreaterThan(0);
    const hazardFirst = hazardPages[0]!;
    expect(hazardFirst.layoutTemplate).toBe('LAYOUT_4_DANGER_WARNING');
    expect(hazardFirst.compactedEntryKeys).toBeNull();

    // Continuation pages keep linkage back to their opener entry.
    for (const p of result.pages) {
      if (p.pageRole === 'continuation') {
        expect(p.pageKey).toMatch(/^[A-Z0-9_]+_c\d+$/);
        expect(p.entryKey).toBeTruthy();
        expect(p.carriesSubject).toBe(false);
      }
    }

    // Total parts on each chain matches actual chain length. An entry "appears"
    // on a page if it's the primary entryKey OR listed in compactedEntryKeys —
    // that's the engine's accounting (flow-engine.ts:427-434) and what the
    // reader sees as "Part N of M" coverage. Counting primary-only would
    // miscount any entry that soft-broke onto a prior opener AND also got a
    // standalone continuation.
    const partsByEntry = new Map<string, number>();
    for (const p of result.pages) {
      const seen = new Set<string>([p.entryKey]);
      if (p.compactedEntryKeys) for (const k of p.compactedEntryKeys) seen.add(k);
      for (const k of seen) partsByEntry.set(k, (partsByEntry.get(k) ?? 0) + 1);
    }
    for (const p of result.pages) {
      expect(p.totalParts).toBe(partsByEntry.get(p.entryKey));
    }
  });

  it('assigns sequential 1-based plannedPageNumber across the whole book', () => {
    const entries: PageManifest[] = [
      makeEntry({ pageId: 'CH01_P001', entryTitle: 'A', bodyMarkdown: bodyOf(2, 30), contentType: 'SPECIES_PROFILE' }),
      makeEntry({ pageId: 'CH01_P002', entryTitle: 'B', bodyMarkdown: bodyOf(20, 80), contentType: 'SPECIES_PROFILE' }),
      makeEntry({ pageId: 'CH01_P003', entryTitle: 'C', bodyMarkdown: 'Short.', contentType: 'WARNING_PAGE' }),
    ];
    const { pages } = paginateProject({ entries, config: makeConfig() });
    expect(pages.length).toBeGreaterThan(0);
    pages.forEach((page, idx) => {
      expect(page.plannedPageNumber).toBe(idx + 1);
    });
  });

  it('every returned page passes PaginatedPageSchema validation', () => {
    const entries: PageManifest[] = [
      makeEntry({ pageId: 'CH01_P001', entryTitle: 'Opener', bodyMarkdown: bodyOf(1, 20), contentType: 'CHAPTER_OPENER' }),
      makeEntry({ pageId: 'CH01_P002', entryTitle: 'Species', bodyMarkdown: bodyOf(10, 80), contentType: 'SPECIES_PROFILE' }),
    ];
    const { pages } = paginateProject({ entries, config: makeConfig() });
    for (const page of pages) {
      // Throws on any schema violation; the orchestrator already runs this,
      // but we re-run to assert the schema is exported correctly and that
      // every field is present on the returned objects.
      expect(() => PaginatedPageSchema.parse(page)).not.toThrow();
    }
  });

  it('sorts entries into book order even when fed scrambled (cross-chapter compaction bug)', () => {
    // The manifest query has no ORDER BY, so entries can arrive Postgres-
    // arbitrary. Feed them scrambled (Ch8, Ch2, Ch1) and assert pagination
    // restores book order — otherwise compaction merges cross-chapter
    // neighbours (the real bug: a Ch2 loon onto a Ch8 bushcraft page).
    const scrambled: PageManifest[] = [
      makeEntry({ pageId: 'CH08_P001', chapterNumber: 8, pageNumber: 1, entryTitle: 'Bushcraft', bodyMarkdown: bodyOf(2, 20) }),
      makeEntry({ pageId: 'CH02_P001', chapterNumber: 2, pageNumber: 1, entryTitle: 'Loon', bodyMarkdown: bodyOf(2, 20) }),
      makeEntry({ pageId: 'CH01_P001', chapterNumber: 1, pageNumber: 1, entryTitle: 'Geology', bodyMarkdown: bodyOf(2, 20) }),
    ];
    const result = paginateProject({ entries: scrambled, config: makeConfig() });
    const chapters = result.pages.map((p) => p.chapterNumber);
    for (let i = 1; i < chapters.length; i++) {
      expect(chapters[i]!).toBeGreaterThanOrEqual(chapters[i - 1]!); // non-decreasing
    }
    // no compacted page may mix two different chapters.
    for (const p of result.pages) {
      if (p.compactedEntryKeys && p.compactedEntryKeys.length > 1) {
        const chs = new Set(p.compactedEntryKeys.map((k) => k.slice(0, 4)));
        expect(chs.size).toBe(1);
      }
    }
  });

  it('keeps existing-project behavior untouched: pure function with no DB side effects', () => {
    // Smoke test: calling paginateProject does not throw and does not require
    // any environment / network access. Existing projects pass the feature
    // flag check before this would ever be invoked, so absent persistence
    // wiring there is zero behavior change.
    const result = paginateProject({
      entries: [makeEntry({ bodyMarkdown: bodyOf(1, 50), contentType: 'SPECIES_PROFILE' })],
      config: makeConfig(),
    });
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings).toBeInstanceOf(Array);
    expect(result.summary).toBeDefined();
  });
});
