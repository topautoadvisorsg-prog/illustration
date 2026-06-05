import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type PageManifest } from '@wildlands/shared';
import { buildPageQualityReview } from '../services/page-quality/page-quality-review.js';

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'The Wildlands',
  authorName: 'The Wildlands',
  trimSize: { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 },
  typography: { bodyPt: 11, lineHeight: 1.28 },
});

function words(n: number): string {
  return Array(n).fill('terrain').join(' ');
}

function page(pageId: string, overrides: Partial<PageManifest> = {}): PageManifest {
  const pageNumber = Number(pageId.slice(-3));
  const chapterNumber = Number(pageId.slice(2, 4));
  return {
    pageId,
    chapterNumber,
    pageNumber,
    entryTitle: `Entry ${pageId}`,
    layoutTemplate: 'LAYOUT_1_STANDARD',
    imageSubject: 'New England terrain',
    bodyMarkdown: words(300),
    warnings: [],
    ...overrides,
  };
}

describe('Page Quality Review publishing director', () => {
  it('proposes fixes for awkward continuation pages instead of only flagging them', () => {
    const review = buildPageQualityReview(
      [
        page('CH01_P001', {
          contentType: 'TERRAIN_ANALYSIS',
          entryTitle: 'Climate and Seasons',
          bodyMarkdown: words(340),
        }),
      ],
      config,
    );

    const finding = review.findings.find((candidate) => candidate.category === 'CONTINUATION');
    expect(finding).toBeDefined();
    expect(finding).toMatchObject({
      problem: 'Awkward continuation risk.',
      whyItMatters: expect.stringContaining('tiny continuation page'),
      recommendedFix: expect.stringContaining('Switch'),
      expectedResult: expect.stringContaining('pulled back'),
    });
    expect(finding?.alternatives.length).toBeGreaterThan(0);
  });

  it('turns underfilled pages into publishing-style recommendations', () => {
    const review = buildPageQualityReview(
      [
        page('CH01_P001', {
          bodyMarkdown: words(12),
        }),
      ],
      config,
    );

    const finding = review.findings.find((candidate) => candidate.category === 'WHITESPACE');
    expect(finding).toBeDefined();
    expect(finding?.recommendedFix).toMatch(/illustration-dominant|feature|safety/);
    expect(finding?.expectedResult).toContain('intentional');
  });

  it('detects chapter layout repetition and recommends rhythm adjustments', () => {
    const review = buildPageQualityReview(
      [
        page('CH01_P001', { category: 'DANGER', bodyMarkdown: words(260) }),
        page('CH01_P002', { category: 'DANGER', bodyMarkdown: words(260) }),
        page('CH01_P003', { category: 'DANGER', bodyMarkdown: words(260) }),
        page('CH01_P004', { category: 'DANGER', bodyMarkdown: words(260) }),
        page('CH01_P005', { category: 'DANGER', bodyMarkdown: words(260) }),
      ],
      config,
    );

    const finding = review.findings.find((candidate) => candidate.category === 'LAYOUT_DIVERSITY');
    expect(finding).toBeDefined();
    expect(finding).toMatchObject({
      scope: 'CHAPTER',
      problem: 'Layout repetition detected.',
      recommendedFix: expect.stringContaining('feature, reference, or text-first'),
    });
  });

  it('exposes the Wildlands publishing style targets with the review', () => {
    const review = buildPageQualityReview([page('CH01_P001')], config);

    expect(review.publishingStyle.label).toBe('Premium Natural History Field Guide');
    expect(review.publishingStyle.featurePageTargetPercent).toEqual({ min: 5, max: 10 });
    expect(review.distribution.layoutCounts.length).toBeGreaterThan(0);
  });

  it('carries the publishing direction: three illustration layers + visual-presence goal', () => {
    const review = buildPageQualityReview([page('CH01_P001')], config);
    expect(review.publishingStyle.illustrationLayers.map((l) => l.layer)).toEqual([
      'Feature Art',
      'Supporting Illustration',
      'Visual Identity',
    ]);
    expect(review.publishingStyle.visualPresenceGoal).toContain('visually abandoned');
    expect(review.publishingStyle.principles.join('\n')).toContain('never let it become mechanical');
  });

  it('counts feature banners as visual landmark pages', () => {
    const review = buildPageQualityReview(
      [
        page('CH01_P001', {
          contentType: 'TERRAIN_ANALYSIS',
          layoutTemplate: 'LAYOUT_13_FEATURE_BANNER',
          bodyMarkdown: words(320),
        }),
        page('CH01_P002', {
          contentType: 'ENCYCLOPEDIA_ENTRY',
          layoutTemplate: 'LAYOUT_2_TEXT_HEAVY',
          bodyMarkdown: words(420),
        }),
      ],
      config,
    );

    expect(review.distribution.featurePercent).toBe(50);
    expect(review.distribution.textFirstPercent).toBe(50);
  });
});
