import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type PageManifest } from '@wildlands/shared';
import { buildChapterHtml, buildPageHtml, inlineMarkdown } from '../pipeline/stage-6-layout/render-html.js';
import { computePageGeometry } from '../pipeline/stage-6-layout/page-geometry.js';

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'The Wildlands',
  authorName: 'The Wildlands',
  // Pin trim so the geometry assertions below stay stable regardless of the default.
  trimSize: { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 },
});
const geometry = computePageGeometry(config.trimSize);

function page(overrides: Partial<PageManifest> = {}): PageManifest {
  return {
    pageId: 'CH01_P001',
    chapterNumber: 1,
    pageNumber: 1,
    entryTitle: 'Chanterelle',
    scientificName: 'Cantharellus spp.',
    layoutTemplate: 'LAYOUT_1_STANDARD',
    imageSubject: 'golden chanterelle mushroom',
    bodyMarkdown: '## What it is\nA prized edible mushroom of the northeast forests.',
    warnings: [],
    ...overrides,
  };
}

describe('buildPageHtml', () => {
  it('renders title, scientific name, and body text from the manifest', () => {
    const html = buildPageHtml(page(), config, { geometry });
    expect(html).toContain('Chanterelle');
    expect(html).toContain('Cantharellus spp.');
    expect(html).toContain('A prized edible mushroom');
    expect(html).toContain('What it is');
  });

  it('sets the @page size to the bleed page dimensions from config trim', () => {
    const html = buildPageHtml(page(), config, { geometry });
    expect(html).toContain('size: 8.625in 11.25in;');
    expect(html).toContain("--font-body: 'EB Garamond'");
    expect(html).toContain("--font-display: 'Cormorant Garamond'");
    expect(html).toContain('background: #F5EDD6;');
  });

  it('shows the three-zone planning overlay (image-priority / typography / text-safe) when no image is supplied', () => {
    const html = buildPageHtml(page(), config, { geometry });
    expect(html).toContain('class="planning-zones"');
    expect(html).toContain('Image-Priority Zone');
    expect(html).toContain('Typography Zone');
    expect(html).toContain('Text-Safe Zone');
    expect(html).toContain('The page IS artwork');
    expect(html).not.toContain('<img');
    // Outlines only — the legacy filled rectangle is gone.
    expect(html).not.toContain('art-exclusion');
    expect(html).not.toContain('PREVIEW - ');
  });

  it('makes the image the full page (sheet artwork) with a readable title + body panel', () => {
    const html = buildPageHtml(page(), config, { geometry, imageDataUri: 'data:image/png;base64,AAAA' });
    // Artwork IS the page (painted on the sheet); not an in-flow <img> box.
    expect(html).toContain('.pagedjs_sheet {');
    expect(html).toContain('url("data:image/png;base64,AAAA")');
    expect(html).not.toContain('<img');
    // Title sits on the art (readable via paper halo); body sits on a readable panel.
    expect(html).toContain('class="entry-title"');
    expect(html).toContain('class="text-panel"');
    expect(html).toContain('text-shadow'); // title readability halo
    expect(html).not.toContain('IMAGE ZONE'); // exclusion marker is planning-only
  });

  it('paints the artwork clean (no mask over the sheet) and adds a feathered reading-zone veil behind text', () => {
    // Reading-Zone system: the artwork sheet is painted clean (no parchment mask
    // stacked over the image). The readable area is created by a feathered veil on the
    // TEXT PANEL only — localized behind the actual text, fading into the artwork.
    const html = buildPageHtml(page({ layoutTemplate: 'LAYOUT_13_FEATURE_BANNER' }), config, {
      geometry,
      imageDataUri: 'data:image/png;base64,AAAA',
    });
    // Sheet background is the raw image, painted clean.
    expect(html).toContain('url("data:image/png;base64,AAAA")');
    expect(html).toContain('background-size: cover');
    // The reading-zone veil lives on a ::before layer behind the text (so the text
    // stays crisp), painted as a soft elliptical gradient AND masked so every edge
    // dissolves — no hard rectangle / card.
    expect(html).toMatch(/\.text-panel::before \{[^}]*radial-gradient\(ellipse/);
    expect(html).toMatch(/\.text-panel::before \{[^}]*mask-image: radial-gradient\(ellipse/);
  });

  it('paints the hero artwork only on the entry first sheet so continuation sheets stay clean (Phase 2)', () => {
    const html = buildPageHtml(page(), config, { geometry, imageDataUri: 'data:image/png;base64,AAAA' });
    // Artwork background is scoped to the FIRST sheet, not every sheet of the entry.
    expect(html).toContain('.pagedjs_first_page .pagedjs_sheet { background-image: url("data:image/png;base64,AAAA")');
  });

  it('scopes chapter-entry artwork to the named first sheet (Phase 2 clean continuation)', () => {
    const html = buildChapterHtml(
      [{ entryTitle: 'Region', bodyMarkdown: 'A long body paragraph.', layoutTemplate: 'LAYOUT_13_FEATURE_BANNER', imageDataUri: 'data:image/png;base64,AAAA' }],
      config,
      { chapterNumber: 1, chapterTitle: 'Know Your Region' },
      { geometry },
    );
    expect(html).toMatch(/pagedjs_[a-z0-9]+_first_page \.pagedjs_sheet \{ background-image: url\("data:image\/png;base64,AAAA"\)/);
  });

  it('omits the Paged.js script unless a polyfill is provided (browser-free HTML)', () => {
    expect(buildPageHtml(page(), config, { geometry })).not.toContain('<script>');
    expect(buildPageHtml(page(), config, { geometry, polyfillJs: 'console.log(1)' })).toContain('<script>console.log(1)</script>');
  });

  it('escapes HTML in the entry title', () => {
    const html = buildPageHtml(page({ entryTitle: 'Oak <b>& Pine</b>' }), config, { geometry });
    expect(html).toContain('Oak &lt;b&gt;&amp; Pine&lt;/b&gt;');
  });

  it('applies the warning accent on danger layouts', () => {
    const html = buildPageHtml(page({ layoutTemplate: 'LAYOUT_4_DANGER_WARNING' }), config, { geometry });
    expect(html).toContain('#8B2020');
  });

  it('renders bullet identification checklists as a list', () => {
    const html = buildPageHtml(
      page({ bodyMarkdown: '### How to identify\n- **Cap:** golden, wavy\n- **Stem:** solid, tapering' }),
      config,
      { geometry },
    );
    expect(html).toContain('<ul class="id-list">');
    expect(html).toContain('<li><strong>Cap:</strong> golden, wavy</li>');
    expect(html).toContain('<li><strong>Stem:</strong> solid, tapering</li>');
  });

  it('renders section headings and paragraphs distinctly', () => {
    const html = buildPageHtml(
      page({ bodyMarkdown: '### What it is\nA prized edible.\n\n### Where\nMixed forests.' }),
      config,
      { geometry },
    );
    expect(html).toContain('<h3 class="section-header">What it is</h3>');
    expect(html).toContain('<p class="section-body">A prized edible.</p>');
    expect(html).toContain('<h3 class="section-header">Where</h3>');
  });

  it('drops markdown horizontal rules instead of rendering separator fragments', () => {
    const html = buildPageHtml(
      page({ bodyMarkdown: 'Opening paragraph.\n\n---\n\nClosing paragraph.\n\n***' }),
      config,
      { geometry },
    );
    expect(html).toContain('<p class="section-body">Opening paragraph.</p>');
    expect(html).toContain('<p class="section-body">Closing paragraph.</p>');
    expect(html).not.toContain('<p class="section-body">---</p>');
    expect(html).not.toContain('<p class="section-body">***</p>');
  });

  it('drops the body panel further down when focal art occupies the top of the page', () => {
    // A top-band layout puts focal art across the top, so the reading field (and its
    // spacer) starts well below a side-by-side layout whose reading field begins at the
    // top title-band line. The spacer height encodes where the reading field starts.
    const topBand = buildPageHtml(page({ layoutTemplate: 'LAYOUT_13_FEATURE_BANNER' }), config, {
      geometry,
      imageDataUri: 'data:image/png;base64,AAAA',
    });
    const sideBySide = buildPageHtml(page({ layoutTemplate: 'LAYOUT_2_TEXT_HEAVY' }), config, {
      geometry,
      imageDataUri: 'data:image/png;base64,AAAA',
    });
    const spacerOf = (html: string): number => Number(/art-spacer" style="height:([\d.]+)in/.exec(html)?.[1] ?? '0');
    expect(spacerOf(topBand)).toBeGreaterThan(spacerOf(sideBySide));
  });
});

describe('inlineMarkdown', () => {
  it('converts bold and italic', () => {
    expect(inlineMarkdown('a **bold** and *italic* word')).toBe('a <strong>bold</strong> and <em>italic</em> word');
  });

  it('leaves plain text untouched', () => {
    expect(inlineMarkdown('nothing to format here')).toBe('nothing to format here');
  });
});
