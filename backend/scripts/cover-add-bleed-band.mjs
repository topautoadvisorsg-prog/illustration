/**
 * Add a sacrificial bleed band to the BOTTOM of a cover wrap.
 *
 * Print-safety rule: text must never be the element closest to a trim edge —
 * illustration takes that risk. On this wrap the author name is the lowest
 * element, so trim variance eats into it.
 *
 * Rather than regenerate (the operator approved THIS picture), the artwork is
 * extended downward with its own ground.
 *
 * ─── WHY IT MIRRORS IN SMALL PASSES ───────────────────────────────────────
 * One big mirror pulls from far enough up the image to catch the author's sign
 * panel, and reflects it upside-down below the fold — a legible, mirrored
 * "Abby Fenwick" appeared under the real one. So the band is built from a THIN
 * strip of clean ground only, mirrored repeatedly: each pass reflects ground
 * that is itself ground, so nothing structural is ever pulled in.
 *
 *   node scripts/cover-add-bleed-band.mjs <in.png> <out.png> [totalPx] [stripPx]
 */
import sharp from 'sharp';

const [, , inPath, outPath, totalArg, stripArg] = process.argv;
if (!inPath || !outPath) { console.error('usage: <in.png> <out.png> [totalPx] [stripPx]'); process.exit(2); }

/** Total band to add. */
const total = Number(totalArg ?? 120);
/** Per-pass strip. Must be shallower than the lowest piece of artwork/type. */
const strip = Number(stripArg ?? 34);

const { width, height } = await sharp(inPath).metadata();
let buf = await sharp(inPath).png().toBuffer();
let added = 0;
let passes = 0;

while (added < total) {
  const step = Math.min(strip, total - added);
  buf = await sharp(buf).extend({ bottom: step, extendWith: 'mirror' }).png().toBuffer();
  added += step;
  passes++;
}

await sharp(buf).toFile(outPath);
const out = await sharp(outPath).metadata();
console.log(`in    : ${width}x${height}   aspect ${(width / height).toFixed(3)}`);
console.log(`band  : +${added}px in ${passes} passes of <=${strip}px (ground only, never the sign)`);
console.log(`out   : ${out.width}x${out.height}   aspect ${(out.width / out.height).toFixed(3)}`);
