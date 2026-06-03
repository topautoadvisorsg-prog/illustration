import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { parseManuscriptOutline } from '../pipeline/stage-1-ingestion/parse-manuscript-outline.js';
import { buildDeterministicManifestResult } from '../pipeline/stage-1.5-manifests/generate-manifests.js';

describe('buildDeterministicManifestResult', () => {
  it('builds locked page candidates from real manuscript structure without a model pass', () => {
    const outline = parseManuscriptOutline(`# THE WILD LANDS: NEW ENGLAND

## PROJECT NOTES

Planning notes do not become chapters.

# FULL CHAPTER OUTLINE

## CHAPTER 1 - KNOW YOUR REGION

Outline-only text does not become a chapter.

# CHAPTER 1 - KNOW YOUR REGION

## THE THREE WILDERNESS ZONES

Northern boreal forest, alpine terrain, and mixed hardwood habitat define the region. Spruce traps and hypothermia matter here, but this page is still a zone overview, not a dedicated hazard page.

## Hazard 1 - Extreme Weather Above Treeline

Extreme weather and hypothermia can hit above treeline in any month.

# CHAPTER 2 - ANIMALS

### 1. Moose
*Alces alces* | Northern Boreal

**Danger Level & Encounter Protocol**

Moose are large, fast, and dangerous in rut.

# CHAPTER 3 - PLANTS

## THE FORAGER'S CODE FOR NEW ENGLAND

Harvest restraint and safety are the first rules of foraging. A field guide should teach what to pick, how to pick it, and when to leave a patch alone. New England's spring plants do not recover quickly from careless harvest.

## EDIBLE PLANTS

### 1. Wild Ramps / Ramsons
*Allium tricoccum* | Mixed Hardwood
**EDIBLE**

Wild ramps are edible spring plants, but harvest pressure matters.

### 2. Water Hemlock
*Cicuta maculata*
**TOXIC - DEADLY**

Water hemlock is a deadly plant that resembles edible wetland species.`);

    const config = ProjectConfigSchema.parse({
      volume: 1,
      title: 'The Wild Lands: New England',
      authorName: 'Wildlands',
    });

    const result = buildDeterministicManifestResult(outline, config);

    expect(result.bookTitle).toBe('The Wild Lands: New England');
    expect(result.chapters).toHaveLength(3);
    expect(result.chapters.map((chapter) => chapter.entries.length)).toEqual([2, 1, 3]);

    const [zones, weather] = result.chapters[0]?.entries ?? [];
    const moose = result.chapters[1]?.entries[0];
    const [foragersCode, ramps, hemlock] = result.chapters[2]?.entries ?? [];

    expect(zones?.contentType).toBe('HABITAT_OVERVIEW');
    expect(weather?.contentType).toBe('WARNING_PAGE');
    expect(moose?.contentType).toBe('WARNING_PAGE');
    expect(moose?.scientificName).toBe('Alces alces');
    expect(foragersCode?.contentType).toBe('REFERENCE_PAGE');
    expect(ramps?.contentType).toBe('SPECIES_PROFILE');
    expect(ramps?.scientificName).toBe('Allium tricoccum');
    expect(hemlock?.contentType).toBe('WARNING_PAGE');
    expect(hemlock?.layoutTemplate).toBe('LAYOUT_4_DANGER_WARNING');
  });
});
