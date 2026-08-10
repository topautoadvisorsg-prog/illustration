/**
 * Spine repair — the geometry, the mask, and the guarantee.
 *
 * The guarantee is the important one: everything outside the spine must be
 * byte-identical to the approved artwork, because the operator approved that
 * front and back and a second generation would not reproduce them.
 */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ProjectConfigSchema } from '@wildlands/shared';
import {
  spineStripInArt,
  buildSpineMask,
  compositeSpineOnly,
  buildSpineRepairPrompt,
} from '../pipeline/stage-6-layout/cover-spine-repair.js';

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'NO ONE TOLD ME THAT',
  authorName: 'Nolan Whitlow',
  trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
  paperStock: 'cream',
});

const ART_W = 1536;
const ART_H = 1024;
const strip = spineStripInArt(config, 154, ART_W, ART_H);

describe('spine strip geometry', () => {
  it('lands on the spine, accounting for the crop the compositor applies', () => {
    // The wrap is 11.635in with the spine starting at 0.125 + 5.5 = 5.625in.
    // Naively that is 48.3% of the width -> x 742 of 1536. The crop shifts it,
    // so the honest answer is nearby but not identical, and CENTRED on the art.
    expect(strip.xPx).toBeGreaterThan(700);
    expect(strip.xPx).toBeLessThan(800);
    expect(strip.spineIn).toBeCloseTo(0.385, 3);
  });

  it('is narrow, and the test says how narrow so nobody is surprised', () => {
    // 0.385in of an 11.635in wrap is 3.3%. On a 1536px canvas that is ~45px.
    // This is the real constraint on whether a model can set type here.
    expect(strip.widthPx).toBeGreaterThan(30);
    expect(strip.widthPx).toBeLessThan(70);
  });
});

describe('mask', () => {
  it('is opaque everywhere except the spine column', async () => {
    const mask = await buildSpineMask(strip);
    const { data, info } = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];

    // Inside the spine: transparent, so the model may paint.
    expect(alphaAt(strip.xPx + Math.floor(strip.widthPx / 2), Math.floor(ART_H / 2))).toBe(0);
    // Front and back panels: opaque, so the model is asked to hold them.
    expect(alphaAt(50, 50)).toBe(255);
    expect(alphaAt(ART_W - 50, ART_H - 50)).toBe(255);
  });
});

describe('composite — the actual guarantee', () => {
  it('takes ONLY the spine column from the edit and keeps every other pixel', async () => {
    // Original: solid blue. "Edited" result: solid red everywhere — the worst
    // case, a model that redrew the entire canvas.
    const original = await sharp({
      create: { width: ART_W, height: ART_H, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    }).png().toBuffer();
    const edited = await sharp({
      create: { width: ART_W, height: ART_H, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();

    const out = await compositeSpineOnly(original, edited, strip);
    const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };

    // The spine took the edit.
    expect(px(strip.xPx + Math.floor(strip.widthPx / 2), 512)).toEqual([255, 0, 0]);
    // Everything else survived, even though the model returned red for it.
    expect(px(10, 10)).toEqual([0, 0, 255]);
    expect(px(strip.xPx - 5, 512)).toEqual([0, 0, 255]);
    expect(px(strip.xPx + strip.widthPx + 5, 512)).toEqual([0, 0, 255]);
    expect(px(ART_W - 10, ART_H - 10)).toEqual([0, 0, 255]);
  });
});

describe('prompt', () => {
  const p = buildSpineRepairPrompt(config, strip);
  it('asks for one line, not a stack', () => {
    expect(p).toMatch(/ONE single line/);
    expect(p).toMatch(/never stacked/);
    expect(p).toContain('NOLAN WHITLOW');
  });
  it('prefers shrinking the type over stacking it', () => {
    expect(p).toMatch(/set it SMALLER so it still fits on one line/);
  });
  it('forbids touching the front and back', () => {
    expect(p).toMatch(/Do NOT redraw, restyle, recolour or move anything on the front cover or the back cover/);
  });
});
