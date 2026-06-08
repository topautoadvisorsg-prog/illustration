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
  computeBadgeLayout,
  computeFolioRect,
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

const sampleBadgeSet: Badge[] = [
  { family: 'region', value: 'FOREST' },
  { family: 'hazard', value: 'DEADLY' },
  { family: 'hazard', value: 'EXPERT_REVIEW' },
  { family: 'source', value: 'SCIENTIFIC_LITERATURE' },
];

describe('badge geometry — standard canvas + placement', () => {
  const canvas = standardCanvas();

  it('canvas is the 300-DPI full-bleed page', () => {
    expect(canvas).toMatchObject({ width: 2625, height: 3375, dpi: 300 });
  });

  it('region → bottom-left; hazards + source → bottom-right; all inside canvas', () => {
    const placed = computeBadgeLayout(badgesForPage(sampleBadgeSet), canvas);
    const region = placed.find((p) => p.badge.family === 'region')!;
    const hazards = placed.filter((p) => p.badge.family === 'hazard');
    const source = placed.find((p) => p.badge.family === 'source')!;

    expect(region.rect.left).toBeLessThan(canvas.width / 2); // left half
    for (const h of hazards) expect(h.rect.left).toBeGreaterThan(canvas.width / 2); // right half
    expect(source.rect.left).toBeGreaterThan(canvas.width / 2);
    // hazards above the source in the right corner
    expect(source.rect.top).toBeGreaterThan(hazards[0]!.rect.top);
    expect(allWithinCanvas(placed, canvas)).toBe(true);
  });

  it('a SINGLE hazard fits the safe square and never overlaps the source', () => {
    const placed = computeBadgeLayout(
      badgesForPage([
        { family: 'region', value: 'FOREST' },
        { family: 'hazard', value: 'DEADLY' },
        { family: 'source', value: 'FIELD_GUIDE' },
      ]),
      canvas,
    );
    const haz = placed.find((p) => p.badge.family === 'hazard')!;
    const src = placed.find((p) => p.badge.family === 'source')!;
    // hazard must not run past the bottom of the source-reserved area
    expect(haz.rect.top + haz.rect.height).toBeLessThanOrEqual(src.rect.top + 1);
    // and the whole thing stays inside the 0.9in safe square (≤ canvas, checked too)
    expect(allWithinCanvas(placed, canvas)).toBe(true);
    expect(haz.rect.height).toBeLessThanOrEqual(Math.round(0.9 * canvas.dpi));
  });

  it('folio rect is bottom-centre, above the trim edge', () => {
    const r = computeFolioRect(canvas);
    expect(Math.abs(r.left + r.width / 2 - canvas.width / 2)).toBeLessThan(2); // centred
    expect(r.top).toBeLessThan(canvas.height); // above the bottom edge
    expect(r.top).toBeGreaterThan(canvas.height * 0.8); // in the bottom region
  });
});

describe('preflight gate', () => {
  const base = {
    widthPx: 2625, heightPx: 3375, dpi: 300, colorMode: 'srgb',
    pngBytes: 1000, pdfBytes: 1000, badgesWithinCanvas: true,
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

    const out = await composePrintPage(fixture, sampleBadgeSet, '42');

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
    );
    expect(out.stampedBadges).toBe(2); // region + source, no hazard
    expect(out.stampedFolio).toBe(false); // null folio
    expect(out.widthPx).toBe(2625);
  });
});
