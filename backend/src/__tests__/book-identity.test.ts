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
import { ProjectConfigSchema, buildSeriesLine, toRoman } from '@wildlands/shared';
import { buildCoverWrapPrompt } from '../pipeline/stage-6-layout/render-chapter.js';
import { computeCoverDimensions } from '../pipeline/stage-6-layout/render-html.js';
import { buildPageRolePolicy } from '../pipeline/whole-page-render/page-role-policy.js';
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
