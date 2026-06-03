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

  it('keeps real art contained in the reserved slot without masking or crop-fill', () => {
    const html = buildPageHtml(page(), config, { geometry, imageDataUri: 'data:image/png;base64,AAAA' });
    expect(html).toContain('object-fit: contain');
    expect(html).toContain('overflow: hidden');
    expect(html).not.toContain('mask-image');
    expect(html).not.toContain('object-fit: cover');
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

  it('sizes the reserved art slot to the layout coverage (text-frame height 9.25in)', () => {
    // Full-page plate: 95% coverage, full width -> height = 0.95 * 9.25 = 8.79in.
    const plate = buildPageHtml(page({ layoutTemplate: 'LAYOUT_10_FULL_PAGE_PLATE' }), config, { geometry });
    expect(plate).toContain('width:100%;height:8.79in;');
    // Text-heavy float: 14% coverage -> balanced box sqrt(0.14) ~= 37% width.
    const textHeavy = buildPageHtml(page({ layoutTemplate: 'LAYOUT_2_TEXT_HEAVY' }), config, { geometry });
    expect(textHeavy).toMatch(/<figure class="art-slot" style="width:37%;height:3\.46in;"/);
  });

  it('makes a higher-coverage top band taller than a lower-coverage one', () => {
    const opener = buildPageHtml(page({ layoutTemplate: 'LAYOUT_5_CHAPTER_OPENER' }), config, { geometry }); // 55%
    const banner = buildPageHtml(page({ layoutTemplate: 'LAYOUT_13_FEATURE_BANNER' }), config, { geometry }); // 40%
    expect(opener).toContain('height:5.09in;'); // 0.55 * 9.25
    expect(banner).toContain('height:3.7in;'); // 0.40 * 9.25
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
