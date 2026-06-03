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

  it('uses a text-free placeholder art slot when no image is supplied', () => {
    const html = buildPageHtml(page(), config, { geometry });
    expect(html).toContain('art-placeholder');
    expect(html).toContain('PREVIEW');
    expect(html).not.toContain('<img');
  });

  it('embeds the illustration when an image data URI is supplied', () => {
    const html = buildPageHtml(page(), config, { geometry, imageDataUri: 'data:image/png;base64,AAAA' });
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(html).not.toContain('PREVIEW · ART SLOT');
  });

  it('fills the art slot at presentation scale (cover, no vignette mask)', () => {
    const html = buildPageHtml(page(), config, { geometry, imageDataUri: 'data:image/png;base64,AAAA' });
    expect(html).toContain('object-fit: cover');
    expect(html).toContain('overflow: hidden');
    expect(html).not.toContain('mask-image');
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

  it('renders the illustration at presentation scale and bleeds to the page edge', () => {
    // Full-page plate: 0.72 * 9.25 = 6.66in tall, with negative margins bleeding off the edges.
    const plate = buildPageHtml(page({ layoutTemplate: 'LAYOUT_10_FULL_PAGE_PLATE' }), config, { geometry });
    expect(plate).toContain('height:6.66in');
    expect(plate).toContain('-1.25in'); // negative margin pulls art past the trim to the bleed edge
    // Text-heavy float: a substantial half-page float (48% wide), at least 0.5 * 9.25 = 4.63in tall.
    const textHeavy = buildPageHtml(page({ layoutTemplate: 'LAYOUT_2_TEXT_HEAVY' }), config, { geometry });
    expect(textHeavy).toContain('width:48%;height:4.63in');
  });

  it('makes a higher-coverage top band taller than a lower-coverage one', () => {
    const opener = buildPageHtml(page({ layoutTemplate: 'LAYOUT_5_CHAPTER_OPENER' }), config, { geometry }); // 55%
    const banner = buildPageHtml(page({ layoutTemplate: 'LAYOUT_13_FEATURE_BANNER' }), config, { geometry }); // 40% -> floored to 45%
    expect(opener).toContain('height:5.09in;'); // 0.55 * 9.25
    expect(banner).toContain('height:4.16in;'); // max(0.45, 0.40) * 9.25
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
