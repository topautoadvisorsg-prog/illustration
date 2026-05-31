import { describe, expect, it } from 'vitest';
import {
  assertUsableManuscriptOutline,
  parseManuscriptOutline,
} from '../pipeline/stage-1-ingestion/parse-manuscript-outline.js';

describe('parseManuscriptOutline', () => {
  it('extracts chapters, entries, sections, source lines, and word counts', () => {
    const outline = parseManuscriptOutline(`# CHAPTER 1 - Forest Floor

## Chanterelle

### Identification
Golden yellow mushroom with false gills running down the stem.

### Habitat
Found near hardwoods after summer rain.

## Morel

Honeycomb cap and hollow stem.

# CHAPTER 2 - Wetlands

## Cattail

Tall marsh plant with edible shoots.`);

    expect(outline.chapters).toHaveLength(2);
    expect(outline.totalEntries).toBe(3);
    expect(outline.totalWords).toBeGreaterThan(20);
    const firstChapter = outline.chapters[0];
    const secondChapter = outline.chapters[1];
    expect(firstChapter).toBeDefined();
    expect(secondChapter).toBeDefined();
    expect(firstChapter?.chapterNumber).toBe(1);
    expect(firstChapter?.entries.map((entry) => entry.title)).toEqual(['Chanterelle', 'Morel']);
    expect(firstChapter?.entries[0]?.sections.map((section) => section.title)).toEqual([
      'Identification',
      'Habitat',
    ]);
    expect(secondChapter?.entries[0]?.slug).toBe('cattail');
    expect(outline.warnings).toEqual([]);
  });

  it('fails manuscripts with no usable chapter/entry structure', () => {
    const outline = parseManuscriptOutline('## Loose Entry\n\nNo chapter.');
    expect(() => assertUsableManuscriptOutline(outline)).toThrow('NO_CHAPTERS_DETECTED');
  });
});
