import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type PageManifest, type ProjectConfig } from '@wildlands/shared';
import {
  DEFAULT_CONTINUATION_LAYOUT,
  buildLayoutSequence,
  preferredOpenerLayout,
  roughEstimateContinuationPages,
} from '../layout-sequence.js';

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

describe('preferredOpenerLayout — content-type mapping', () => {
  const cfg = makeConfig();

  it('routes danger content to the warning layout', () => {
    expect(preferredOpenerLayout(makeEntry({ contentType: 'WARNING_PAGE' }), cfg)).toBe(
      'LAYOUT_4_DANGER_WARNING',
    );
  });

  it('routes chapter openers to the opener layout', () => {
    expect(preferredOpenerLayout(makeEntry({ contentType: 'CHAPTER_OPENER' }), cfg)).toBe(
      'LAYOUT_5_CHAPTER_OPENER',
    );
  });

  it('routes diagnostic content to the diagnostic layout', () => {
    expect(preferredOpenerLayout(makeEntry({ contentType: 'DIAGNOSTIC_DIAGRAM' }), cfg)).toBe(
      'LAYOUT_12_DIAGNOSTIC_DIAGRAM',
    );
  });

  it('routes species profiles to the project default', () => {
    expect(preferredOpenerLayout(makeEntry({ contentType: 'SPECIES_PROFILE' }), cfg)).toBe(
      cfg.layoutPolicy.defaultTemplate,
    );
  });

  it('respects the danger override even when content type is benign', () => {
    expect(
      preferredOpenerLayout(
        makeEntry({ contentType: 'SPECIES_PROFILE', category: 'TOXIC' }),
        cfg,
      ),
    ).toBe('LAYOUT_4_DANGER_WARNING');
  });
});

describe('roughEstimateContinuationPages', () => {
  it('returns 0 for entries that fit a single block', () => {
    expect(roughEstimateContinuationPages(makeEntry({ bodyMarkdown: 'word '.repeat(100) }))).toBe(0);
  });

  it('returns 1+ for entries that overflow', () => {
    const longBody = 'word '.repeat(1500);
    expect(roughEstimateContinuationPages(makeEntry({ bodyMarkdown: longBody }))).toBeGreaterThan(0);
  });

  it('scales with word count', () => {
    const short = roughEstimateContinuationPages(makeEntry({ bodyMarkdown: 'word '.repeat(700) }));
    const long = roughEstimateContinuationPages(makeEntry({ bodyMarkdown: 'word '.repeat(2500) }));
    expect(long).toBeGreaterThan(short);
  });
});

describe('buildLayoutSequence', () => {
  const cfg = makeConfig();

  it('produces an opener slot for each entry', () => {
    const entries = [
      makeEntry({ pageId: 'CH01_P001', contentType: 'CHAPTER_OPENER', bodyMarkdown: 'a' }),
      makeEntry({ pageId: 'CH01_P002', contentType: 'SPECIES_PROFILE', bodyMarkdown: 'b' }),
      makeEntry({ pageId: 'CH01_P003', contentType: 'WARNING_PAGE', bodyMarkdown: 'c' }),
    ];
    const seq = buildLayoutSequence(entries, cfg);
    const openers = seq.slots.filter((s) => s.role === 'opener');
    expect(openers.map((o) => o.provisionedFor)).toEqual(['CH01_P001', 'CH01_P002', 'CH01_P003']);
    expect(openers.map((o) => o.layoutTemplate)).toEqual([
      'LAYOUT_5_CHAPTER_OPENER',
      cfg.layoutPolicy.defaultTemplate,
      'LAYOUT_4_DANGER_WARNING',
    ]);
  });

  it('pads continuation slots for long entries', () => {
    const longBody = 'word '.repeat(2500);
    const entries = [
      makeEntry({ pageId: 'CH01_P001', bodyMarkdown: longBody, contentType: 'SPECIES_PROFILE' }),
    ];
    const seq = buildLayoutSequence(entries, cfg);
    const continuations = seq.slots.filter((s) => s.role === 'continuation');
    expect(continuations.length).toBeGreaterThan(0);
    for (const c of continuations) {
      expect(c.layoutTemplate).toBe(DEFAULT_CONTINUATION_LAYOUT);
      expect(c.provisionedFor).toBe('CH01_P001');
    }
  });

  it('records the opener index per entry key', () => {
    const entries = [
      makeEntry({ pageId: 'CH01_P001', bodyMarkdown: 'a' }),
      makeEntry({ pageId: 'CH01_P002', bodyMarkdown: 'word '.repeat(2000) }),
      makeEntry({ pageId: 'CH01_P003', bodyMarkdown: 'c' }),
    ];
    const seq = buildLayoutSequence(entries, cfg);
    expect(seq.openerIndexByEntryKey.get('CH01_P001')).toBe(0);
    // P002's opener comes after P001 (no continuations for P001) but the actual
    // index depends on the rough estimate, so we just assert ordering.
    const p2 = seq.openerIndexByEntryKey.get('CH01_P002');
    const p3 = seq.openerIndexByEntryKey.get('CH01_P003');
    expect(p2).toBeDefined();
    expect(p3).toBeDefined();
    expect((p2 ?? -1) < (p3 ?? -1)).toBe(true);
  });
});
