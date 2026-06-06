import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type PageManifest } from '@wildlands/shared';
import { countPageWords, planPage, stripLegacyBoxModelLanguage, validateLayoutLibrary } from '../pipeline/stage-2-planner/plan-pages.js';

const baseConfig = ProjectConfigSchema.parse({
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
    imageModel: 'gpt-image-2',
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
      imageZoneDescription: 'Upper comparison image-priority zone only; never render page text.',
      capacityNotes: 'Measured against 10.5 pt body type.',
      minWords: 240,
      targetWords: 340,
      maxWords: 460,
      recommendedBodyPt: 10.5,
      recommendedLineHeight: 1.24,
      promptTemplate: '{MASTER_STYLE_DNA}. Subject {SUBJECT}. Details {SCIENTIFIC_DETAILS}. Notes {COMPOSITION_NOTES}.',
      placeholders: ['{MASTER_STYLE_DNA}', '{SUBJECT}', '{SCIENTIFIC_DETAILS}', '{COMPOSITION_NOTES}'],
      textFitRule: 'Use for comparison pages.',
      imageSlotDescription: 'Comparison image-priority zone.',
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
});

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
    // Layered model surfaced without changing template selection.
    expect(decision.contentType).toBe('COMPARISON');
    expect(decision.architecture).toBe('FLOAT_LEFT'); // LAYOUT_4's image-priority edge
    expect(typeof decision.coverage).toBe('number');
    expect(decision.prompt).toContain('golden chanterelle mushroom');
    expect(decision.prompt).toContain('Vintage Naturalist master style DNA.');
    expect(decision.prompt).toContain('LAYOUT SYSTEM RULES');
    // New zone-aware composition brief: teaches the full-page-artwork model to the image model.
    expect(decision.prompt).toContain('PAGE COMPOSITION BRIEF');
    expect(decision.prompt).toContain('IMAGE-PRIORITY ZONE');
    expect(decision.prompt).toContain('TEXT-SAFE ZONE');
    expect(decision.prompt).toContain('TYPOGRAPHY ZONE');
    expect(decision.prompt).toContain('The image IS the entire page');
    expect(decision.prompt).toContain('All typography is overlaid later by the layout engine.');
    expect(decision.artBrief.artBox.recommendedWidthPx).toBeGreaterThan(0);
    expect(decision.artBrief.artBox.recommendedHeightPx).toBeGreaterThan(0);
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

  it('does not route an edible entry with a look-alike-warning subsection to the danger layout', () => {
    const decision = planPage(
      page({
        entryTitle: 'Chanterelle',
        imageSubject: 'golden chanterelle mushroom',
        category: 'EDIBLE',
        bodyMarkdown: `### How to identify\n${Array(450).fill('golden').join(' ')}\n\n### Look-alike warning\nThe jack-o-lantern is toxic; do not eat it.`,
      }),
      baseConfig,
    );

    expect(decision.layoutTemplate).not.toBe('LAYOUT_4_DANGER_WARNING');
    expect(decision.reasonCodes).not.toContain('danger_or_warning_signal');
  });

  it('routes a genuinely toxic entry (by category) to the danger layout', () => {
    const decision = planPage(
      page({
        entryTitle: 'Death Cap',
        imageSubject: 'death cap mushroom',
        category: 'TOXIC',
        bodyMarkdown: 'A deadly poisonous mushroom responsible for most fatal mushroom poisonings.',
      }),
      baseConfig,
    );

    expect(decision.layoutTemplate).toBe('LAYOUT_4_DANGER_WARNING');
    expect(decision.reasonCodes).toContain('danger_or_warning_signal');
  });

  it('uses explicit content type before generic word-count density', () => {
    const opener = planPage(page({ contentType: 'CHAPTER_OPENER', bodyMarkdown: Array(80).fill('forest').join(' ') }), baseConfig);
    const reference = planPage(page({ contentType: 'REFERENCE_PAGE', bodyMarkdown: Array(500).fill('term').join(' ') }), baseConfig);
    const animal = planPage(page({ contentType: 'ANIMAL_PROFILE', bodyMarkdown: Array(950).fill('moose').join(' ') }), baseConfig);

    expect(opener.layoutTemplate).toBe('LAYOUT_5_CHAPTER_OPENER');
    expect(reference.layoutTemplate).toBe('LAYOUT_6_BACK_MATTER');
    expect(animal.layoutTemplate).toBe('LAYOUT_14_SIDEBAR_FEATURE');
    expect(animal.reasonCodes).toContain('long_profile_sidebar_art');
  });

  it('routes regional terrain entries to feature-banner layouts', () => {
    const decision = planPage(
      page({
        entryTitle: 'The Bones of the Land - Geography & Geology',
        imageSubject: 'New England terrain and mountain ranges',
        bodyMarkdown: Array(800).fill('terrain').join(' '),
      }),
      baseConfig,
    );

    expect(decision.layoutTemplate).toBe('LAYOUT_13_FEATURE_BANNER');
    expect(decision.reasonCodes).toContain('feature_banner_signal');
  });

  it('strips box-model language while preserving zone language (stored-config rot defense)', () => {
    // The exact box-model lines observed live in project af27e69d's stored prompt.
    const legacy = [
      '{MASTER_STYLE_DNA}',
      'Page structure:',
      '- A wide horizontal illustration spans the upper portion of the page.',
      '- Upper portion remains visually uninterrupted.',
      '- A large vertical illustration occupies the left side of the page.',
      'Visual balance:',
      '- Upper 35-40% contains the feature illustration.',
      '- Lower 60-65% remains largely clear for text placement.',
      '- Maintain strong separation between image and content areas.',
      '- Rightmost 25% contains one tall vertical illustration with small annotations extending into the left text area.',
      '- Preserve the left text area as the dominant readable zone.',
      'Preserve future text areas above all else; do not let art consume the reading areas.',
      '- Lower 40-50% remains available for educational text.',
      '',
      'PAGE COMPOSITION BRIEF',
      'The image IS the entire page (full-bleed artwork — no boxes, no frames, no cards).',
      '• IMAGE-PRIORITY ZONE — left-side image-priority zone within the full-page artwork (~40% of the page)',
      '• TEXT-SAFE ZONE — body text uses the calm right-side text-safe zone (~60% of the page)',
      '• TYPOGRAPHY ZONE — just above the text-safe zone (upper-center)',
    ].join('\n');

    const cleaned = stripLegacyBoxModelLanguage(legacy);

    // Every box-model / compartment phrase observed live is gone.
    expect(cleaned).not.toMatch(/strong separation between image and content/i);
    expect(cleaned).not.toMatch(/remains largely clear/i);
    expect(cleaned).not.toMatch(/remains available/i);
    expect(cleaned).not.toMatch(/Upper 35-40% contains/i);
    expect(cleaned).not.toMatch(/Lower 60-65% remains/i);
    expect(cleaned).not.toMatch(/Rightmost 25% contains/i);
    expect(cleaned).not.toMatch(/spans the upper portion/i);
    expect(cleaned).not.toMatch(/upper portion remains/i);
    expect(cleaned).not.toMatch(/\bupper portion\b/i);
    expect(cleaned).not.toMatch(/occupies the left side of the page/i);
    // Body prose with similar words but no "of the page" anchor must SURVIVE.
    expect(stripLegacyBoxModelLanguage('The bear occupies the left side of its range in winter.')).toContain('occupies the left side of its range');
    expect(cleaned).not.toMatch(/\btext areas?\b/i);
    expect(cleaned).not.toMatch(/\bcontent areas?\b/i);
    expect(cleaned).not.toMatch(/\breading areas?\b/i);
    expect(cleaned).not.toMatch(/portion of the page/i);
    // Zone language survives untouched (hyphenated zones, bands, % of the page).
    expect(cleaned).toContain('The image IS the entire page');
    expect(cleaned).toContain('IMAGE-PRIORITY ZONE — left-side image-priority zone within the full-page artwork (~40% of the page)');
    expect(cleaned).toContain('right-side text-safe zone (~60% of the page)');
    expect(cleaned).toContain('TYPOGRAPHY ZONE');
    expect(cleaned).toContain('{MASTER_STYLE_DNA}');
    // Idempotent.
    expect(stripLegacyBoxModelLanguage(cleaned)).toBe(cleaned);
  });

  it('produces a planned prompt with zero box-model language even from a legacy stored template', () => {
    const legacyAssetConfig = ProjectConfigSchema.parse({
      ...baseConfig,
      layoutPromptAssets: [
        {
          ...baseConfig.layoutPromptAssets[0],
          templateId: 'LAYOUT_3_ILLUSTRATION_DOMINANT',
          label: 'Illustration Dominant (legacy template)',
          minWords: 1,
          targetWords: 60,
          maxWords: 200,
          promptTemplate:
            '{MASTER_STYLE_DNA}. Subject {SUBJECT}. Details {SCIENTIFIC_DETAILS}. '
            + 'Visual balance: Upper 35-40% contains the feature illustration. '
            + 'Lower 60-65% remains largely clear for text placement. '
            + 'Maintain strong separation between image and content areas. Notes {COMPOSITION_NOTES}.',
          placeholders: ['{MASTER_STYLE_DNA}', '{SUBJECT}', '{SCIENTIFIC_DETAILS}', '{COMPOSITION_NOTES}'],
        },
      ],
    });
    const decision = planPage(
      page({
        entryTitle: 'Granite Outcrop',
        imageSubject: 'granite mountain formation',
        bodyMarkdown: 'Short entry about granite.',
      }),
      legacyAssetConfig,
    );

    expect(decision.layoutTemplate).toBe('LAYOUT_3_ILLUSTRATION_DOMINANT');
    expect(decision.prompt).not.toMatch(/strong separation between image and content/i);
    expect(decision.prompt).not.toMatch(/remains largely clear/i);
    expect(decision.prompt).not.toMatch(/Upper 35-40% contains/i);
    // The zone model still reaches the model.
    expect(decision.prompt).toContain('PAGE COMPOSITION BRIEF');
    expect(decision.prompt).toContain('The image IS the entire page');
  });

  it('keeps borderline terrain analysis pages on a text-safe banner layout', () => {
    const decision = planPage(
      page({
        entryTitle: 'When Technology Fails',
        imageSubject: 'New England navigation without electronics',
        contentType: 'TERRAIN_ANALYSIS',
        bodyMarkdown: Array(180).fill('navigation').join(' '),
      }),
      baseConfig,
    );

    expect(decision.layoutTemplate).toBe('LAYOUT_13_FEATURE_BANNER');
  });
});
