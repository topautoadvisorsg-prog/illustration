import { describe, expect, it } from 'vitest';
import { assembleEpubModel, type EpubAssembleInput, type EpubMeta, type EpubSourcePage } from '../assemble-epub.js';

const meta: EpubMeta = {
  title: 'THE WILDLANDS',
  subtitle: 'New England',
  authors: ['Wade Brannock'],
  language: 'en',
  coverAlt: 'THE WILDLANDS',
};

function page(p: Partial<EpubSourcePage> & { pageKey: string }): EpubSourcePage {
  return {
    chapterNumber: 1,
    plannedPageNumber: 1,
    section: 'BODY',
    pageRole: 'opener',
    ...p,
  };
}

function baseInput(pages: EpubSourcePage[]): EpubAssembleInput {
  return {
    meta,
    chapterTitles: new Map([[1, 'Animals']]),
    entryTitles: new Map([['CH01_P005', 'Fisher']]),
    pages,
  };
}

describe('assembleEpubModel', () => {
  it('synthesizes a title page before the TOC from metadata', () => {
    const model = assembleEpubModel(baseInput([]));
    const title = model.chapters[0];
    expect(title?.beforeToc).toBe(true);
    // Title is the chapter `title` (the packer renders it as the page heading);
    // content carries subtitle/author/series so the title is not double-rendered.
    expect(title?.title).toBe('THE WILDLANDS');
    expect(title?.content).not.toContain('<h1>');
    expect(title?.content).toContain('Wade Brannock');
    expect(title?.content).toContain('New England');
  });

  it('groups an entry opener + continuation into one section with a heading', () => {
    const model = assembleEpubModel(
      baseInput([
        page({ pageKey: 'CH01_P005', entryKey: 'CH01_P005', plannedPageNumber: 5, readingFieldText: '*Pekania pennanti* | mammal\n\nThe fisher is a forest predator.' }),
        page({ pageKey: 'CH01_P005_c1', entryKey: 'CH01_P005', pageRole: 'continuation', plannedPageNumber: 6, readingFieldText: 'It dens in hollow trees.' }),
      ]),
    );
    const chapter = model.chapters.find((c) => c.title === 'Animals');
    expect(chapter).toBeDefined();
    expect(chapter?.content).toContain('<h2>Fisher</h2>');
    // scientific name extracted from the binomial header, italicized, metadata header stripped from body
    expect(chapter?.content).toContain('<em>Pekania pennanti</em>');
    expect(chapter?.content).toContain('forest predator');
    expect(chapter?.content).toContain('dens in hollow trees');
    expect(chapter?.content).not.toContain('|'); // header line removed
    expect(model.stats.entries).toBe(1);
  });

  it('exposes structured entries + image plan for the in-console preview', () => {
    const model = assembleEpubModel(
      baseInput([
        page({ pageKey: 'CH01_P005', entryKey: 'CH01_P005', plannedPageNumber: 5, readingFieldText: '*Pekania pennanti* | mammal\n\nThe fisher is a forest predator.' }),
      ]),
    );
    const chapter = model.chapters.find((c) => c.kind === 'BODY');
    expect(chapter?.entries).toHaveLength(1);
    const entry = chapter!.entries![0]!;
    expect(entry.title).toBe('Fisher');
    expect(entry.scientificName).toBe('Pekania pennanti');
    expect(entry.bodyHtml).toContain('forest predator');
    // image placement is never invisible: a hero slot is declared, not yet included
    expect(entry.heroPlacement).toBe('BEFORE_TITLE');
    expect(entry.heroIncluded).toBe(false);
    expect(model.imagePlan.heroMode).toBe('OFF');
    expect(model.imagePlan.entriesAwaitingHero).toBe(1);
    expect(model.stats.omittedImages).toBe(1);
    // chapters carry a section kind for the preview tree
    expect(model.chapters[0]?.kind).toBe('TITLE');
  });

  it('records a warning for an entry with no body text', () => {
    const model = assembleEpubModel(
      baseInput([page({ pageKey: 'CH01_P005', entryKey: 'CH01_P005', plannedPageNumber: 5, readingFieldText: '' })]),
    );
    // entry has a title (Fisher) but empty body → warning, no crash
    expect(model.stats.warnings.some((w) => /no body text/i.test(w))).toBe(true);
  });

  it('XML-escapes body text', () => {
    const model = assembleEpubModel(
      baseInput([page({ pageKey: 'CH01_P005', entryKey: 'CH01_P005', plannedPageNumber: 5, readingFieldText: 'Trees & shrubs <thrive> here.' })]),
    );
    const chapter = model.chapters.find((c) => c.title === 'Animals');
    expect(chapter?.content).toContain('Trees &amp; shrubs &lt;thrive&gt; here.');
  });

  it('keeps glossary but skips the page-number index in back matter', () => {
    const model = assembleEpubModel(
      baseInput([
        page({ pageKey: 'BM_001', section: 'BACK_MATTER', frontMatterType: 'GLOSSARY', chapterNumber: 0, readingFieldText: 'Boreal: northern forest.' }),
        page({ pageKey: 'BM_003', section: 'BACK_MATTER', frontMatterType: 'INDEX', chapterNumber: 0, readingFieldText: 'bear 12, moose 40' }),
      ]),
    );
    expect(model.chapters.some((c) => c.title === 'Glossary')).toBe(true);
    expect(model.chapters.some((c) => c.title === 'Index')).toBe(false);
    expect(model.stats.skipped).toContain('INDEX');
  });

  it('groups copyright + introduction front matter and skips half-title/title/contents', () => {
    const model = assembleEpubModel(
      baseInput([
        page({ pageKey: 'FM_001', section: 'FRONT_MATTER', frontMatterType: 'HALF_TITLE', chapterNumber: 0 }),
        page({ pageKey: 'FM_003', section: 'FRONT_MATTER', frontMatterType: 'COPYRIGHT_PAGE', chapterNumber: 0, readingFieldText: 'Copyright 2026.' }),
        page({ pageKey: 'FM_005', section: 'FRONT_MATTER', frontMatterType: 'INTRODUCTION', chapterNumber: 0, readingFieldText: 'Welcome to the wild.' }),
        page({ pageKey: 'FM_006', section: 'FRONT_MATTER', frontMatterType: 'INTRODUCTION_CONT', chapterNumber: 0, readingFieldText: 'It is a vast region.' }),
      ]),
    );
    const copyright = model.chapters.find((c) => c.title === 'Copyright');
    expect(copyright?.beforeToc).toBe(true);
    const intro = model.chapters.find((c) => c.title === 'Introduction');
    expect(intro?.content).toContain('Welcome to the wild');
    expect(intro?.content).toContain('vast region');
    expect(model.stats.skipped).toContain('HALF_TITLE');
  });
});
