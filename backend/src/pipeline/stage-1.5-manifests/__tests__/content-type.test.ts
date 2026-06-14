import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { buildDeterministicManifestResult } from '../generate-manifests.js';
import type { ManuscriptChapterOutline, ManuscriptEntryOutline, ManuscriptOutline } from '../../stage-1-ingestion/parse-manuscript-outline.js';

function entry(title: string, body: string): ManuscriptEntryOutline {
  return {
    title, slug: title.toLowerCase().replace(/\s+/g, '-'),
    lineStart: 0, lineEnd: 0, startOffset: 0, endOffset: 0,
    wordCount: body.split(/\s+/).length, bodyMarkdown: body, sections: [],
  };
}
function chapter(n: number, title: string, entries: ManuscriptEntryOutline[]): ManuscriptChapterOutline {
  return { chapterNumber: n, title, slug: title.toLowerCase(), lineStart: 0, lineEnd: 0, entries };
}
function outline(chapters: ManuscriptChapterOutline[]): ManuscriptOutline {
  return { chapters, totalEntries: chapters.reduce((s, c) => s + c.entries.length, 0), totalWords: 0, warnings: [] };
}
const cfg = ProjectConfigSchema.parse({ volume: 1, title: 'T', authorName: 'A' });

describe('content-type — a species entry that mentions tracks is NOT a field-notes page', () => {
  it('Black Bear (mentions tracks/scat/sign in body) → ANIMAL_PROFILE with a strong portrait subject', () => {
    const res = buildDeterministicManifestResult(
      outline([
        chapter(2, 'CHAPTER 2 — ANIMALS', [
          entry(
            'Black Bear (Ursus americanus)',
            'The black bear leaves clear tracks and scat along the trail; look for these signs near a fresh dig.',
          ),
        ]),
      ]),
      cfg,
    );
    const e = res.chapters[0]!.entries[0]!;
    expect(e.contentType).toBe('ANIMAL_PROFILE');
    expect(e.imageSubject).toContain('Black Bear');
    expect(e.imageSubject).not.toContain('field signs');
    expect(e.imageSubject).not.toContain('small visual notes');
  });

  it('a DEDICATED "Tracks & Sign" page (by title) still routes to FIELD_NOTES_PAGE', () => {
    const res = buildDeterministicManifestResult(
      outline([
        chapter(2, 'CHAPTER 2 — ANIMALS', [
          entry('Tracks & Sign of New England Mammals', 'How to read prints, scat, and rubs in the field.'),
        ]),
      ]),
      cfg,
    );
    expect(res.chapters[0]!.entries[0]!.contentType).toBe('FIELD_NOTES_PAGE');
  });

  it('a first-aid PLANT (mentions "first aid" in body) stays a botanical SPECIES_PROFILE', () => {
    const res = buildDeterministicManifestResult(
      outline([
        chapter(3, 'CHAPTER 3 — PLANTS', [
          entry('Yarrow (Achillea millefolium)', 'Yarrow is a classic first aid plant — crushed leaves slow bleeding on a wound.'),
        ]),
      ]),
      cfg,
    );
    const e = res.chapters[0]!.entries[0]!;
    expect(e.contentType).toBe('SPECIES_PROFILE');
    expect(e.imageSubject).toContain('Yarrow');
    expect(e.imageSubject).not.toContain('small supporting');
  });

  it('a dedicated First Aid reference SECTION (by title) still routes to REFERENCE_PAGE', () => {
    const res = buildDeterministicManifestResult(
      outline([
        chapter(7, 'CHAPTER 7 — SURVIVAL', [
          entry('First Aid From the Land', 'Improvised wilderness first aid using native plants and materials.'),
        ]),
      ]),
      cfg,
    );
    expect(res.chapters[0]!.entries[0]!.contentType).toBe('REFERENCE_PAGE');
  });
});
