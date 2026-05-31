import { describe, expect, it } from 'vitest';
import type { PageManifest, ProjectConfig } from '@wildlands/shared';
import { countPageWords, planPage } from '../pipeline/stage-2-planner/plan-pages.js';

const baseConfig: ProjectConfig = {
  brand: 'THE_WILDLANDS',
  audience: 'ADULT',
  editions: ['PREMIUM', 'KINDLE_EPUB'],
  volume: 1,
  title: 'The Wildlands Field Guide',
  authorName: 'The Wildlands',
  trimSize: { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 },
  typography: { headingFont: 'EB Garamond', bodyFont: 'EB Garamond', captionFont: 'Inter', bodyPt: 11, lineHeight: 1.28, smallCaps: true },
  colorPalette: { paper: '#f4f1ea', ink: '#1b332d', accent: '#2f5d50', warning: '#9f2d20' },
  imageGeneration: {
    masterStyleBlockVersion: 'THE_WILDLANDS_v1',
    styleName: 'Cinematic Naturalist',
    imageModel: 'gpt-image-1',
    upscaleModel: 'Replicate Real-ESRGAN',
  },
  layoutPolicy: {
    layoutReferenceSet: 'wildlands-layout-references-v1',
    textFitFirst: true,
    chapterByChapterRender: true,
    defaultTemplate: 'LAYOUT_1_STANDARD',
    longTextTemplate: 'LAYOUT_2_TEXT_HEAVY',
    comparisonTemplate: 'LAYOUT_9_DIAGNOSTIC_DIAGRAM',
  },
  layoutPromptAssets: [
    {
      templateId: 'LAYOUT_9_DIAGNOSTIC_DIAGRAM',
      label: 'Diagnostic',
      mockupImagePath: 'layout-09-diagnostic.png',
      minWords: 180,
      targetWords: 280,
      maxWords: 400,
      recommendedBodyPt: 10.5,
      recommendedLineHeight: 1.24,
      promptTemplate: 'Subject {SUBJECT}. Details {SCIENTIFIC_DETAILS}. Notes {COMPOSITION_NOTES}.',
      placeholders: ['{SUBJECT}', '{SCIENTIFIC_DETAILS}', '{COMPOSITION_NOTES}'],
      textFitRule: 'Use for comparison pages.',
      imageSlotDescription: 'Diagnostic image slot.',
      capacityTestStatus: 'APPROVED',
      operatorNotes: '',
    },
  ],
  outputProfile: {
    printEdition: 'PREMIUM',
    ebookEdition: 'KINDLE_EPUB',
    renderEngine: 'PUPPETEER_PAGEDJS',
    pdfTarget: 'KDP premium color hardcover',
  },
};

function page(overrides: Partial<PageManifest>): PageManifest {
  return {
    pageId: 'CH01_P001',
    projectId: '11111111-1111-4111-8111-111111111111',
    chapterNumber: 1,
    pageNumber: 1,
    entryTitle: 'Chanterelle',
    layoutTemplate: 'LAYOUT_1_STANDARD',
    imageSubject: 'golden chanterelle mushroom',
    bodyMarkdown: 'Standard entry body.',
    warnings: [],
    ...overrides,
  };
}

describe('planPage', () => {
  it('counts markdown words without markup noise', () => {
    expect(countPageWords('### ID\nGolden **yellow** mushroom near [oak](x).')).toBe(6);
  });

  it('selects diagnostic layout and assembles prompt from layout asset', () => {
    const decision = planPage(
      page({
        entryTitle: 'Chanterelle vs False Chanterelle',
        bodyMarkdown: 'Compare these look-alike species with diagnostic gill differences.',
      }),
      baseConfig,
    );

    expect(decision.layoutTemplate).toBe('LAYOUT_9_DIAGNOSTIC_DIAGRAM');
    expect(decision.reasonCodes).toContain('comparison_or_lookalike_signal');
    expect(decision.prompt).toContain('golden chanterelle mushroom');
    expect(decision.prompt).not.toContain('{SUBJECT}');
    expect(decision.typography.bodyPt).toBe(10.5);
  });
});
