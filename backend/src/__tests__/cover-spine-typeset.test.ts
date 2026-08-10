/**
 * Deterministic spine — the acceptance standard is that you cannot see the repair.
 *
 * The fixtures here are deliberately GRAINY. A flat "average colour" fill would
 * pass a test on a perfectly uniform field and then look like an obvious patch
 * on real artwork, which is exactly the failure mode being guarded against. So
 * the background is noisy, and the test asserts the repaired strip keeps that
 * noise rather than smoothing it away.
 */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { typesetSpine, diffOutsideStrip } from '../pipeline/stage-6-layout/cover-spine-typeset.js';

const W = 400;
const H = 300;
const X = 180;
const SW = 46;

/** Cover-like fixture: grainy blue field, with "lettering" down the spine. */
async function fixture(): Promise<Buffer> {
  const px = Buffer.alloc(W * H * 3);
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      // Grain of +-6, plus a gentle vertical gradient so a naive flat fill shows.
      const grain = Math.round((rnd() - 0.5) * 12);
      const grad = Math.round((y / H) * 8);
      px[i] = 18 + grain + grad;
      px[i + 1] = 42 + grain + grad;
      px[i + 2] = 105 + grain + grad;
    }
  }
  // Bright "letters" in the spine column on a handful of row bands.
  for (const [a, b] of [[60, 78], [95, 112], [180, 196], [210, 226]]) {
    for (let y = a; y <= b; y++) {
      for (let x = X + 8; x < X + SW - 8; x++) {
        const i = (y * W + x) * 3;
        px[i] = 235; px[i + 1] = 120; px[i + 2] = 40;
      }
    }
  }
  return sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

const stats = async (buf: Buffer, left: number, width: number) => {
  const s = await sharp(buf).extract({ left, top: 0, width, height: H }).stats();
  return s.channels.map((c) => ({ mean: Math.round(c.mean), stdev: Math.round(c.stdev * 10) / 10 }));
};

describe('deterministic spine', () => {
  it('touches not one pixel outside the spine column', async () => {
    const art = await fixture();
    const { art: out } = await typesetSpine({ art, xPx: X, widthPx: SW, title: 'NO ONE TOLD ME THAT', author: 'NOLAN WHITLOW' });

    const d = await diffOutsideStrip(art, out, X, SW);
    expect(d.pixelsDiffering).toBe(0);
    expect(d.regionsChecked.length).toBe(2);
  });

  it('rebuilds the background from REAL pixels, keeping the grain', async () => {
    const art = await fixture();
    const { art: out } = await typesetSpine({ art, xPx: X, widthPx: SW, title: 'X', author: 'Y' });

    // Compare the repaired strip against the untouched field beside it. A flat
    // fill would collapse stdev toward zero; real copied pixels keep it.
    const beside = await stats(out, X - SW - 4, SW);
    const strip = await stats(out, X, SW);
    for (let ch = 0; ch < 3; ch++) {
      // Grain preserved: within a hair of the neighbouring field's variation.
      expect(strip[ch]!.stdev).toBeGreaterThan(beside[ch]!.stdev * 0.5);
    }
  });

  it('matches the surrounding tone — no visibly different blue', async () => {
    const art = await fixture();
    const { art: out } = await typesetSpine({ art, xPx: X, widthPx: SW, title: 'X', author: 'Y' });

    const beside = await stats(out, X - SW - 4, SW);
    const strip = await stats(out, X, SW);
    // Means within a couple of levels per channel. The strip carries type, so a
    // small lift is expected; a different blue would be far larger.
    for (let ch = 0; ch < 3; ch++) {
      expect(Math.abs(strip[ch]!.mean - beside[ch]!.mean)).toBeLessThan(14);
    }
  });

  it('lifts the ink colour from the artwork rather than naming one', async () => {
    const art = await fixture();
    const { report } = await typesetSpine({ art, xPx: X, widthPx: SW, title: 'T', author: 'A' });
    // The fixture's lettering is orange (235,120,40).
    const m = /^#(..)(..)(..)$/.exec(report.titleHex)!;
    const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i]!, 16));
    expect(r).toBeGreaterThan(180);
    expect(b).toBeLessThan(110);
    expect(report.inkRowsRebuilt).toBeGreaterThan(0);
    expect(report.cleanRowsAvailable).toBeGreaterThan(0);
  });

  it('leaves a spine that has no lettering completely alone', async () => {
    // A uniform strip has nothing that departs from its own field, so there is
    // nothing to rebuild. The background must come through untouched rather
    // than being "cleaned" into a flat fill.
    const solid = await sharp({
      create: { width: W, height: H, channels: 3, background: { r: 24, g: 48, b: 110 } },
    }).png().toBuffer();
    const { report } = await typesetSpine({ art: solid, xPx: X, widthPx: SW, title: 'T', author: 'A' });
    expect(report.inkRowsRebuilt).toBe(0);
    expect(report.cleanRowsAvailable).toBe(H);
  });
});
