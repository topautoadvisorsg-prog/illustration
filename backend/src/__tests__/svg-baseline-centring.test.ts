import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

/**
 * SVG TEXT CANNOT BE CENTRED WITH `dominant-baseline` IN THIS RENDERER.
 *
 * sharp rasterises SVG through librsvg, and librsvg implements neither
 * `dominant-baseline` nor `alignment-baseline`. It does not warn, it does not
 * approximate: the attribute is dropped and the text sits on its baseline.
 *
 * That is invisible in ordinary layout and expensive on a spine. Spine type is
 * drawn inside a `rotate(90)` group, so the baseline axis IS the across-spine
 * axis, and an ignored attribute slides the whole line half a cap height toward
 * one fold. It reached a finished hardcover wrap with the title touching the
 * front fold, while the build reported 0.1233in of clearance — the number was
 * computed from a cap-height ratio and nothing measured the ink.
 *
 * These tests exist so the attribute cannot quietly come back. If a future
 * librsvg implements it, the first test fails and the workaround can be dropped
 * deliberately rather than by accident.
 */

const W = 400;
const H = 200;
const FONT = 100;

/** Draw "HXO" anchored at the vertical middle and report where the ink lands. */
async function inkOffsetFromAnchor(attr: string): Promise<number> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="#000"/>` +
    `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" ${attr} ` +
    `font-family="DejaVu Sans, sans-serif" font-size="${FONT}" fill="#fff">HXO</text></svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
  let top = info.height;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels]! > 200) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        break;
      }
    }
  }
  expect(bottom).toBeGreaterThan(-1); // the text rendered at all
  return (top + bottom) / 2 - H / 2;
}

describe('SVG vertical centring through librsvg', () => {
  it('ignores dominant-baseline and alignment-baseline entirely', async () => {
    const plain = await inkOffsetFromAnchor('');
    for (const attr of [
      'dominant-baseline="middle"',
      'dominant-baseline="central"',
      'alignment-baseline="central"',
    ]) {
      const withAttr = await inkOffsetFromAnchor(attr);
      // Identical to no attribute at all — the attribute does nothing.
      expect(withAttr, `${attr} should be a no-op in this renderer`).toBe(plain);
    }
    // And "no-op" means the ink sits well above the anchor, not centred on it.
    expect(Math.abs(plain)).toBeGreaterThan(FONT * 0.25);
  });

  it('honours an explicit dy, which is why the spine modules use one', async () => {
    const plain = await inkOffsetFromAnchor('');
    const shifted = await inkOffsetFromAnchor('dy="0.35em"');

    // Honoured: the correction actually moves the ink, by about the 0.35em asked.
    expect(shifted - plain).toBeGreaterThan(FONT * 0.3);

    /* And it lands near centre. NOT exactly: 0.35em is half a cap height for a
       typical face, and cap height is face-dependent — the same value centres
       Georgia to half a pixel and this face to 4.5. That residual is 4.5% of the
       font size, which is a few thousandths of an inch at spine sizes and does
       not matter here. It is exactly why `spine-type.ts`, where the margin IS
       thin, measures the offset per string instead of using a constant. */
    expect(Math.abs(shifted)).toBeLessThan(FONT * 0.06);
  });

  it('keeps dominant-baseline out of the modules that set spine type', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    for (const rel of [
      '../pipeline/stage-6-layout/cover-spine-typeset.ts',
      '../pipeline/cover/spine-band-repair.ts',
    ]) {
      const src = readFileSync(join(here, rel), 'utf8');
      // The comment explaining the ban may name it; an attribute in an SVG
      // string may not.
      const inMarkup = /(?:dominant|alignment)-baseline\s*=\s*"/.test(
        src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, ''),
      );
      expect(inMarkup, `${rel} must not set a baseline attribute librsvg ignores`).toBe(false);
    }
  });
});
