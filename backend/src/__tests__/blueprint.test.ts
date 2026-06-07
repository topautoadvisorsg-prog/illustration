import { describe, expect, it } from 'vitest';
import { buildBlueprintSvg, renderBlueprintPng, BLUEPRINT_COMPOSITION_INSTRUCTION } from '../pipeline/stage-3-generation/blueprint.js';
import { directLayout } from '../pipeline/stage-6-layout/layout-director.js';
import { computePageGeometry } from '../pipeline/stage-6-layout/page-geometry.js';

function allocationFor(layoutTemplate: Parameters<typeof directLayout>[0]['layoutTemplate']) {
  return directLayout({
    bodyMarkdown: '',
    layoutTemplate,
    geometry: computePageGeometry({ widthIn: 8.5, heightIn: 11, bleedIn: 0.125 }),
    bodyPt: 11,
    lineHeight: 1.4,
  });
}

describe('layout blueprint', () => {
  it('renders color-coded zone rectangles (image / text-safe / title)', () => {
    const svg = buildBlueprintSvg(allocationFor('LAYOUT_13_FEATURE_BANNER'), 1024, 1536);
    expect(svg).toContain('<svg');
    expect(svg).toContain('#2E6FB0'); // IMAGE_PRIORITY_ZONE — blue
    expect(svg).toContain('#5FA85B'); // TEXT_SAFE_ZONE — green
    expect(svg).toContain('#E0A92E'); // TITLE_ZONE — yellow
    expect(svg).toContain('width="1024"');
    expect(svg).toContain('height="1536"');
    // Percent-based rects so the map scales with any output size.
    expect(svg).toMatch(/<rect[^>]*x="[\d.]+%"[^>]*y="[\d.]+%"/);
  });

  it('marks supporting-art study zones distinctly on scattered layouts', () => {
    const svg = buildBlueprintSvg(allocationFor('LAYOUT_7_SCATTERED_VIGNETTES'), 1024, 1536);
    expect(svg).toContain('#7B57A6'); // supporting-art — purple
  });

  it('rasterizes the blueprint SVG to a PNG buffer', async () => {
    const { png } = await renderBlueprintPng(allocationFor('LAYOUT_13_FEATURE_BANNER'), 512, 768);
    expect(png.length).toBeGreaterThan(100);
    // PNG magic number.
    expect(png[0]).toBe(0x89);
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  });

  it('composition instruction tells the model to use the map and never render text', () => {
    expect(BLUEPRINT_COMPOSITION_INSTRUCTION).toContain('composition map');
    expect(BLUEPRINT_COMPOSITION_INSTRUCTION).toContain('IMAGE_PRIORITY_ZONE');
    expect(BLUEPRINT_COMPOSITION_INSTRUCTION).toContain('TEXT_SAFE_ZONE');
    expect(BLUEPRINT_COMPOSITION_INSTRUCTION.toLowerCase()).toContain('do not reproduce its flat colors');
    expect(BLUEPRINT_COMPOSITION_INSTRUCTION.toLowerCase()).toContain('do not generate words');
  });
});
