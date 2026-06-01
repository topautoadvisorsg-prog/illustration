import { describe, expect, it } from 'vitest';
import type { PageManifest, ProjectConfig } from '@wildlands/shared';
import { countPageWords, planPage, validateLayoutLibrary } from '../pipeline/stage-2-planner/plan-pages.js';

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
    masterStyleBlockVersion: 'VINTAGE_NATURALIST_DNA_v1.0',
    masterStyleBlockText: 'Vintage Naturalist master style DNA.',
    styleName: 'Vintage Naturalist',
    imageModel: 'gpt-image-1',
    upscaleModel: 'Replicate Real-ESRGAN',
  },
  layoutPolicy: {
    layoutReferenceSet: 'wildlands-layout-references-v1',
    textFitFirst: true,
    chapterByChapterRender: true,
    defaultTemplate: 'LAYOUT_1_STANDARD',
    longTextTemplate: 'LAYOUT_2_TEXT_HEAVY',
    comparisonTemplate: 'LAYOUT_4_DANGER_WARNING',
  },
  layoutPromptAssets: [
    {
      templateId: 'LAYOUT_4_DANGER_WARNING',
      label: 'Comparison Recognition',
      mockupImagePath: 'layout-04-comparison-recognition.png',
      layoutDescription: 'Comparison layout with two subject illustrations and a protected lower text zone.',
      useCases: ['look-alike species', 'comparison pages', 'quick recognition'],
      avoidWhen: ['simple short entry without comparison need'],
      textZoneDescription: 'Lower text zone remains clear for educational content.',
      imageZoneDescription: 'Upper comparison image zone only; never render page text.',
      capacityNotes: 'Measured against 10.5 pt body type.',
      minWords: 240,
      targetWords: 340,
      maxWords: 460,
      recommendedBodyPt: 10.5,
      recommendedLineHeight: 1.24,
      promptTemplate: '{MASTER_STYLE_DNA}. Subject {SUBJECT}. Details {SCIENTIFIC_DETAILS}. Notes {COMPOSITION_NOTES}.',
      placeholders: ['{MASTER_STYLE_DNA}', '{SUBJECT}', '{SCIENTIFIC_DETAILS}', '{COMPOSITION_NOTES}'],
      textFitRule: 'Use for comparison pages.',
      imageSlotDescription: 'Comparison image slot.',
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

  it('selects comparison layout and assembles prompt from layout asset', () => {
    const decision = planPage(
      page({
        entryTitle: 'Chanterelle vs False Chanterelle',
        bodyMarkdown: 'Compare these look-alike species with diagnostic gill differences.',
      }),
      baseConfig,
    );

    expect(decision.layoutTemplate).toBe('LAYOUT_4_DANGER_WARNING');
    expect(decision.reasonCodes).toContain('comparison_or_lookalike_signal');
    expect(decision.prompt).toContain('golden chanterelle mushroom');
    expect(decision.prompt).toContain('Vintage Naturalist master style DNA.');
    expect(decision.prompt).toContain('LAYOUT SYSTEM RULES');
    expect(decision.prompt).toContain('Generate clean artwork only.');
    expect(decision.prompt).toContain('Render NO text of any kind in the image');
    expect(decision.prompt).not.toContain('{SUBJECT}');
    expect(decision.typography.bodyPt).toBe(10.5);
    expect(decision.promptReady).toBe(true);
    expect(decision.layoutInstructions.useCases).toContain('look-alike species');
  });

  it('reports missing layout assets and unapproved capacity in the layout library', () => {
    const report = validateLayoutLibrary(baseConfig);

    expect(report.readyForProduction).toBe(false);
    expect(report.missingTemplates).toContain('LAYOUT_1_STANDARD');
    expect(report.issues.some((issue) => issue.code === 'missing_layout_asset')).toBe(true);
  });

  it('blocks a page plan when the selected layout asset is missing', () => {
    const decision = planPage(
      page({
        bodyMarkdown: 'Plain short entry with habitat notes and seasonal field details.',
      }),
      baseConfig,
    );

    expect(decision.layoutTemplate).toBe('LAYOUT_3_ILLUSTRATION_DOMINANT');
    expect(decision.textFitStatus).toBe('BLOCKED_LAYOUT_LIBRARY');
    expect(decision.blockers).toContain('missing_layout_asset:LAYOUT_3_ILLUSTRATION_DOMINANT');
  });
});
