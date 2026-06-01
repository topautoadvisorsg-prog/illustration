import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type PageManifest } from '@wildlands/shared';
import { buildPageHtml } from '../pipeline/stage-6-layout/render-html.js';
import { computePageGeometry } from '../pipeline/stage-6-layout/page-geometry.js';

const config = ProjectConfigSchema.parse({ volume: 1, title: 'The Wildlands', authorName: 'The Wildlands' });
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
    expect(html).toContain("font-family: 'EB Garamond', serif;");
    expect(html).toContain('background: #F5EDD6;');
  });

  it('uses a text-free placeholder art slot when no image is supplied', () => {
    const html = buildPageHtml(page(), config, { geometry });
    expect(html).toContain('art-placeholder');
    expect(html).toContain('PREVIEW · ART SLOT');
    expect(html).not.toContain('<img');
  });

  it('embeds the illustration when an image data URI is supplied', () => {
    const html = buildPageHtml(page(), config, { geometry, imageDataUri: 'data:image/png;base64,AAAA' });
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(html).not.toContain('PREVIEW · ART SLOT');
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
});
