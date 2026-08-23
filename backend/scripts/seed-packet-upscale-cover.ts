/**
 * WHAT THE SEED PACKET SKIPS — ONE-SHOT cover-artwork upscale.
 *
 * Takes the APPROVED cover master and runs it through the platform's existing
 * Real-ESRGAN path at 4x. No regeneration, no redesign, no new artwork.
 *
 * This produces AI-ENHANCED artwork with synthesised detail. It is NOT native
 * photography at 300 PPI, and it must be judged on how it looks at printed size
 * rather than on pixel count alone.
 *
 * ONE SHOT. NO RETRY. Writes one PNG and nothing else.
 *
 *   tsx scripts/seed-packet-upscale-cover.ts <sourcePng> <outPng>
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';
import sharp from 'sharp';

const REPO_ROOT = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '../../');

await import('../src/env.js');
const PROD = parseDotenv(readFileSync(nodePath.join(REPO_ROOT, '.env')));
process.env.DATABASE_URL = PROD.DATABASE_URL;
process.env.APP_ENVIRONMENT = 'production';

const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) throw new Error('usage: seed-packet-upscale-cover.ts <sourcePng> <outPng>');

const { upscaleImage } = await import('../src/services/replicate/replicate.js');

const source = readFileSync(SRC);
const before = await sharp(source).metadata();
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

console.log('ONE-SHOT COVER UPSCALE — no retry');
console.log(`  source     : ${nodePath.basename(SRC)}`);
console.log(`  source size: ${before.width} x ${before.height} px`);
console.log(`  source sha : ${sha(source).slice(0, 16)}`);
console.log(`  model      : ${process.env.REPLICATE_UPSCALE_MODEL ?? 'nightmareai/real-esrgan (default)'}`);
console.log('  scale      : 4x, face_enhance off');
console.log('  calling Replicate ...');

const started = Date.now();
const result = await upscaleImage({ pngBuffer: source, scale: 4 });
const after = await sharp(result.pngBuffer).metadata();
writeFileSync(OUT, result.pngBuffer);

console.log(`\n  returned   : ${after.width} x ${after.height} px  (${(result.pngBuffer.length / 1048576).toFixed(1)} MB)`);
console.log(`  model used : ${result.model}   scale ${result.scale}x`);
console.log(`  elapsed    : ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`  out sha    : ${sha(result.pngBuffer)}`);
console.log(`  -> ${OUT}`);

console.log('\nEFFECTIVE PPI OF THE UPSCALED RASTER AT PRINTED SIZE');
for (const [name, w, h] of [
  ['paperback wrap', 12.565, 9.25],
  ['hardcover wrap', 14.079, 10.417],
] as const) {
  const ppiW = after.width! / w;
  const ppiH = after.height! / h;
  console.log(
    `  ${name.padEnd(15)} ${ppiW.toFixed(0)} x ${ppiH.toFixed(0)} PPI` +
      `   ${ppiW >= 300 && ppiH >= 300 ? 'clears 300' : ppiW >= 200 ? 'above 200, below 300' : 'LOW'}`,
  );
}
console.log('\nNote: these are pixels per printed inch. The detail is AI-synthesised, not captured.');
