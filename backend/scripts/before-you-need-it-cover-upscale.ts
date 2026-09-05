/**
 * BEFORE YOU NEED IT — one-shot upscale of the APPROVED cover artwork.
 *
 * The platform's existing Real-ESRGAN path at 4x. No regeneration, no redesign,
 * nothing moved or redrawn: the composition that was approved is the one that
 * comes back, with more pixels under it.
 *
 * HONEST FRAMING, carried over from the precedent: this synthesises detail. It
 * is not native optical resolution, and KDP's automated check cannot tell the
 * two apart. The printed proof remains the real test.
 *
 * ONE SHOT. NO RETRY.
 *
 *   tsx scripts/before-you-need-it-cover-upscale.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { upscaleImage } from '../src/services/replicate/replicate.js';

const DIR = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/cover';
const SRC = `${DIR}/BYNI-cover-wrap-art-A_1536x1024.png`;
const OUT = `${DIR}/BYNI-cover-wrap-art-A_UPSCALED.png`;

const source = readFileSync(SRC);
const before = await sharp(source).metadata();
console.log('ONE-SHOT COVER UPSCALE — no retry, no redesign');
console.log(`  source : ${before.width} x ${before.height} px, sha ${createHash('sha256').update(source).digest('hex').slice(0, 16)}`);
console.log('  scale  : 4x, face_enhance off');
console.log('  calling Replicate ...');

const t0 = Date.now();
const result = await upscaleImage({ pngBuffer: source, scale: 4 });
const after = await sharp(result.pngBuffer).metadata();
writeFileSync(OUT, result.pngBuffer);

console.log(`\n  returned : ${after.width} x ${after.height} px (${(result.pngBuffer.length / 1048576).toFixed(1)} MB)`);
console.log(`  model    : ${result.model}  scale ${result.scale}x`);
console.log(`  elapsed  : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  out sha  : ${createHash('sha256').update(result.pngBuffer).digest('hex')}`);
console.log(`  -> ${OUT}`);
process.exit(0);
