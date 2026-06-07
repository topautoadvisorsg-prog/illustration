import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type ProjectConfig } from '@wildlands/shared';
import { buildPreviewPageHtml } from '../preview-page.html.js';
import type { PaginatedPage } from '../../stage-1.75-pagination/types.js';

function makeConfig(): ProjectConfig {
  return ProjectConfigSchema.parse({ volume: 1, title: 'T', authorName: 'A' });
}

const fakeZones = {
  priorityEdge: 'LEFT',
  imagePriorityZone: { xPct: 5, yPct: 60, widthPct: 40, heightPct: 35 },
  textSafeZones: [{ id: 'rf', role: 'reading-field', regionType: 'TEXT_SAFE', shape: 'rect', xPct: 50, yPct: 10, widthPct: 45, heightPct: 80, instruction: '' }],
  typographyZones: [{ id: 't', role: 'title', regionType: 'TYPOGRAPHY', shape: 'rect', xPct: 5, yPct: 3, widthPct: 90, heightPct: 8, instruction: '' }],
  imagePriorityZones: [{ id: 'i', role: 'image-priority', regionType: 'IMAGE_PRIORITY', shape: 'rect', xPct: 5, yPct: 60, widthPct: 40, heightPct: 35, instruction: '' }],
  regions: [],
  imagePlacement: 'left',
  textPlacement: 'right',
  openingPageImagePercent: 40,
  openingPageTextPercent: 60,
  continuationPageImagePercent: 0,
  continuationPageTextPercent: 100,
  estimatedRenderedPages: 1,
  wordsPerOpeningPage: 0,
  wordsPerContinuationPage: 0,
  notes: [],
  architecture: 'FLOAT_LEFT',
  artBox: { xPct: 5, yPct: 60, widthPct: 40, heightPct: 35 },
} as unknown as PaginatedPage['zones'];

function makePage(o: Partial<PaginatedPage> = {}): PaginatedPage {
  return {
    plannedPageNumber: 1,
    entryKey: 'CH01_P010',
    entryTitle: 'Black Bear',
    pageKey: 'CH01_P010',
    chapterNumber: 1,
    partN: 1,
    totalParts: 1,
    pageRole: 'opener',
    carriesSubject: true,
    compactedEntryKeys: null,
    imageSubject: 'a black bear at the forest edge',
    layoutTemplate: 'LAYOUT_1_STANDARD',
    readingFieldText: 'The black bear is the largest carnivore in the region.',
    readingFieldChars: 53,
    readingFieldWords: 11,
    fitStatus: 'FITS',
    zones: fakeZones,
    warnings: [],
    ...o,
  };
}

describe('buildPreviewPageHtml — opener page', () => {
  it('embeds the entry title in the title band', () => {
    const html = buildPreviewPageHtml({ page: makePage(), config: makeConfig() });
    expect(html).toContain('class="title-band"');
    expect(html).toContain('Black Bear');
  });

  it('renders the reading field text inside a .reading-field block', () => {
    const html = buildPreviewPageHtml({ page: makePage(), config: makeConfig() });
    expect(html).toContain('class="reading-field"');
    expect(html).toContain('The black bear is the largest carnivore in the region.');
  });

  it('renders an Image: placeholder labelled with the imageSubject', () => {
    const html = buildPreviewPageHtml({ page: makePage(), config: makeConfig() });
    expect(html).toContain('class="image-zone"');
    expect(html).toContain('Image:');
    expect(html).toContain('a black bear at the forest edge');
  });

  it('positions the title and image zones via percentage geometry', () => {
    const html = buildPreviewPageHtml({ page: makePage(), config: makeConfig() });
    expect(html).toMatch(/title-band[^>]*style="[^"]*top:3%/);
    expect(html).toMatch(/image-zone[^>]*style="[^"]*left:5%/);
    expect(html).toMatch(/reading-field[^>]*style="[^"]*left:50%/);
  });

  it('escapes HTML in the entry title and image subject', () => {
    const html = buildPreviewPageHtml({
      page: makePage({ entryTitle: '<bad>', imageSubject: '"injection"' }),
      config: makeConfig(),
    });
    expect(html).not.toContain('<bad>');
    expect(html).toContain('&lt;bad&gt;');
    expect(html).toContain('&quot;injection&quot;');
  });
});

describe('buildPreviewPageHtml — continuation page', () => {
  it('flags continuation in the title band', () => {
    const html = buildPreviewPageHtml({
      page: makePage({
        plannedPageNumber: 2,
        pageKey: 'CH01_P010_c1',
        partN: 2,
        totalParts: 3,
        pageRole: 'continuation',
        carriesSubject: false,
        imageSubject: null,
      }),
      config: makeConfig(),
    });
    expect(html).toContain('Black Bear (continued)');
    // Image subject is null on continuations — the placeholder labels it as such.
    expect(html).toContain('Image: (no image — continuation)');
  });
});

describe('buildPreviewPageHtml — compacted page', () => {
  it('shows the "+ N more" hint and renders all entries\' bodies', () => {
    const html = buildPreviewPageHtml({
      page: makePage({
        pageKey: 'CH01_P010_m',
        pageRole: 'compacted',
        compactedEntryKeys: ['CH01_P010', 'CH01_P011', 'CH01_P012'],
        readingFieldText: 'First entry body.\n\n## Beta\n\nBeta body.\n\n## Gamma\n\nGamma body.',
      }),
      config: makeConfig(),
    });
    expect(html).toContain('Black Bear + 2 more');
    expect(html).toContain('First entry body.');
    // The injected `## Beta` heading renders as an .rf-heading.
    expect(html).toContain('<h3 class="rf-heading">Beta</h3>');
    expect(html).toContain('Beta body.');
    expect(html).toContain('<h3 class="rf-heading">Gamma</h3>');
    expect(html).toContain('Gamma body.');
  });
});

describe('buildPreviewPageHtml — footer stamp', () => {
  it('shows planned page #, pageKey, role and fit status in the @bottom-center stamp', () => {
    const html = buildPreviewPageHtml({
      page: makePage({ plannedPageNumber: 7, pageKey: 'CH02_P003', fitStatus: 'TIGHT' }),
      config: makeConfig(),
    });
    expect(html).toContain('page 7 · CH02_P003 · opener · TIGHT');
  });
});

describe('buildPreviewPageHtml — empty body', () => {
  it('shows a "(no body text)" placeholder when readingFieldText is empty', () => {
    const html = buildPreviewPageHtml({
      page: makePage({ readingFieldText: '' }),
      config: makeConfig(),
    });
    expect(html).toContain('(no body text)');
  });
});

describe('buildPreviewPageHtml — CSS sanitization (fix #1)', () => {
  it('rejects a CSS-injection payload in colorPalette.paper and falls back', () => {
    const evilConfig = ProjectConfigSchema.parse({
      volume: 1,
      title: 'T',
      authorName: 'A',
      colorPalette: {
        paper: 'red; } body { display: none } .x{ color: blue',
      },
    });
    const html = buildPreviewPageHtml({ page: makePage(), config: evilConfig });
    // The malicious payload never reaches the rendered CSS.
    expect(html).not.toContain('display: none');
    expect(html).not.toContain('} body {');
    // The safe fallback paper colour shows up instead.
    expect(html).toContain('#faf6ee');
  });

  it('rejects a font-name with a single quote and falls back to Georgia', () => {
    const evilConfig = ProjectConfigSchema.parse({
      volume: 1,
      title: 'T',
      authorName: 'A',
      typography: { bodyFont: "Don't Care" },
    });
    const html = buildPreviewPageHtml({ page: makePage(), config: evilConfig });
    expect(html).not.toContain("Don't Care");
    expect(html).toContain("'Georgia',");
  });
});
