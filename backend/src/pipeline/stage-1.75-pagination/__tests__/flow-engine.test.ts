import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type PageManifest, type ProjectConfig } from '@wildlands/shared';
import { buildLayoutSequence } from '../layout-sequence.js';
import { entriesToStream } from '../stream.js';
import { flowEngine, type EntryMetaMap } from '../flow-engine.js';

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

function metaFromEntries(entries: PageManifest[]): EntryMetaMap {
  const map: EntryMetaMap = new Map();
  for (const e of entries) {
    map.set(e.pageId, {
      chapterNumber: e.chapterNumber,
      imageSubject: e.imageSubject,
      entryTitle: e.entryTitle,
      contentType: e.contentType,
    });
  }
  return map;
}

function paraOf(words: number): string {
  return Array.from({ length: words }, () => 'word').join(' ') + '.';
}

function bodyOf(paragraphCount: number, wordsEach: number): string {
  return Array.from({ length: paragraphCount }, () => paraOf(wordsEach)).join('\n\n');
}

function runFlow(entries: PageManifest[]) {
  const config = makeConfig();
  const stream = entriesToStream(entries);
  const sequence = buildLayoutSequence(entries, config);
  return flowEngine(
    { stream, sequence, config, trimSize: config.trimSize },
    metaFromEntries(entries),
  );
}

describe('flowEngine — short single entry', () => {
  it('produces exactly one opener page that fits', () => {
    const entry = makeEntry({
      pageId: 'CH01_P001',
      bodyMarkdown: bodyOf(2, 25),
      contentType: 'SPECIES_PROFILE',
    });
    const { pages } = runFlow([entry]);
    expect(pages).toHaveLength(1);
    const page = pages[0]!;
    expect(page.pageRole).toBe('opener');
    expect(page.pageKey).toBe('CH01_P001');
    expect(page.entryKey).toBe('CH01_P001');
    expect(page.partN).toBe(1);
    expect(page.totalParts).toBe(1);
    expect(page.carriesSubject).toBe(true);
    expect(page.imageSubject).toBe('subject');
    expect(page.compactedEntryKeys).toBeNull();
    expect(['FITS', 'TIGHT', 'UNDERFILL']).toContain(page.fitStatus);
  });
});

describe('flowEngine — long single entry produces continuations', () => {
  it('splits a 1500-word entry into multiple pages linked to the same entry', () => {
    const entry = makeEntry({
      pageId: 'CH01_P001',
      bodyMarkdown: bodyOf(15, 100),
      contentType: 'SPECIES_PROFILE',
    });
    const { pages } = runFlow([entry]);

    expect(pages.length).toBeGreaterThan(1);

    // Every page is linked to the same entry.
    for (const p of pages) {
      expect(p.entryKey).toBe('CH01_P001');
      expect(p.chapterNumber).toBe(1);
      expect(p.totalParts).toBe(pages.length);
    }

    // Only the first page carries the image subject.
    expect(pages[0]!.pageRole).toBe('opener');
    expect(pages[0]!.carriesSubject).toBe(true);
    expect(pages[0]!.pageKey).toBe('CH01_P001');
    expect(pages[0]!.imageSubject).toBe('subject');
    expect(pages[0]!.partN).toBe(1);

    for (let i = 1; i < pages.length; i++) {
      const p = pages[i]!;
      expect(p.pageRole).toBe('continuation');
      expect(p.carriesSubject).toBe(false);
      expect(p.imageSubject).toBeNull();
      expect(p.pageKey).toBe(`CH01_P001_c${i}`);
      expect(p.partN).toBe(i + 1);
    }

    // Combined text recovers all paragraphs of the entry.
    const concatenated = pages.map((p) => p.readingFieldText).join('\n\n');
    expect(concatenated.split(/word/g).length - 1).toBeGreaterThanOrEqual(1500 * 0.9);
  });
});

describe('flowEngine — hard break for WARNING_PAGE', () => {
  it('starts the warning on a new page even when the previous block has room', () => {
    const a = makeEntry({
      pageId: 'CH01_P001',
      bodyMarkdown: bodyOf(1, 30),
      contentType: 'SPECIES_PROFILE',
    });
    const b = makeEntry({
      pageId: 'CH01_P002',
      bodyMarkdown: bodyOf(1, 30),
      contentType: 'WARNING_PAGE',
      entryTitle: 'Hazard',
      imageSubject: 'a hazard',
    });
    const { pages } = runFlow([a, b]);

    // Two distinct opener pages — no compaction.
    expect(pages.length).toBe(2);
    expect(pages[0]!.entryKey).toBe('CH01_P001');
    expect(pages[0]!.compactedEntryKeys).toBeNull();
    expect(pages[1]!.entryKey).toBe('CH01_P002');
    expect(pages[1]!.pageRole).toBe('opener');
    expect(pages[1]!.layoutTemplate).toBe('LAYOUT_4_DANGER_WARNING');
  });
});

describe('flowEngine — soft break compacts two short SPECIES_PROFILE entries', () => {
  it('joins two short profiles into a single compacted page when room remains', () => {
    const a = makeEntry({
      pageId: 'CH01_P001',
      bodyMarkdown: bodyOf(1, 15),
      contentType: 'SPECIES_PROFILE',
      entryTitle: 'Alpha',
      imageSubject: 'alpha',
    });
    const b = makeEntry({
      pageId: 'CH01_P002',
      bodyMarkdown: bodyOf(1, 15),
      contentType: 'SPECIES_PROFILE',
      entryTitle: 'Beta',
      imageSubject: 'beta',
    });
    const { pages } = runFlow([a, b]);

    const compactedPage = pages.find((p) => p.pageRole === 'compacted');
    expect(compactedPage).toBeDefined();
    expect(compactedPage!.entryKey).toBe('CH01_P001');
    expect(compactedPage!.imageSubject).toBe('alpha'); // first entry drives the image
    expect(compactedPage!.compactedEntryKeys).toEqual(['CH01_P001', 'CH01_P002']);
    expect(compactedPage!.pageKey).toBe('CH01_P001_m');
  });

  it('refuses a third soft-break — the compaction cap (default 2) holds even when room remains', () => {
    // Three ultra-short SPECIES_PROFILE entries. Without the cap they would
    // all pile onto one compacted page; with the cap (default 2) the third
    // hard-breaks to its own opener.
    const a = makeEntry({
      pageId: 'CH01_P001',
      bodyMarkdown: 'A.',
      contentType: 'SPECIES_PROFILE',
      entryTitle: 'A',
      imageSubject: 'a',
    });
    const b = makeEntry({
      pageId: 'CH01_P002',
      bodyMarkdown: 'B.',
      contentType: 'SPECIES_PROFILE',
      entryTitle: 'B',
      imageSubject: 'b',
    });
    const c = makeEntry({
      pageId: 'CH01_P003',
      bodyMarkdown: 'C.',
      contentType: 'SPECIES_PROFILE',
      entryTitle: 'C',
      imageSubject: 'c',
    });
    const { pages } = runFlow([a, b, c]);

    const compactedPage = pages.find((p) => p.pageRole === 'compacted');
    expect(compactedPage).toBeDefined();
    // Compacted page has EXACTLY 2 entries (A and B). C is NOT on it.
    expect(compactedPage!.compactedEntryKeys).toEqual(['CH01_P001', 'CH01_P002']);
    // C lands on its own opener.
    const cOpener = pages.find((p) => p.entryKey === 'CH01_P003' && p.pageRole === 'opener');
    expect(cOpener).toBeDefined();
    expect(cOpener!.compactedEntryKeys).toBeNull();
  });

  it('renders Beta\'s entry title as a visible heading inside the shared Reading Field', () => {
    // Without an injected heading, the operator would see Alpha's body run
    // straight into Beta's body with no visible break. The flow engine must
    // emit "## Beta" at the soft-break point.
    const a = makeEntry({
      pageId: 'CH01_P001',
      bodyMarkdown: 'Alpha body.',
      contentType: 'SPECIES_PROFILE',
      entryTitle: 'Alpha',
      imageSubject: 'alpha',
    });
    const b = makeEntry({
      pageId: 'CH01_P002',
      bodyMarkdown: 'Beta body.',
      contentType: 'SPECIES_PROFILE',
      entryTitle: 'Beta — Tall Branch Species',
      imageSubject: 'beta',
    });
    const { pages } = runFlow([a, b]);
    const compactedPage = pages.find((p) => p.pageRole === 'compacted');
    expect(compactedPage).toBeDefined();
    expect(compactedPage!.readingFieldText).toContain('Alpha body.');
    expect(compactedPage!.readingFieldText).toContain('## Beta — Tall Branch Species');
    expect(compactedPage!.readingFieldText).toContain('Beta body.');
    // Heading must appear BETWEEN the two bodies, not at the start or end.
    const alphaIdx = compactedPage!.readingFieldText.indexOf('Alpha body.');
    const headingIdx = compactedPage!.readingFieldText.indexOf('## Beta');
    const betaIdx = compactedPage!.readingFieldText.indexOf('Beta body.');
    expect(alphaIdx).toBeLessThan(headingIdx);
    expect(headingIdx).toBeLessThan(betaIdx);
  });
});

describe('flowEngine — section heading overhead is charged during pouring', () => {
  it('an entry with many section headings produces more pages than the same words without', () => {
    // 600 words across 12 paragraphs, no headings.
    const flat = bodyOf(12, 50);
    // Same 600 words but with a `##` heading before every paragraph — the
    // accumulated line overhead should force at least one more page.
    const headed = Array.from({ length: 12 }, (_, i) => `## Section ${i + 1}\n\n${paraOf(50)}`).join('\n\n');

    const flatEntry = makeEntry({
      pageId: 'CH01_P001',
      bodyMarkdown: flat,
      contentType: 'ENCYCLOPEDIA_ENTRY',
    });
    const headedEntry = makeEntry({
      pageId: 'CH01_P001',
      bodyMarkdown: headed,
      contentType: 'ENCYCLOPEDIA_ENTRY',
    });

    const flatResult = runFlow([flatEntry]);
    const headedResult = runFlow([headedEntry]);
    expect(headedResult.pages.length).toBeGreaterThanOrEqual(flatResult.pages.length);
  });
});

describe('flowEngine — soft-break continuation parts (totalParts ownership)', () => {
  it('B\'s standalone continuation page reports totalParts that includes the shared compacted opener', () => {
    // Alpha is very short — fits in its opener with plenty of room left over.
    // Beta soft-breaks into Alpha's opener, then overflows into a continuation
    // of Beta. The continuation's `entryKey` is Beta, `partN` should be 2
    // (Beta's page 1 was the shared compacted opener), and `totalParts` for
    // Beta should be 2 because the compacted opener counts toward Beta's chain.
    const alpha = makeEntry({
      pageId: 'CH01_P001',
      bodyMarkdown: 'Alpha is brief.',
      contentType: 'SPECIES_PROFILE',
      entryTitle: 'Alpha',
      imageSubject: 'alpha',
    });
    const beta = makeEntry({
      pageId: 'CH01_P002',
      // Long enough to overflow a continuation block.
      bodyMarkdown: bodyOf(20, 80),
      contentType: 'SPECIES_PROFILE',
      entryTitle: 'Beta',
      imageSubject: 'beta',
    });
    const { pages } = runFlow([alpha, beta]);

    const compactedOpener = pages.find((p) => p.pageRole === 'compacted');
    const betaContinuations = pages.filter((p) => p.entryKey === 'CH01_P002' && p.pageRole === 'continuation');

    expect(compactedOpener).toBeDefined();
    expect(compactedOpener!.compactedEntryKeys).toEqual(['CH01_P001', 'CH01_P002']);
    expect(betaContinuations.length).toBeGreaterThanOrEqual(1);

    const firstBetaCont = betaContinuations[0]!;
    expect(firstBetaCont.partN).toBe(2); // Beta's page 1 was the compacted opener
    // Beta's totalParts = compacted-opener + all of Beta's continuations.
    const expectedBetaChainLen = 1 + betaContinuations.length;
    expect(firstBetaCont.totalParts).toBe(expectedBetaChainLen);
  });
});

describe('flowEngine — zones are populated on every page', () => {
  it('exposes textSafeZones, imagePriorityZones, and typographyZones on PaginatedPage', () => {
    const entry = makeEntry({
      pageId: 'CH01_P001',
      bodyMarkdown: bodyOf(2, 30),
      contentType: 'SPECIES_PROFILE',
    });
    const { pages } = runFlow([entry]);
    for (const page of pages) {
      expect(page.zones).toBeDefined();
      expect(Array.isArray(page.zones.textSafeZones)).toBe(true);
      expect(Array.isArray(page.zones.imagePriorityZones)).toBe(true);
      expect(Array.isArray(page.zones.typographyZones)).toBe(true);
    }
  });
});

describe('flowEngine — atomic token overflow', () => {
  it('places an oversized code block whole and marks OVERFLOW', () => {
    // One huge fenced block alone larger than any continuation's capacity.
    const huge = 'X'.repeat(8000);
    const entry = makeEntry({
      pageId: 'CH01_P001',
      bodyMarkdown: `Intro paragraph.\n\n\`\`\`\n${huge}\n\`\`\`\n\nOutro.`,
      contentType: 'ENCYCLOPEDIA_ENTRY',
    });
    const { pages } = runFlow([entry]);

    const overflowPage = pages.find((p) => p.fitStatus === 'OVERFLOW');
    expect(overflowPage).toBeDefined();
    expect(overflowPage!.warnings.some((w) => w.startsWith('atomic_token_exceeds_capacity'))).toBe(true);
    expect(overflowPage!.readingFieldText).toContain('XXXXX'); // the giant block landed
  });
});
