import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, PUBLISHING_STANDARD_PRESETS } from '@wildlands/shared';
import {
  DEFAULT_PRODUCTION_PROFILE_ID,
  getProductionProfile,
  isKnownProductionProfile,
  listProductionProfiles,
} from '../pipeline/production-profiles/registry.js';
import { buildDeterministicManifestResult } from '../pipeline/stage-1.5-manifests/generate-manifests.js';
import { parseManuscriptOutline } from '../pipeline/stage-1-ingestion/parse-manuscript-outline.js';
import { getStyleDna, listStyleDna } from '../pipeline/publishing-standard/style-dna.js';
import {
  BW_EDUCATIONAL_SUBJECT_SELECTION,
  FIELD_GUIDE_SUBJECT_SELECTION,
} from '../pipeline/production-profiles/subject-selection.js';

const config = (over: Record<string, unknown> = {}) =>
  ProjectConfigSchema.parse({ volume: 1, title: 'T', authorName: 'A', ...over });

describe('production-profile registry', () => {
  it('defaults to the field guide so existing configs are unchanged', () => {
    expect(config().productionProfileId).toBe('wildlands-field-guide');
    expect(DEFAULT_PRODUCTION_PROFILE_ID).toBe('wildlands-field-guide');
  });

  it('falls back to the field guide on an unknown id rather than throwing', () => {
    expect(getProductionProfile('does-not-exist').id).toBe('wildlands-field-guide');
    expect(isKnownProductionProfile('does-not-exist')).toBe(false);
    expect(isKnownProductionProfile('wildlands-field-guide')).toBe(true);
  });

  it('exposes the field guide for an operator picker', () => {
    expect(listProductionProfiles()).toContainEqual({
      id: 'wildlands-field-guide',
      label: 'The Wildlands — Illustrated Field Guide',
    });
  });

  it('the field guide keeps every-page illustration, badges, and the AI page track', () => {
    const p = getProductionProfile();
    expect(p.bodyRenderTrack).toBe('ai-whole-page');
    expect(p.illustrationPolicy.mode).toBe('every-page');
    expect(p.badgesEnabled).toBe(true);
    expect(p.defaultStyleDnaId).toBe('cinematic-naturalist-color');
  });
});

// The whole point of Phase 1: routing classification through the registry must
// not move a single field on an existing Wildlands book. This pins real
// field-guide shapes end to end through buildDeterministicManifestResult.
describe('field-guide classification is unchanged by the registry', () => {
  const MANUSCRIPT = [
    '# CHAPTER 1 - KNOW YOUR REGION',
    'The granite bedrock of the region shapes everything above it.',
    '',
    '## THE BONES OF THE LAND',
    'Glacial valleys and a rocky ridgeline define the terrain here. '.repeat(8),
    '',
    '# CHAPTER 2 - MAMMALS',
    '',
    '## MAMMALS',
    '',
    '### 1. Black Bear',
    '**Ursus americanus**',
    'A large omnivore, often denning in winter beneath a boulder field. '.repeat(6),
    '',
    '### 2. Water Hemlock DEADLY',
    'Extremely toxic; grows near a flowing river and wetland marsh. '.repeat(6),
    '',
    '# CHAPTER 8 - SURVIVAL TOPICS',
    '',
    '## Hypothermia',
    'Cold kills faster than you expect near a mountain lake. '.repeat(6),
  ].join('\n');

  const result = buildDeterministicManifestResult(
    parseManuscriptOutline(MANUSCRIPT),
    config({ subtitle: 'New England' }),
  );
  const entries = result.chapters.flatMap((c) => c.entries);
  const byTitle = (t: string) => entries.find((e) => e.entryTitle.includes(t))!;

  it('still routes a chapter-opener to LAYOUT_5', () => {
    const opener = entries.find((e) => e.contentType === 'CHAPTER_OPENER')!;
    expect(opener.layoutTemplate).toBe('LAYOUT_5_CHAPTER_OPENER');
  });

  it('still classifies a ch2 catalog species as ANIMAL_PROFILE with its binomial', () => {
    const bear = byTitle('Black Bear');
    expect(bear.contentType).toBe('ANIMAL_PROFILE');
    expect(bear.scientificName).toBe('Ursus americanus');
    expect(bear.imageSubject).toBe('Black Bear (Ursus americanus)');
  });

  it('still promotes a DEADLY title to DANGER / WARNING_PAGE with the safety subject', () => {
    const hemlock = byTitle('Water Hemlock');
    expect(hemlock.category).toBe('DANGER');
    expect(hemlock.contentType).toBe('WARNING_PAGE');
    expect(hemlock.layoutTemplate).toBe('LAYOUT_4_DANGER_WARNING');
    expect(hemlock.imageSubject).toMatch(/^field-guide safety illustration for /);
  });

  it('still derives a ch1 terrain subject from body context, region-prefixed', () => {
    const bones = byTitle('BONES OF THE LAND');
    expect(bones.contentType).toBe('TERRAIN_ANALYSIS');
    // extractConcreteSubjects returns up to TWO ranked subjects joined with "and".
    expect(bones.imageSubject).toBe('New England terrain feature: glacial valley and rocky ridgeline');
  });

  it('still treats a hypothermia entry as a WARNING_PAGE (title-keyed, not body-keyed)', () => {
    const hypo = byTitle('Hypothermia');
    expect(hypo.contentType).toBe('WARNING_PAGE');
  });
});

describe('B&W educational clear-line Style DNA', () => {
  it('is registered and separate from bw-naturalist', () => {
    const ids = listStyleDna().map((p) => p.id);
    expect(ids).toContain('bw-educational-clearline');
    expect(ids).toContain('bw-naturalist');
    const clearline = getStyleDna('bw-educational-clearline');
    expect(clearline.id).not.toBe(getStyleDna('bw-naturalist').id);
    expect(clearline.medium).not.toBe(getStyleDna('bw-naturalist').medium);
  });

  it('is monochrome and print-economical (no gradients, short tonal range)', () => {
    const p = getStyleDna('bw-educational-clearline');
    expect(p.colorMode).toMatch(/BLACK & WHITE EDITION/);
    expect(p.colorMode).toMatch(/NO colour whatsoever/i);
    expect(p.colorMode).toMatch(/NO smooth gradients/i);
    expect(p.palette).toEqual({ paperHex: '#FFFFFF', inkHex: '#000000' });
  });

  it('is not naturalist/engraving and not medical-textbook', () => {
    const p = getStyleDna('bw-educational-clearline');
    const all = JSON.stringify(p).toLowerCase();
    expect(all).not.toMatch(/chromolitho|audubon|steel engraving|parchment/);
    expect(p.referenceArtists).toMatch(/NOT vintage engraving/i);
    expect(p.referenceArtists).toMatch(/NOT clinical medical atlases/i);
  });

  it('requires diagrams to prioritise instructional clarity', () => {
    const p = getStyleDna('bw-educational-clearline');
    expect(p.naturalistPrecision).toMatch(/instructional clarity outranks realism/i);
  });

  it('constrains HOW body subjects are rendered, once chosen', () => {
    const p = getStyleDna('bw-educational-clearline').naturalistPrecision;
    expect(p).toMatch(/age-appropriate/i);
    expect(p).toMatch(/non-gratuitous/i);
    expect(p).toMatch(/no titillation/i);
    expect(p).toMatch(/no body-shaming/i);
    expect(p).toMatch(/limited to the detail required to teach the concept/i);
  });

  it('does NOT decide WHETHER to depict a body — that is subject selection', () => {
    // Style DNA owns look; the production profile owns what gets illustrated.
    // Keeping selection policy out of here is the architectural boundary.
    const all = JSON.stringify(getStyleDna('bw-educational-clearline'));
    expect(all).not.toMatch(/prefer the non-body framing/i);
    expect(all).not.toMatch(/timeline, comparison, object/i);
  });
});

describe('subject-selection policy lives in the production profile, not Style DNA', () => {
  it('the field guide declares its every-page subject rule', () => {
    const policy = getProductionProfile().illustrationPolicy;
    expect(policy.mode).toBe('every-page');
    expect(policy.subjectSelection).toBe(FIELD_GUIDE_SUBJECT_SELECTION);
    expect(policy.subjectSelection?.principle).toMatch(/Every page is illustrated/);
  });

  it('the B&W educational policy makes illustrations earn their place', () => {
    expect(BW_EDUCATIONAL_SUBJECT_SELECTION.principle).toMatch(
      /improving explanation, pacing, comprehension, or reader engagement/i,
    );
    expect(BW_EDUCATIONAL_SUBJECT_SELECTION.principle).toMatch(/not illustrated by default/i);
  });

  it('prefers non-body framing WITHOUT prohibiting educational body illustration', () => {
    const prefs = BW_EDUCATIONAL_SUBJECT_SELECTION.preferences.join(' ');
    // The preference.
    expect(prefs).toMatch(/timeline, comparison, object, diagram, or ordinary everyday scene/i);
    expect(prefs).toMatch(/prefer that over unnecessary body depiction/i);
    // And explicitly NOT a ban — this is the distinction the operator drew.
    expect(prefs).toMatch(/age-appropriate educational body\/anatomical illustration IS allowed/i);
    expect(prefs).toMatch(/never a prohibition/i);
  });

  it('names body subjects as requiring explicit care', () => {
    const sensitive = (BW_EDUCATIONAL_SUBJECT_SELECTION.sensitiveSubjects ?? []).join(' ');
    expect(sensitive).toMatch(/respectful, neutral, non-gratuitous/i);
    expect(sensitive).toMatch(/limited to the detail required/i);
    expect(sensitive).toMatch(/never frame a normal body change as embarrassing/i);
  });
});

describe('5.5 x 8.5 digest trim preset', () => {
  it('is registered with the text-first typography and zero bleed', () => {
    const preset = PUBLISHING_STANDARD_PRESETS.PAPERBACK_DIGEST_5_5X8_5;
    expect(preset.trimSize).toEqual({ widthIn: 5.5, heightIn: 8.5, bleedIn: 0 });
    expect(preset.typography).toEqual({ bodyPt: 12, lineHeight: 1.3 });
  });

  it('does not disturb the Wildlands hardcover default', () => {
    expect(PUBLISHING_STANDARD_PRESETS.HARDCOVER_7X10.trimSize).toEqual({
      widthIn: 7,
      heightIn: 10,
      bleedIn: 0.125,
    });
    expect(config().publishingStandard.format).toBe('HARDCOVER_7X10');
  });
});
