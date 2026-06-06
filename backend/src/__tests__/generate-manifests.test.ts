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

    // Subject derivation: a literary section title ("THE THREE WILDERNESS ZONES")
    // must NOT become the image subject — page context drives it instead.
    expect(zones?.imageSubject.toLowerCase()).not.toContain('three wilderness zones');
    expect(zones?.imageSubject.toLowerCase()).toMatch(/forest|alpine|hardwood|boreal/);
    // A species page keeps its concrete title + scientific name as the subject.
    expect(moose?.imageSubject).toContain('Alces alces');
  });

  it('derives a concrete VISUAL subject from page context for a literary/thematic title', () => {
    const outline = parseManuscriptOutline(`# THE WILD LANDS

# FULL CHAPTER OUTLINE

## CHAPTER 1 - KNOW YOUR REGION

Outline-only text.

# CHAPTER 1 - KNOW YOUR REGION

## THE BONES OF THE LAND - Geography & Geology

The region is built on ancient granite bedrock. Glacial ice carved the deep valleys and left scattered boulders across the mountain ranges. Exposed ridgelines and rocky outcrops reveal the layered strata beneath the forest.`);

    const config = ProjectConfigSchema.parse({ volume: 1, title: 'The Wild Lands', authorName: 'Wildlands' });
    const result = buildDeterministicManifestResult(outline, config);
    const bones = result.chapters[0]?.entries[0];

    expect(bones?.contentType).toBe('TERRAIN_ANALYSIS');
    // The literary title must NOT survive into the image subject.
    expect(bones?.imageSubject.toLowerCase()).not.toContain('bones of the land');
    // Page context yields depictable terrain subjects (granite/glacial/mountain).
    expect(bones?.imageSubject.toLowerCase()).toMatch(/granite|glacial|mountain|ridge|bedrock|outcrop/);
    // Still wrapped with the terrain content-type framing.
    expect(bones?.imageSubject).toContain('New England terrain feature:');
  });

  it('falls back to a general landscape (never a raw chapter heading) when page + chapter lack a depictable subject', () => {
    const outline = parseManuscriptOutline(`# THE WILD LANDS

# FULL CHAPTER OUTLINE

## CHAPTER 1 - KNOW YOUR REGION

Outline-only text.

# CHAPTER 1 - KNOW YOUR REGION

## At a Glance

A short orientation note about using this guide responsibly and safely.`);

    const config = ProjectConfigSchema.parse({ volume: 1, title: 'The Wild Lands', authorName: 'Wildlands' });
    const result = buildDeterministicManifestResult(outline, config);
    const entry = result.chapters[0]?.entries[0];

    // The raw chapter heading must never become the subject.
    expect(entry?.imageSubject.toLowerCase()).not.toContain('chapter 1');
    expect(entry?.imageSubject.toLowerCase()).not.toContain('know your region');
    // Falls back to a general, depictable wilderness landscape.
    expect(entry?.imageSubject.toLowerCase()).toContain('wilderness landscape');
  });
});
