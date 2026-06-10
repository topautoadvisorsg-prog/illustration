/**
 * Print-Prep (STD-3) tests.
 *
 * Pure geometry + preflight (no I/O) and an integration test of composePrintPage
 * on a fixture PNG — exercises the real sharp upscale + letterbox + badge/folio
 * stamp + pdf-lib export, with no DB and no image-gen spend.
 */

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  standardCanvas,
  computeBadgeStackLayout,
  buildCartoucheSvg,
  allWithinCanvas,
} from '../pipeline/print-prep/badge-geometry.js';
import { runPreflight } from '../pipeline/print-prep/preflight.js';
import { composePrintPage } from '../pipeline/print-prep/print-prep.js';
import {
  badgesForPage,
  renderBadgeSvg,
  REGION_BADGES,
  HAZARD_BADGES,
  SOURCE_BADGES,
} from '../pipeline/publishing-standard/index.js';
import type { Badge } from '@wildlands/shared';

/** Standard default canvas (8.5×11 trim + 0.125 bleed). Tests exercise the
 *  default-trim shape; the 7×10 chain is covered by multi-trim-7x10.integration. */
const STANDARD_CANVAS_IN = { w: 8.75, h: 11.25 };

const sampleBadgeSet: Badge[] = [
  { family: 'region', value: 'FOREST' },
  { family: 'hazard', value: 'DEADLY' },
  { family: 'hazard', value: 'EXPERT_REVIEW' },
  { family: 'source', value: 'SCIENTIFIC_LITERATURE' },
];

describe('badge geometry — L-7.2 bottom-right cartouche stack', () => {
  const canvas = standardCanvas(STANDARD_CANVAS_IN);

  it('canvas is the 300-DPI full-bleed page', () => {
    expect(canvas).toMatchObject({ width: 2625, height: 3375, dpi: 300 });
  });

  it('all metadata stacks in the bottom-right corner, inside the canvas', () => {
    const stack = computeBadgeStackLayout(badgesForPage(sampleBadgeSet), '184', canvas);
    // Everything lives in the bottom-right quadrant.
    expect(stack.cartoucheRect.left).toBeGreaterThan(canvas.width / 2);
    expect(stack.cartoucheRect.top).toBeGreaterThan(canvas.height / 2);
    for (const p of stack.placedBadges) {
      expect(p.rect.left).toBeGreaterThan(canvas.width / 2);
      expect(p.rect.top).toBeGreaterThan(canvas.height / 2);
    }
    expect(allWithinCanvas(stack.placedBadges, canvas)).toBe(true);
    // Vertical order: region → hazards → source → folio.
    const region = stack.placedBadges.find((p) => p.badge.family === 'region')!;
    const hazard = stack.placedBadges.find((p) => p.badge.family === 'hazard')!;
    const source = stack.placedBadges.find((p) => p.badge.family === 'source')!;
    expect(hazard.rect.top).toBeGreaterThan(region.rect.top);
    expect(source.rect.top).toBeGreaterThan(hazard.rect.top);
    expect(stack.folio!.rect.top).toBeGreaterThan(source.rect.top);
    expect(stack.folio!.label).toBe('184');
  });

  it('cartouche fully contains every stamped item', () => {
    const stack = computeBadgeStackLayout(badgesForPage(sampleBadgeSet), '45', canvas);
    const c = stack.cartoucheRect;
    const items = [...stack.placedBadges.map((p) => p.rect), stack.folio!.rect];
    for (const r of items) {
      expect(r.left).toBeGreaterThanOrEqual(c.left);
      expect(r.top).toBeGreaterThanOrEqual(c.top);
      expect(r.left + r.width).toBeLessThanOrEqual(c.left + c.width + 1);
      expect(r.top + r.height).toBeLessThanOrEqual(c.top + c.height + 1);
    }
  });

  it('stack shrinks when items are absent (no folio, fewer badges)', () => {
    const full = computeBadgeStackLayout(badgesForPage(sampleBadgeSet), '45', canvas);
    const noFolio = computeBadgeStackLayout(badgesForPage(sampleBadgeSet), null, canvas);
    const minimal = computeBadgeStackLayout(
      badgesForPage([{ family: 'region', value: 'FOREST' }]),
      null,
      canvas,
    );
    expect(noFolio.folio).toBeNull();
    expect(noFolio.cartoucheRect.height).toBeLessThan(full.cartoucheRect.height);
    expect(minimal.cartoucheRect.height).toBeLessThan(noFolio.cartoucheRect.height);
    // Cartouche bottom stays anchored to the corner regardless of stack size.
    expect(minimal.cartoucheRect.top + minimal.cartoucheRect.height).toBe(
      full.cartoucheRect.top + full.cartoucheRect.height,
    );
  });

  it('cartouche SVG has a solid core + blurred halo (visible backing)', () => {
    const stack = computeBadgeStackLayout(badgesForPage(sampleBadgeSet), '45', canvas);
    const svg = buildCartoucheSvg(stack.cartoucheRect, '#E0C8A0');
    const ellipses = svg.match(/<ellipse/g) ?? [];
    expect(ellipses.length).toBe(2); // halo + solid core
    expect(svg).toContain('feGaussianBlur'); // feathered edge present
    // Exactly one ellipse carries the blur filter (the core is unfiltered).
    expect(svg.match(/filter="url\(#soft\)"/g)?.length).toBe(1);
  });
});

describe('preflight gate', () => {
  const base = {
    widthPx: 2625, heightPx: 3375, dpi: 300, colorMode: 'srgb',
    pngBytes: 1000, pdfBytes: 1000, badgesWithinCanvas: true,
    canvasIn: STANDARD_CANVAS_IN,
  };
  it('passes a correct page', () => {
    expect(runPreflight(base).passed).toBe(true);
  });
  it('fails wrong dimensions', () => {
    const r = runPreflight({ ...base, widthPx: 2000 });
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => c.name === 'dimensions')?.ok).toBe(false);
  });
  it('fails wrong DPI and non-RGB', () => {
    expect(runPreflight({ ...base, dpi: 150 }).passed).toBe(false);
    expect(runPreflight({ ...base, colorMode: 'cmyk' }).passed).toBe(false);
  });
});

describe('every badge SVG rasterizes through sharp (no malformed icon paths)', () => {
  const all: Array<['region' | 'hazard' | 'source', string]> = [
    ...Object.keys(REGION_BADGES).map((v): ['region', string] => ['region', v]),
    ...Object.keys(HAZARD_BADGES).filter((v) => v !== 'NONE').map((v): ['hazard', string] => ['hazard', v]),
    ...Object.keys(SOURCE_BADGES).map((v): ['source', string] => ['source', v]),
  ];
  for (const [family, value] of all) {
    it(`${family}:${value} rasterizes to PNG`, async () => {
      const png = await sharp(Buffer.from(renderBadgeSvg(family, value)), { density: 600 })
        .resize({ width: 120 })
        .png()
        .toBuffer();
      expect(png.length).toBeGreaterThan(0);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
    });
  }
});

describe('composePrintPage — integration on a fixture (no DB, no spend)', () => {
  it('produces a 2625×3375 / 300-DPI PNG + single-page PDF with badges + folio', async () => {
    const fixture = await sharp({
      create: { width: 1024, height: 1536, channels: 3, background: { r: 224, g: 200, b: 160 } },
    }).png().toBuffer();

    const out = await composePrintPage(fixture, sampleBadgeSet, '42', STANDARD_CANVAS_IN);

    expect(out.widthPx).toBe(2625);
    expect(out.heightPx).toBe(3375);
    expect(out.dpi).toBe(300);
    expect(/rgb/i.test(out.colorMode)).toBe(true);
    expect(out.badgesWithinCanvas).toBe(true);
    // region + 2 hazards (capped) + source = 4 stamped badges
    expect(out.stampedBadges).toBe(4);
    expect(out.stampedFolio).toBe(true);
    // PDF is a real PDF
    expect(out.pdfBuffer.subarray(0, 5).toString()).toBe('%PDF-');
    // PNG metadata round-trips to the right dimensions
    const m = await sharp(out.pngBuffer).metadata();
    expect(m.width).toBe(2625);
    expect(m.height).toBe(3375);

    const pre = runPreflight({
      widthPx: out.widthPx, heightPx: out.heightPx, dpi: out.dpi, colorMode: out.colorMode,
      pngBytes: out.pngBuffer.length, pdfBytes: out.pdfBuffer.length, badgesWithinCanvas: out.badgesWithinCanvas,
      canvasIn: STANDARD_CANVAS_IN,
    });
    expect(pre.passed).toBe(true);
  });

  it('a NONE-hazard page stamps only region + source', async () => {
    const fixture = await sharp({
      create: { width: 1024, height: 1536, channels: 3, background: { r: 224, g: 200, b: 160 } },
    }).png().toBuffer();
    const out = await composePrintPage(
      fixture,
      [{ family: 'region', value: 'RIVER' }, { family: 'hazard', value: 'NONE' }, { family: 'source', value: 'FIELD_GUIDE' }],
      null,
      STANDARD_CANVAS_IN,
    );
    expect(out.stampedBadges).toBe(2); // region + source, no hazard
    expect(out.stampedFolio).toBe(false); // null folio
    expect(out.widthPx).toBe(2625);
  });
});
