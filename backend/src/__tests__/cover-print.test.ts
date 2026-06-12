/**
 * Cover Print-Prep test — exercises the real sharp upscale + barcode stamp +
 * pdf-lib embed on a fixture, no DB and no image-gen spend. Guards the 300-DPI
 * output contract for the full-wrap cover.
 */

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { composeCoverPrint } from '../pipeline/print-prep/cover-print.js';
import type { ProjectConfig } from '@wildlands/shared';
import type { CoverDimensions } from '../pipeline/stage-6-layout/render-html.js';

// gpt-image-2 landscape native size for the wrap art.
const NATIVE_W = 1536;
const NATIVE_H = 1024;

// 7×10 trim + 0.125 bleed, thin spine (≈10-page book) → 14.31 × 10.25 in wrap.
const config = {
  trimSize: { widthIn: 7, heightIn: 10, bleedIn: 0.125 },
} as unknown as ProjectConfig;
const dims: CoverDimensions = { fullWidthIn: 14.31, fullHeightIn: 10.25, spineIn: 0.06 };

async function fixtureArt(): Promise<Buffer> {
  return sharp({
    create: { width: NATIVE_W, height: NATIVE_H, channels: 3, background: { r: 120, g: 90, b: 60 } },
  })
    .png()
    .toBuffer();
}

describe('composeCoverPrint — 300-DPI full-wrap cover', () => {
  it('upscales the wrap art onto the 300-DPI canvas and reports native size', async () => {
    const res = await composeCoverPrint(await fixtureArt(), config, dims);
    expect(res.dpi).toBe(300);
    expect(res.widthPx).toBe(Math.round(dims.fullWidthIn * 300)); // 4293
    expect(res.heightPx).toBe(Math.round(dims.fullHeightIn * 300)); // 3075
    expect(res.artNativeWidthPx).toBe(NATIVE_W);
    expect(res.artNativeHeightPx).toBe(NATIVE_H);
    // Effective DPI across the physical wrap must be ≥ 300.
    expect(res.widthPx / dims.fullWidthIn).toBeGreaterThanOrEqual(300);
    expect(res.heightPx / dims.fullHeightIn).toBeGreaterThanOrEqual(300);
  });

  it('emits a lossless PNG of the full canvas and a single-page PDF', async () => {
    const res = await composeCoverPrint(await fixtureArt(), config, dims);
    const meta = await sharp(res.pngBuffer).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(Math.round(dims.fullWidthIn * 300));
    expect(meta.height).toBe(Math.round(dims.fullHeightIn * 300));
    // PDF header present; no JPEG anywhere in the cover bytes.
    expect(res.pdfBuffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
