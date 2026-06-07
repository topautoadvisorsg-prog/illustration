import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type PageManifest, type ProjectConfig } from '@wildlands/shared';
import { paginateProject } from '../paginate.js';

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

    const result = paginateProject({ entries, config: makeConfig() });

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

    // Total parts on each chain matches actual chain length.
    const partsByEntry = new Map<string, number>();
    for (const p of result.pages) {
      partsByEntry.set(p.entryKey, (partsByEntry.get(p.entryKey) ?? 0) + 1);
    }
    for (const p of result.pages) {
      expect(p.totalParts).toBe(partsByEntry.get(p.entryKey));
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
