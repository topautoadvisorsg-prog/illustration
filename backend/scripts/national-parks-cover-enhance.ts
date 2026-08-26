/**
 * ENHANCE THE APPROVED COVER PAINTING. Nothing is added, moved or redrawn.
 *
 * The approved artwork is 1536 x 1024. The wrap it has to print at is
 * 3756 x 2775 at 300 DPI, so the picture has to be resampled upward whatever
 * else happens. Setting a 300 DPI tag on a 1536px file would be a lie: the
 * pixels would still be 1536 across. This makes real pixels.
 *
 * It is resampled ONCE, straight to the size the wrap fit consumes, so the
 * picture is never scaled twice. Three passes, in this order and no other:
 *
 *   RESAMPLE   lanczos3 to the exact working size. Lanczos holds an edge far
 *              better than bilinear, which matters because this painting
 *              carries set type on both panels.
 *
 *   DE-WEAVE   the model baked a fine diagonal cross-hatch into the whole
 *              picture; it is plainest in the sky and on the hillside behind
 *              the hiker. It is a regular high-frequency pattern, so sharpening
 *              a raw upscale amplifies it into visible mesh. A small gaussian
 *              AFTER the upscale removes it: at 2.5x the weave is a couple of
 *              pixels across and the type is two and a half times bigger than
 *              it was, so the blur reaches the artifact and not the letters.
 *
 *   SHARPEN    unsharp mask, weighted DOWN in flat areas and up on edges, so
 *              detail comes back on rock, foliage and type without putting the
 *              weave back into the sky or haloing the lettering.
 *
 * The colour is untouched: no saturation, no curve, no white balance. The
 * composition is untouched: no crop, no rotate, no flip, no aspect change.
 *
 *   tsx scripts/national-parks-cover-enhance.ts <in.png> <out.png> <scale> [--blur=n] [--sharpen=s,m1,m2]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const IN = process.argv[2];
const OUT = process.argv[3];
const SCALE = Number(process.argv[4] ?? 1);
if (!IN || !OUT || !Number.isFinite(SCALE)) {
  throw new Error('usage: national-parks-cover-enhance.ts <in.png> <out.png> <scale> [--blur=n] [--sharpen=s,m1,m2]');
}
const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const BLUR = Number(arg('blur') ?? 0.7);
const [SH_S, SH_M1, SH_M2] = (arg('sharpen') ?? '1.2,0.4,1.7').split(',').map(Number) as [number, number, number];

const src = readFileSync(IN);
const meta = await sharp(src).metadata();
const w = meta.width!;
const h = meta.height!;
const outW = Math.round(w * SCALE);
const outH = Math.round(h * SCALE);

console.log(`source     : ${IN}`);
console.log(`           : ${w} x ${h} px, sha256 ${createHash('sha256').update(src).digest('hex')}`);
console.log(`resample   : lanczos3 x${SCALE} -> ${outW} x ${outH} px (one resample, no double scaling)`);
console.log(`de-weave   : gaussian sigma ${BLUR} after the upscale`);
console.log(`sharpen    : unsharp sigma ${SH_S}, flat x${SH_M1}, edges x${SH_M2}`);

let img = sharp(src).resize(outW, outH, { kernel: 'lanczos3', fit: 'fill' });
if (BLUR > 0) img = img.blur(BLUR);
img = img.sharpen({ sigma: SH_S, m1: SH_M1, m2: SH_M2 });

/** 300 DPI in the metadata AND 300 DPI in the pixels. The tag alone would be a lie. */
const out = await img.withMetadata({ density: 300 }).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(OUT, out);
const check = await sharp(out).metadata();
console.log(`\nfile       : ${OUT}`);
console.log(`           : ${check.width} x ${check.height} px, density tag ${check.density} DPI`);
console.log(`bytes      : ${out.length}`);
console.log(`sha256     : ${createHash('sha256').update(out).digest('hex')}`);
process.exit(0);
