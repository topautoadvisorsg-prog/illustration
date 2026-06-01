import { describe, expect, it } from 'vitest';
import {
  assertUsableManuscriptOutline,
  parseManuscriptOutline,
  validateGeneratedChaptersAgainstOutline,
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

  it('ignores headings inside fenced code blocks', () => {
    const outline = parseManuscriptOutline(`# CHAPTER 1 - Forest Floor

\`\`\`markdown
# Fake Chapter
## Fake Entry
\`\`\`

## Chanterelle

Real entry body.`);

    expect(outline.chapters).toHaveLength(1);
    expect(outline.totalEntries).toBe(1);
    expect(outline.chapters[0]?.entries[0]?.title).toBe('Chanterelle');
  });

  it('ignores planning notes and treats category children as entries in full master manuscripts', () => {
    const outline = parseManuscriptOutline(`# THE WILD LANDS: NEW ENGLAND

## PROJECT NOTES

Internal planning notes should not become a chapter.

# FULL CHAPTER OUTLINE

## CHAPTER 1 — KNOW YOUR REGION

Outline-only planning text should not become a chapter.

# CHAPTER 1 — KNOW YOUR REGION

## KEY HAZARDS — What Gets People in Trouble Here

This overview stays as a page because it has real body text. It introduces the hazard section, explains why these risks matter in New England, and gives the reader enough direct prose to justify a standalone page before the individual hazards begin.

### Hazard 1 — Extreme Weather Above Treeline

Weather shifts quickly above treeline.

# CHAPTER 2 — ANIMALS

## MAMMALS

### 1. Black Bear

Black bears are common but usually avoid people.

### 2. Moose

Moose are taller, heavier, and less impressed by your plans than you want.

# FRONT MATTER & INTRODUCTION

## COVER PAGE

This late front matter should not become part of Chapter 2.

# CHAPTER 4 — TREES

### 1. Eastern White Pine

Tall evergreen with needles in bundles of five.`);

    expect(outline.chapters.map((chapter) => chapter.title)).toEqual([
      'CHAPTER 1 — KNOW YOUR REGION',
      'CHAPTER 2 — ANIMALS',
      'CHAPTER 4 — TREES',
    ]);
    expect(outline.totalEntries).toBe(5);
    expect(outline.chapters[0]?.entries.map((entry) => entry.title)).toEqual([
      'KEY HAZARDS — What Gets People in Trouble Here',
      'Hazard 1 — Extreme Weather Above Treeline',
    ]);
    expect(outline.chapters[1]?.entries.map((entry) => entry.title)).toEqual(['1. Black Bear', '2. Moose']);
    expect(outline.chapters[2]?.entries.map((entry) => entry.title)).toEqual(['1. Eastern White Pine']);
    expect(outline.warnings).toEqual([]);
  });

  it('rejects generated manifests that change chapter metadata', () => {
    const outline = parseManuscriptOutline(`# CHAPTER 1 - Forest Floor

## Chanterelle

Real entry body.`);

    expect(() =>
      validateGeneratedChaptersAgainstOutline(
        [
          {
            chapterNumber: 2,
            chapterTitle: 'CHAPTER 1 - Forest Floor',
            entries: [{ entryTitle: 'Chanterelle' }],
          },
        ],
        outline,
      ),
    ).toThrow('expected number 1');

    expect(() =>
      validateGeneratedChaptersAgainstOutline(
        [
          {
            chapterNumber: 1,
            chapterTitle: 'Wrong Forest',
            entries: [{ entryTitle: 'Chanterelle' }],
          },
        ],
        outline,
      ),
    ).toThrow('expected title');
  });
});
