/**
 * TRAIN THE DOG YOU'VE GOT — one-shot 4x upscale of the approved wrap artwork.
 *
 * The approved artwork is 1536x1024, which is 110.7 effective PPI across a
 * 12.669in wrap. KDP requires 300. This is the only thing standing between the
 * cover and a KDP-ready export.
 *
 * The platform's existing Real-ESRGAN path, face_enhance off because this is an
 * illustration and not a portrait. No regeneration, no redesign, nothing moved:
 * the composition that was approved is the one that comes back, with more
 * pixels under it.
 *
 * HONEST FRAMING, carried over from the precedent and worth repeating: this
 * SYNTHESISES detail. It is not native optical resolution, and KDP's automated
 * check cannot tell the two apart. A printed proof remains the real test.
 *
 * ONE SHOT. NO RETRY. A failure stops the run so it can be looked at rather
 * than quietly spending again.
 *
 *   yarn tsx scripts/train-the-dog-cover/upscale.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { upscaleImage } from '../../src/services/replicate/replicate.js';
import { COVER_DIR } from './book.js';

const arg = (n: string, d?: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const STEM = arg('stem', 'WRAP-R7')!;
const SRC = `${COVER_DIR}/art/${STEM}.png`;
const OUT = `${COVER_DIR}/art/${STEM}_UPSCALED-4x.png`;
/** The wrap this has to cover, and the standard it has to meet. */
const WRAP_W_IN = Number(arg('wrapw', '12.668872'));
const MIN_DPI = 300;

const source = readFileSync(SRC);
const before = await sharp(source).metadata();
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

console.log('ONE-SHOT COVER UPSCALE — no retry, no redesign');
console.log(`  source   ${SRC.split(/[\\/]/).pop()}`);
console.log(`           ${before.width} x ${before.height} px   sha ${sha(source).slice(0, 16)}`);
console.log(`           ${((before.width ?? 0) / WRAP_W_IN).toFixed(1)} effective PPI across a ${WRAP_W_IN.toFixed(3)}in wrap — needs ${MIN_DPI}`);
console.log('  scale    4x, face_enhance off');
console.log('  calling Replicate ...');

const t0 = Date.now();
const result = await upscaleImage({ pngBuffer: source, scale: 4 });
const after = await sharp(result.pngBuffer).metadata();
writeFileSync(OUT, result.pngBuffer);

const ppi = (after.width ?? 0) / WRAP_W_IN;
console.log(`\n  returned ${after.width} x ${after.height} px  (${(result.pngBuffer.length / 1048576).toFixed(1)} MB)`);
console.log(`  model    ${result.model}  scale ${result.scale}x`);
console.log(`  elapsed  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  out sha  ${sha(result.pngBuffer)}`);
console.log(`\n  effective PPI now ${ppi.toFixed(1)} against a ${MIN_DPI} minimum  ->  ${ppi >= MIN_DPI ? 'PASSES' : 'STILL SHORT'}`);
console.log(`  -> ${OUT}`);
process.exit(ppi >= MIN_DPI ? 0 : 1);
