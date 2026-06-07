import { describe, expect, it } from 'vitest';
import type { PageManifest } from '@wildlands/shared';
import {
  DEFAULT_ENTRY_BREAK_POLICY,
  breakBehaviorFor,
  entriesToStream,
  type EntryStartToken,
  type ParagraphToken,
  type AtomicBlockToken,
} from '../stream.js';

function makeEntry(overrides: Partial<PageManifest>): PageManifest {
  return {
    pageId: 'CH01_P001',
    projectId: 'project-1',
    chapterNumber: 1,
    pageNumber: 1,
    entryTitle: 'Test Entry',
    layoutTemplate: 'LAYOUT_1_STANDARD',
    imageSubject: 'a forest',
    bodyMarkdown: 'A short body paragraph.',
    warnings: [],
    ...overrides,
  } as PageManifest;
}

describe('breakBehaviorFor', () => {
  it('returns hard for the default hard-break content types', () => {
    expect(breakBehaviorFor('WARNING_PAGE')).toBe('hard');
    expect(breakBehaviorFor('CHAPTER_OPENER')).toBe('hard');
    expect(breakBehaviorFor('BOTANICAL_PLATE')).toBe('hard');
    expect(breakBehaviorFor('DIAGNOSTIC_DIAGRAM')).toBe('hard');
  });

  it('returns soft for everything else', () => {
    expect(breakBehaviorFor('SPECIES_PROFILE')).toBe('soft');
    expect(breakBehaviorFor('ENCYCLOPEDIA_ENTRY')).toBe('soft');
    expect(breakBehaviorFor('REFERENCE_PAGE')).toBe('soft');
    expect(breakBehaviorFor(undefined)).toBe('soft');
  });

  it('honors a custom policy', () => {
    const policy = { ...DEFAULT_ENTRY_BREAK_POLICY, alwaysHardBreak: ['REFERENCE_PAGE' as const] };
    expect(breakBehaviorFor('REFERENCE_PAGE', policy)).toBe('hard');
    expect(breakBehaviorFor('WARNING_PAGE', policy)).toBe('soft');
  });
});

describe('entriesToStream — token shape', () => {
  it('emits one entry-start + paragraph tokens for a simple entry', () => {
    const entry = makeEntry({
      bodyMarkdown: 'First paragraph here.\n\nSecond paragraph here.',
      contentType: 'SPECIES_PROFILE',
    });
    const tokens = entriesToStream([entry]);

    expect(tokens).toHaveLength(3);
    const start = tokens[0] as EntryStartToken;
    expect(start.kind).toBe('entry-start');
    expect(start.entryKey).toBe('CH01_P001');
    expect(start.entryTitle).toBe('Test Entry');
    expect(start.breakBehavior).toBe('soft');

    const p1 = tokens[1] as ParagraphToken;
    expect(p1.kind).toBe('paragraph');
    expect(p1.markdown).toBe('First paragraph here.');
    expect(p1.chars).toBeGreaterThan(0);
    expect(p1.words).toBe(3);

    const p2 = tokens[2] as ParagraphToken;
    expect(p2.markdown).toBe('Second paragraph here.');
    expect(p2.words).toBe(3);
  });

  it('preserves order across multiple entries', () => {
    const a = makeEntry({ pageId: 'CH01_P001', entryTitle: 'Alpha', bodyMarkdown: 'A body.' });
    const b = makeEntry({ pageId: 'CH01_P002', entryTitle: 'Beta', bodyMarkdown: 'B body.' });
    const tokens = entriesToStream([a, b]);

    const starts = tokens.filter((t) => t.kind === 'entry-start') as EntryStartToken[];
    expect(starts.map((s) => s.entryKey)).toEqual(['CH01_P001', 'CH01_P002']);

    const aBodyIdx = tokens.findIndex((t) => t.kind === 'paragraph' && (t as ParagraphToken).markdown === 'A body.');
    const bStartIdx = tokens.findIndex((t) => t.kind === 'entry-start' && (t as EntryStartToken).entryKey === 'CH01_P002');
    expect(aBodyIdx).toBeLessThan(bStartIdx);
  });

  it('derives hard break behavior from WARNING_PAGE content type', () => {
    const entry = makeEntry({ contentType: 'WARNING_PAGE', bodyMarkdown: 'A danger.' });
    const tokens = entriesToStream([entry]);
    const start = tokens[0] as EntryStartToken;
    expect(start.breakBehavior).toBe('hard');
  });

  it('treats a fenced code block as a single atomic token', () => {
    const entry = makeEntry({
      bodyMarkdown: 'Prose before.\n\n```\nline 1\nline 2\nline 3\n```\n\nProse after.',
    });
    const tokens = entriesToStream([entry]);
    const atomic = tokens.find((t) => t.kind === 'code-block') as AtomicBlockToken | undefined;
    expect(atomic).toBeDefined();
    expect(atomic?.markdown).toContain('line 1');
    expect(atomic?.markdown).toContain('line 3');
    // The atomic block is not also emitted as a paragraph token.
    const paraTexts = tokens
      .filter((t) => t.kind === 'paragraph')
      .map((t) => (t as ParagraphToken).markdown);
    expect(paraTexts).toEqual(['Prose before.', 'Prose after.']);
  });

  it('treats a standalone image embed as an atomic token', () => {
    const entry = makeEntry({
      bodyMarkdown: 'Caption text.\n\n![alt](https://example/x.png)\n\nMore text.',
    });
    const tokens = entriesToStream([entry]);
    const atomic = tokens.find((t) => t.kind === 'image-embed') as AtomicBlockToken | undefined;
    expect(atomic).toBeDefined();
    expect(atomic?.markdown).toBe('![alt](https://example/x.png)');
  });

  it('keeps section headings as their own tokens in source order', () => {
    const entry = makeEntry({
      bodyMarkdown: 'Intro paragraph.\n\n## Subhead\n\nNext paragraph.',
    });
    const tokens = entriesToStream([entry]);
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toEqual(['entry-start', 'paragraph', 'section-heading', 'paragraph']);
  });
});
