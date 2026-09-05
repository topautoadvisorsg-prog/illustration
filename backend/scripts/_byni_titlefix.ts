/**
 * BEFORE YOU NEED IT - shrink the hardcover title and subtitle by 20%.
 *
 * WHY. KDP rejected the hardcover. The lettering runs 0.125in into the hinge --
 * the creased groove beside the spine, where there is no board under the case --
 * and sits 0.49in above the top safe line. Both were measured here before the
 * rejection arrived.
 *
 * NOT REGENERATED. The artwork is approved. An image model asked to "keep
 * everything the same, just smaller" repaints the whole cover. This lifts the
 * existing lettering off the existing plate, fills behind it from its own
 * surrounding pixels, and composites it back at 80%. Every pixel outside the
 * lettering is the approved artwork.
 *
 * THE GIRL IS FOUND AS A SHAPE, NOT A COLOUR. Two earlier attempts keyed on
 * colour and on per-row x limits. Both failed: her denim overlaps the title
 * navy in the red channel, her hair overlaps the NEED IT red in green, and for
 * the NEED IT row the lettering and her hair share an x range. A mask built
 * that way caught part of her arm and hip, and the inpaint blurred them -- real
 * damage to approved artwork, found by looking at the plate rather than at the
 * counts. Here everything that is not the cream ground is labelled: she is one
 * enormous connected region, while each letter is its own small one.
 *
 *   yarn tsx scripts/_byni_titlefix.ts [scale] [leftPx] [topPx]
 *
 * Local and free. Writes a hardcover-only plate; the shared master is untouched.
 */
import sharp from 'sharp';

const M = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/cover/BYNI-cover-wrap-art-A_UPSCALED.png';
const OUT = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/cover/_titlefix';
const SCALE = Number(process.argv[2] ?? 0.8);
const DEST_L = Number(process.argv[3] ?? 3480);
const DEST_T = Number(process.argv[4] ?? 520);
const RX = 3200, RY = 250, RW = 1700, RH = 2700;

const meta = await sharp(M).metadata();
const W = meta.width!;
const { data } = await sharp(M).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

// 1. everything that is not the cream ground
const isCream = (r: number, g: number, b: number) => r > 232 && g > 216 && b > 186;
const raw = new Uint8Array(RW * RH);
for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
  const i = ((y + RY) * W + (x + RX)) * 4;
  if (!isCream(data[i]!, data[i + 1]!, data[i + 2]!)) raw[y * RW + x] = 1;
}

// 2. label it; keep only the letter-shaped regions
interface Comp { px: number[]; x0: number; x1: number; y0: number; y1: number }
const comps: Comp[] = [];
const label = new Int32Array(RW * RH).fill(-1);
const stack: number[] = [];
for (let s0 = 0; s0 < RW * RH; s0++) {
  if (!raw[s0] || label[s0] !== -1) continue;
  const px: number[] = [];
  let cx0 = RW, cx1 = -1, cy0 = RH, cy1 = -1;
  stack.push(s0); label[s0] = s0;
  while (stack.length) {
    const p = stack.pop()!; px.push(p);
    const ax = p % RW, ay = (p / RW) | 0;
    if (ax < cx0) cx0 = ax; if (ax > cx1) cx1 = ax;
    if (ay < cy0) cy0 = ay; if (ay > cy1) cy1 = ay;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = ax + dx, ny = ay + dy;
      if (nx < 0 || ny < 0 || nx >= RW || ny >= RH) continue;
      const q = ny * RW + nx;
      if (raw[q] && label[q] === -1) { label[q] = s0; stack.push(q); }
    }
  }
  comps.push({ px, x0: cx0, x1: cx1, y0: cy0, y1: cy1 });
}
comps.sort((a, b) => b.px.length - a.px.length);
const big = comps[0]!;
console.log(`non-cream regions ${comps.length}; largest ${big.px.length}px, master x ${RX + big.x0}..${RX + big.x1} y ${RY + big.y0}..${RY + big.y1}`);

const mask = new Uint8Array(RW * RH);
let kept = 0, dropped = 0;
for (const c of comps) {
  const h = c.y1 - c.y0 + 1;
  // She is enormous and spans most of the region height; a letter is neither.
  // Anything reaching the region's right edge is her, or artwork beyond her.
  // Sized from the artwork, not guessed: the largest single letter (the O of
  // YOU) is about 79k pixels and she is 437k, so the cut sits between them.
  // At 60k the title letters B, O, R, Y, U and N were dropped as "her" and
  // only the thin ones survived -- visible instantly in the mask, invisible
  // in the counts.
  const isGirl = c.px.length > 150000 || h > 900 || c.x1 >= RW - 2;
  const isNoise = c.px.length < 60;
  if (isGirl || isNoise) { dropped++; continue; }
  for (const p of c.px) mask[p] = 1;
  kept++;
}
let bx0 = RW, bx1 = -1, by0 = RH, by1 = -1, n = 0;
for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) if (mask[y * RW + x]) {
  n++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
}
console.log(`glyph regions kept ${kept}, dropped ${dropped}`);
console.log(`text ${n}px  master bbox x ${RX + bx0}..${RX + bx1}  y ${RY + by0}..${RY + by1}`);
await sharp(Buffer.from(mask.map((v) => (v ? 0 : 255))), { raw: { width: RW, height: RH, channels: 1 } })
  .resize({ width: 700 }).png().toFile(`${OUT}/mask.png`);

// 3. inpaint behind the lettering
const DIL = 12;
const hole = new Uint8Array(RW * RH);
for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
  if (!mask[y * RW + x]) continue;
  for (let dy = -DIL; dy <= DIL; dy++) for (let dx = -DIL; dx <= DIL; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < RW && ny < RH) hole[ny * RW + nx] = 1;
  }
}
const plate = new Float32Array(RW * RH * 3);
for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
  const i = ((y + RY) * W + (x + RX)) * 4, o = (y * RW + x) * 3;
  plate[o] = data[i]!; plate[o + 1] = data[i + 1]!; plate[o + 2] = data[i + 2]!;
}
const known = Uint8Array.from(hole, (v) => (v ? 0 : 1));
let remaining = 0; for (const v of hole) remaining += v;
let pass = 0;
while (remaining > 0 && pass < 400) {
  pass++;
  const add: number[] = [];
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const p = y * RW + x;
    if (known[p]) continue;
    let r = 0, g = 0, b = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= RW || ny >= RH) continue;
      const q = ny * RW + nx;
      if (known[q]) { const o = q * 3; r += plate[o]!; g += plate[o + 1]!; b += plate[o + 2]!; c++; }
    }
    if (c) { const o = p * 3; plate[o] = r / c; plate[o + 1] = g / c; plate[o + 2] = b / c; add.push(p); }
  }
  for (const p of add) known[p] = 1;
  remaining -= add.length;
  if (!add.length) break;
}
/* The neighbour fill alone leaves a legible ghost: solving it locally
   reproduces a letter-shaped residue in the cream's gradient. Blurring the
   filled plate erases any shape at letter scale, and the blurred value is used
   ONLY inside the holes, so nothing outside them is touched. */
const rough = Buffer.alloc(RW * RH * 3);
for (let i = 0; i < RW * RH * 3; i++) rough[i] = Math.max(0, Math.min(255, Math.round(plate[i]!)));
const smooth = await sharp(rough, { raw: { width: RW, height: RH, channels: 3 } }).blur(18).raw().toBuffer();
for (let p = 0; p < RW * RH; p++) {
  if (!hole[p]) continue;
  const o = p * 3;
  plate[o] = smooth[o]!; plate[o + 1] = smooth[o + 1]!; plate[o + 2] = smooth[o + 2]!;
}
console.log(`inpaint ${pass} passes, ${remaining} unfilled; ghost removed`);

// 4. lift the lettering, scale it, put it back
const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
const glyph = Buffer.alloc(bw * bh * 4);
for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
  const src = ((y + by0 + RY) * W + (x + bx0 + RX)) * 4, d = (y * bw + x) * 4;
  glyph[d] = data[src]!; glyph[d + 1] = data[src + 1]!; glyph[d + 2] = data[src + 2]!;
  glyph[d + 3] = mask[(y + by0) * RW + (x + bx0)] ? 255 : 0;
}
const nw = Math.round(bw * SCALE), nh = Math.round(bh * SCALE);
const scaled = await sharp(glyph, { raw: { width: bw, height: bh, channels: 4 } })
  .blur(0.8).resize(nw, nh, { kernel: 'lanczos3' }).png().toBuffer();

const plateBuf = Buffer.alloc(RW * RH * 3);
for (let i = 0; i < RW * RH * 3; i++) plateBuf[i] = Math.max(0, Math.min(255, Math.round(plate[i]!)));
const patched = await sharp(plateBuf, { raw: { width: RW, height: RH, channels: 3 } })
  .composite([{ input: scaled, left: DEST_L - RX, top: DEST_T - RY }]).png().toBuffer();

await sharp(M).composite([{ input: patched, left: RX, top: RY }])
  .png({ compressionLevel: 9 }).toFile(`${OUT}/wrap-art-HARDCOVER-title80.png`);
console.log(`\nblock ${bw}x${bh} -> ${nw}x${nh}, placed at (${DEST_L},${DEST_T})`);
console.log(`spans master x ${DEST_L}..${DEST_L + nw}  y ${DEST_T}..${DEST_T + nh}`);
console.log(`-> ${OUT}/wrap-art-HARDCOVER-title80.png`);
