/**
 * Data-driven book identity — series / volume / cover description.
 *
 * Proves (no spend, no DB) that the cover prompt and the series page are built
 * from the project's fields, with NOTHING book- or series-specific hardcoded:
 * the cover scene follows the subtitle/region, the series line is the single
 * source of truth, and the same data produces a different book by changing only
 * the data.
 */

import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, buildSeriesLine, toRoman, stripLeadingOrdinal } from '@wildlands/shared';
import { buildCoverWrapPrompt } from '../pipeline/stage-6-layout/render-chapter.js';
import { computeCoverDimensions } from '../pipeline/stage-6-layout/render-html.js';
import { buildPageRolePolicy, type PageRolePolicy } from '../pipeline/whole-page-render/page-role-policy.js';
import { buildPageSpec } from '../pipeline/whole-page-render/build-page-spec.js';
import { computePageGeometry } from '../pipeline/stage-6-layout/page-geometry.js';
import type { LayoutAllocation } from '../pipeline/stage-6-layout/layout-director.js';
import type { PageRow } from '../db/repositories/pagination.repo.js';

function cfg(over: Record<string, unknown>) {
  return ProjectConfigSchema.parse({
    volume: 1,
    title: 'T',
    authorName: 'A',
    trimSize: { widthIn: 7, heightIn: 10, bleedIn: 0.125 },
    ...over,
  });
}

const seriesRow = { section: 'BM', frontMatterType: 'ABOUT_SERIES', pageKey: 'BM_001_SERIES', layoutTemplate: null, pageRole: null, plannedPageNumber: 1, chapterNumber: 0 } as unknown as PageRow;

describe('buildSeriesLine / toRoman (shared)', () => {
  it('formats "[SERIES] — VOLUME [Roman]" and stores volume as a number', () => {
    expect(buildSeriesLine('The Wildlands Series', 3)).toBe('THE WILDLANDS SERIES — VOLUME III');
    expect(buildSeriesLine('The Ocean Collection', 1)).toBe('THE OCEAN COLLECTION — VOLUME I');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(9)).toBe('IX');
  });
  it('returns null when no series name (nothing hardcoded)', () => {
    expect(buildSeriesLine('', 3)).toBeNull();
    expect(buildSeriesLine(undefined, undefined)).toBeNull();
  });
});

describe('stripLeadingOrdinal — clean reader-facing titles', () => {
  it('drops a leading manuscript ordinal', () => {
    expect(stripLeadingOrdinal('1. Black Bear')).toBe('Black Bear');
    expect(stripLeadingOrdinal('2. Moose')).toBe('Moose');
    expect(stripLeadingOrdinal('10) Eastern White Pine')).toBe('Eastern White Pine');
    expect(stripLeadingOrdinal('  3.  White-Tailed Deer')).toBe('White-Tailed Deer');
  });
  it('leaves real titles untouched (conservative)', () => {
    expect(stripLeadingOrdinal('Hazard 3 — Moose')).toBe('Hazard 3 — Moose');
    expect(stripLeadingOrdinal('Black Bear')).toBe('Black Bear');
    expect(stripLeadingOrdinal('1080p Trail Cameras')).toBe('1080p Trail Cameras');
    expect(stripLeadingOrdinal('THE THREE WILDERNESS ZONES')).toBe('THE THREE WILDERNESS ZONES');
  });
  it('a cleaned set sorts as a proper alphabetical index (no "10" before "2")', () => {
    const titles = ['10. Fisher', '2. Moose', '1. Black Bear'].map(stripLeadingOrdinal);
    titles.sort((a, b) => a.localeCompare(b));
    expect(titles).toEqual(['Black Bear', 'Fisher', 'Moose']);
  });
});

describe('buildPageSpec — entry opener title band is clean (production builder)', () => {
  const geometry = computePageGeometry({ widthIn: 7, heightIn: 10, bleedIn: 0.125 });
  const allocation = {
    textSafeZones: [],
    imagePlacement: 'full-page artwork',
    textPlacement: 'calm reading field',
  } as unknown as LayoutAllocation;
  const interiorPolicy: PageRolePolicy = {
    pageType: 'INTERIOR',
    layoutTemplate: 'LAYOUT_D_PURE_TEXT',
    title: { kicker: '', number: '', name: '' },
    entryTitle: '',
    imageSubject: 'Black Bear in a New England forest',
    allowsEmptyBody: false,
    renderBodyText: true,
  };
  const pageRow = {
    pageKey: 'CH02_P001',
    chapterNumber: 2,
    plannedPageNumber: 23,
    pageRole: 'opener',
    readingFieldText: 'The black bear is the largest land predator in the region.',
  } as unknown as PageRow;

  it('strips the manuscript ordinal from the title band and hierarchy', () => {
    const spec = buildPageSpec({
      pageRow,
      config: cfg({ subtitle: 'New England' }),
      geometry,
      allocation,
      entryTitle: '1. Black Bear',
      imageSubject: 'Black Bear in a New England forest',
      pageRolePolicy: interiorPolicy,
    });
    expect(spec.pageText.title.name).toBe('BLACK BEAR');
    expect(spec.typographyDNA.titleHierarchy).toEqual(['BLACK BEAR']);
    // ordinal must not leak anywhere into the title band
    expect(spec.pageText.title.name).not.toMatch(/^\d/);
  });
});

describe('cover prompt is data-driven', () => {
  const wildlands = cfg({
    volume: 3,
    title: 'The Wildlands',
    subtitle: 'Pacific Northwest',
    publishing: {
      coverDescription: 'A Field Guide to the Pacific Northwest Wilderness',
      series: { name: 'The Wildlands Series', volumeNumber: 3 },
    },
  });

  it('bakes the series line + cover description + region, never hardcoded New England', () => {
    const dims = computeCoverDimensions(wildlands, 200);
    const prompt = buildCoverWrapPrompt(wildlands, 200, dims);
    expect(prompt).toContain('THE WILDLANDS SERIES — VOLUME III');
    expect(prompt).toContain('A Field Guide to the Pacific Northwest Wilderness');
    expect(prompt).toContain('Pacific Northwest');
    expect(prompt).not.toContain('New England');
  });

  it('bakes the structured back cover as three distinct pieces', () => {
    const withBack = cfg({
      volume: 1,
      title: 'The Wildlands',
      subtitle: 'New England',
      publishing: {
        bookDescription: {
          blurb: 'Everything the New England backcountry can teach you.',
          features: ['Animals — identification and encounters', 'Plants & Foraging — edible and deadly look-alikes'],
          authorBio: 'Wade Brannock built the guide he wished existed.',
        },
      },
    });
    const dims = computeCoverDimensions(withBack, 200);
    const prompt = buildCoverWrapPrompt(withBack, 200, dims);
    // the three pieces reach the prompt under distinct keys (the model gets the hierarchy)
    expect(prompt).toContain('mainDescription');
    expect(prompt).toContain('insideThisVolume');
    expect(prompt).toContain('authorBio');
    expect(prompt).toContain('Everything the New England backcountry can teach you.');
    expect(prompt).toContain('Animals — identification and encounters');
    expect(prompt).toContain('Wade Brannock built the guide he wished existed.');
  });

  it('legacy hooks still feed the back-cover main description', () => {
    const legacy = cfg({ volume: 1, title: 'T', publishing: { bookDescription: { hooks: ['Old hook line one.', 'Old hook line two.'] } } });
    const dims = computeCoverDimensions(legacy, 100);
    const prompt = buildCoverWrapPrompt(legacy, 100, dims);
    expect(prompt).toContain('Old hook line one. Old hook line two.');
  });

  it('a different publisher produces a different cover from the SAME code', () => {
    const ocean = cfg({
      volume: 1,
      title: 'The Ocean Atlas',
      subtitle: 'The Coral Reefs',
      publishing: { series: { name: 'The Ocean Collection', volumeNumber: 1 } },
    });
    const dims = computeCoverDimensions(ocean, 120);
    const prompt = buildCoverWrapPrompt(ocean, 120, dims);
    expect(prompt).toContain('THE OCEAN COLLECTION — VOLUME I');
    expect(prompt).toContain('The Coral Reefs');
    expect(prompt).not.toContain('Wildlands');
    expect(prompt).not.toContain('New England');
  });
});

describe('series page heading is data-driven', () => {
  it('reads the series name from config (no hardcoded "THE WILD LANDS SERIES")', () => {
    const policy = buildPageRolePolicy(seriesRow, cfg({ publishing: { series: { name: 'The Ocean Collection', volumeNumber: 1 } } }));
    expect(policy.title.name).toBe('THE OCEAN COLLECTION');
    expect(policy.title.name).not.toBe('THE WILD LANDS SERIES');
  });
});

describe('front-matter page region is data-driven (no hardcoded "New England")', () => {
  const region = cfg({ subtitle: 'Pacific Northwest', publishing: { subtitle: 'Pacific Northwest' } });
  const introRow = { section: 'FM', frontMatterType: 'INTRODUCTION', pageKey: 'FM_INTRO', layoutTemplate: null, pageRole: null, plannedPageNumber: 1, chapterNumber: 0 } as unknown as PageRow;
  const authorRow = { section: 'BM', frontMatterType: 'ABOUT_AUTHOR', pageKey: 'BM_AUTHOR', layoutTemplate: null, pageRole: null, plannedPageNumber: 1, chapterNumber: 0 } as unknown as PageRow;

  it('intro + author pages use the book region, not New England', () => {
    const intro = buildPageRolePolicy(introRow, region);
    expect(intro.imageSubject).toContain('Pacific Northwest');
    expect(intro.imageSubject).not.toContain('New England');
    const author = buildPageRolePolicy(authorRow, region);
    expect(author.imageSubject).toContain('Pacific Northwest');
    expect(author.imageSubject).not.toContain('New England');
  });
});
