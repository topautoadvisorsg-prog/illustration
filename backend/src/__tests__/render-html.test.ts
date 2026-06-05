import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type PageManifest } from '@wildlands/shared';
import { buildPageHtml, inlineMarkdown } from '../pipeline/stage-6-layout/render-html.js';
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

  it('shows a planning text-exclusion marker when no image is supplied (not an image box)', () => {
    const html = buildPageHtml(page(), config, { geometry });
    expect(html).toContain('art-exclusion');
    expect(html).toContain('text-exclusion zone');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('background-image:'); // no artwork yet
  });

  it('makes the image the full-page artwork (sheet background), not an in-flow image box', () => {
    const html = buildPageHtml(page(), config, { geometry, imageDataUri: 'data:image/png;base64,AAAA' });
    // Artwork is painted on the Paged.js sheet (a real div, supports data-URI bg) + a text-safe layer.
    expect(html).toContain('.pagedjs_sheet {');
    expect(html).toContain('url("data:image/png;base64,AAAA")');
    expect(html).toContain('background-size: cover');
    expect(html).toContain('class="text-safe"');
    expect(html).not.toContain('<img'); // the image is the page, not a boxed <img>
    expect(html).not.toContain('text-exclusion zone'); // exclusion marker is planning-only
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

  it('layout percentage controls the text-safe zone, not the image size (artwork always full page)', () => {
    // FULL_PAGE plate and a text-heavy entry both get full-page artwork (background-size: cover).
    // The difference is WHERE text sits, expressed as the priority spacer / text-safe inset.
    const plate = buildPageHtml(page({ layoutTemplate: 'LAYOUT_10_FULL_PAGE_PLATE' }), config, {
      geometry,
      imageDataUri: 'data:image/png;base64,AAAA',
    });
    expect(plate).toContain('background-size: cover');
    expect(plate).toContain('class="text-safe"');
    // Top-band/banner pushes opening text into the lower text-safe zone via a spacer.
    const banner = buildPageHtml(page({ layoutTemplate: 'LAYOUT_13_FEATURE_BANNER' }), config, {
      geometry,
      imageDataUri: 'data:image/png;base64,AAAA',
    });
    expect(banner).toContain('class="art-spacer"');
    expect(banner).toMatch(/art-spacer" style="height:[\d.]+in;?"/); // spacer reserves the image-priority band
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
