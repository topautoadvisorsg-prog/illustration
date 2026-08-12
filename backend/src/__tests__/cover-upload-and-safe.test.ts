/**
 * Cover versioning, and the zone inset that the last render proved was needed.
 *
 * The measured defect: the orange title crossed the right TRIM by 0.038in and
 * sat 0.288in outside the front safe area. The blueprint had told it to fill
 * the full width of the safe box, and display type fills its box.
 */
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type ProjectConfig } from '@wildlands/shared';
import { buildCoverSpec } from '../pipeline/cover/cover-spec.js';
import { blueprintTextZones } from '../pipeline/cover/cover-blueprint.js';
import { buildCoverPrompt } from '../pipeline/cover/cover-prompt.js';

const book = (over: Record<string, unknown> = {}): ProjectConfig =>
  ProjectConfigSchema.parse({
    volume: 1,
    title: 'NO ONE TOLD ME THAT',
    subtitle: 'The Complete Puberty Guide for Boys 9-14',
    authorName: 'Nolan Whitlow',
    trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
    paperStock: 'cream',
    productionProfileId: 'bw-educational-nonfiction',
    ...over,
  });

const spec = (cfg = book(), pages = 156) =>
  buildCoverSpec({ projectId: 't', config: cfg, pageCount: pages, pageCountSource: 'typeset', model: 'gpt-image-2' });

describe('cover version history', () => {
  it('starts empty and does not disturb existing projects', () => {
    expect(book().publishing.coverVersions).toEqual([]);
  });

  it('accepts generated and uploaded entries with provenance', () => {
    const cfg = book({
      publishing: {
        coverVersions: [
          { version: 1, assetPath: 'p/cover/cover-wrap-art-v1.png', source: 'generated', widthPx: 1536, heightPx: 1024, createdAt: '2026-08-10T00:00:00Z' },
          { version: 2, assetPath: 'p/cover/cover-wrap-art-v2.png', source: 'uploaded', widthPx: 3492, heightPx: 2625, createdAt: '2026-08-10T01:00:00Z', replacedVersion: 1, note: 'title pulled in' },
        ],
      },
    });
    const v = cfg.publishing.coverVersions;
    expect(v).toHaveLength(2);
    expect(v[1]!.source).toBe('uploaded');
    expect(v[1]!.replacedVersion).toBe(1);
  });

  it('rejects a version entry with no asset path', () => {
    expect(() =>
      book({ publishing: { coverVersions: [{ version: 1, assetPath: '', source: 'generated', widthPx: 10, heightPx: 10, createdAt: 'x' }] } }),
    ).toThrow();
  });
});

describe('front-cover text zones stay off the safe line', () => {
  const s = spec();
  const safe = s.geometry.modelPx.frontSafe;
  const zones = blueprintTextZones(s).filter((z) => ['TITLE', 'SUBTITLE', 'AUTHOR', 'COVER LINE', 'SERIES'].includes(z.label));

  it('has the front text zones it should', () => {
    expect(zones.map((z) => z.label)).toContain('TITLE');
    expect(zones.map((z) => z.label)).toContain('AUTHOR');
  });

  it('every front text zone leaves a real gap inside the safe area', () => {
    for (const z of zones) {
      const leftGap = z.rect.x - safe.x;
      const rightGap = safe.x + safe.w - (z.rect.x + z.rect.w);
      expect(leftGap, `${z.label} left gap`).toBeGreaterThan(4);
      expect(rightGap, `${z.label} right gap`).toBeGreaterThan(4);
    }
  });

  it('NO front text zone reaches the safe boundary — the bug that shipped', () => {
    for (const z of zones) {
      expect(z.rect.x + z.rect.w, `${z.label} right edge`).toBeLessThan(safe.x + safe.w);
      expect(z.rect.x, `${z.label} left edge`).toBeGreaterThan(safe.x);
    }
  });

  it('and never crosses the TRIM, which is what actually gets cut', () => {
    const trim = s.geometry.modelPx.trim;
    for (const z of zones) {
      expect(z.rect.x + z.rect.w).toBeLessThan(trim.x + trim.w);
    }
  });
});

describe('blueprint encoding', () => {
  it('declares UTF-8 so non-ASCII copy does not rasterise as mojibake', async () => {
    const { buildCoverBlueprintSvg, renderCoverBlueprintPng } = await import('../pipeline/cover/cover-blueprint.js');
    const s = spec(book({ subtitle: 'The Complete Puberty Guide for Boys 9–14' }));
    const svg = buildCoverBlueprintSvg(s);
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    // The en-dash survives into the markup rather than being pre-mangled.
    expect(svg).toContain('9–14');
    // And it still rasterises.
    const png = await renderCoverBlueprintPng(s);
    expect(png.length).toBeGreaterThan(1000);
  });
});

describe('the prompt names the failure explicitly', () => {
  it('calls out the title as the one that goes wrong', () => {
    const p = buildCoverPrompt(spec());
    expect(p).toMatch(/THE TITLE IS THE ONE THAT GOES WRONG/);
    expect(p).toMatch(/visible gap of clear background/i);
    expect(p).toMatch(/never let it run wider/i);
  });

  it('still states the safe bounds numerically', () => {
    expect(buildCoverPrompt(spec())).toMatch(/EVERY letter of EVERY word must sit inside/);
  });

  /**
   * Two rounds of "stay inside an invisible line" failed. The author line never
   * failed, because it sits on a graphic band. Give the title the same.
   */
  it('asks for a real graphic element containing the title, not just a boundary', () => {
    const p = buildCoverPrompt(spec());
    expect(p).toMatch(/CONTAIN THE TITLE/);
    expect(p).toMatch(/solid colour block/i);
    expect(p).toMatch(/the element stops before the edge does/i);
    // It must be design, not a guide mark — those are still forbidden.
    expect(p).toMatch(/Not a thin outline, not a decorative frame/i);
    expect(p).toMatch(/Do NOT draw any guide line/i);
  });
});
