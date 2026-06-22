/**
 * Remove baked-in ORANGE guide lines from a render before print.
 *
 * The blueprint's trim-safe / text guide lines (saturated orange dashes) were
 * sometimes copied into the AI artwork. They are thin, full-height vertical lines
 * at the text-column edges and would PRINT. This detects them — a thin column
 * (≤6px) of guide-orange pixels spread across ≥2 of the 3 vertical thirds, so a
 * localised illustration orange (a pinecone, foliage) never qualifies — and bridges
 * each band horizontally from its immediate neighbours so the background reconstructs
 * smoothly. Pages with no lines are returned untouched (no re-encode).
 */
import sharp from 'sharp';

export async function removeGuideLines(img: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const idx = (x: number, y: number) => (y * W + x) * C;
  const isGuide = (x: number, y: number): boolean => {
    const i = idx(x, y); const R = data[i]!, G = data[i + 1]!, B = data[i + 2]!;
    return R > 120 && G > 35 && G < 135 && B < 85 && R - B > 75 && R - G > 38;
  };
  const third = Math.floor(H / 3);
  const colCount = new Array(W).fill(0);
  const colThirds: number[][] = Array.from({ length: W }, () => [0, 0, 0]);
  for (let x = 0; x < W; x++) {
    const t3 = colThirds[x]!;
    for (let y = 0; y < H; y++) {
      if (!isGuide(x, y)) continue;
      colCount[x]++;
      const ti = Math.min(2, Math.floor(y / third));
      t3[ti] = (t3[ti] ?? 0) + 1;
    }
  }
  const isGuideCol = (x: number) => colCount[x] >= H * 0.18 && colThirds[x]!.filter((c) => c >= third * 0.06).length >= 2;
  const raw: Array<[number, number]> = [];
  let s = -1;
  for (let x = 0; x < W; x++) { if (isGuideCol(x)) { if (s < 0) s = x; } else if (s >= 0) { raw.push([s, x - 1]); s = -1; } }
  if (s >= 0) raw.push([s, W - 1]);
  const bands = raw.filter(([a, b]) => b - a <= 5); // guide lines are thin; reject wide illustration edges
  if (bands.length === 0) return img;

  const out = Buffer.from(data);
  for (let [x0, x1] of bands) {
    x0 = Math.max(1, x0 - 2); x1 = Math.min(W - 2, x1 + 2);
    const span = x1 - x0 + 2;
    for (let y = 0; y < H; y++) {
      const li = idx(x0 - 1, y), ri = idx(x1 + 1, y);
      for (let x = x0; x <= x1; x++) {
        const t = (x - x0 + 1) / span;
        const oi = idx(x, y);
        for (let k = 0; k < 3; k++) out[oi + k] = Math.round(data[li + k]! * (1 - t) + data[ri + k]! * t);
      }
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: C } }).png().toBuffer();
}
