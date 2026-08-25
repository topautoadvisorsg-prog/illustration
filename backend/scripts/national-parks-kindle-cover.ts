/**
 * KINDLE MARKETING COVER — front panel only, from the approved print wrap.
 *
 * Cropped out of the finished paperback wrap rather than re-generated, so the
 * ebook and the print editions are unmistakably the same book. No spine, no
 * back panel, no barcode area: an ebook cover is a single portrait image and
 * anything else on it reads as a scan of a physical object.
 *
 * KDP's ebook cover ideal is 1.6:1 (1600 x 2560). A 6x9 book is 1.5:1, so the
 * front panel is cropped to the taller ratio about its own centre rather than
 * padded — bars would show as grey edges in the store thumbnail.
 *
 *   npx tsx scripts/national-parks-kindle-cover.ts <wrapPdfOrPng> <outJpg>
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SRC = process.argv[2];
const OUT = process.argv[3];
if (!SRC || !OUT) throw new Error('usage: national-parks-kindle-cover.ts <wrapProofPng> <outJpg>');

/** KDP ebook cover: 1600 x 2560 is the recommended size, 1.6:1. */
const TARGET_W = 1600;
const TARGET_H = 2560;

/**
 * The approved paperback wrap, in inches.
 *
 * These MUST track the interior's page count: the spine widens with it, and the
 * front panel starts after the spine, so a stale figure crops the ebook cover
 * off-centre. Defaults are the 118-page build; override for another.
 */
const WRAP_W = Number(process.env.NP_WRAP_W ?? 12.515736);
const WRAP_H = 9.25;
const BLEED = 0.125;
const TRIM_W = 6;
const SPINE = Number(process.env.NP_SPINE ?? 0.265736);

const meta = await sharp(SRC).metadata();
const pxPerIn = meta.width! / WRAP_W;

/** The front panel: everything right of the spine, out to the trim edge. */
const frontLeftIn = BLEED + TRIM_W + SPINE;
const frontRightIn = frontLeftIn + TRIM_W;
const frontCentreIn = (frontLeftIn + frontRightIn) / 2;

/**
 * Full trim height, and whatever width the 1.6:1 ratio wants at that height,
 * centred on the front panel. At 9in tall that is 5.625in wide against a 6in
 * panel — so the crop sits comfortably inside the front cover and takes nothing
 * from the spine.
 */
const cropHIn = 9;
const cropWIn = cropHIn / (TARGET_H / TARGET_W);
const cropLeftIn = frontCentreIn - cropWIn / 2;
const cropTopIn = BLEED;

if (cropLeftIn < frontLeftIn - 0.001) {
  throw new Error(`crop would reach into the spine: ${cropLeftIn.toFixed(3)} < ${frontLeftIn.toFixed(3)}`);
}

const left = Math.round(cropLeftIn * pxPerIn);
const top = Math.round(cropTopIn * pxPerIn);
const width = Math.round(cropWIn * pxPerIn);
const height = Math.round(cropHIn * pxPerIn);

console.log(`source     : ${SRC} (${meta.width} x ${meta.height} px, ${pxPerIn.toFixed(1)} px/in)`);
console.log(`front panel: ${frontLeftIn.toFixed(3)} - ${frontRightIn.toFixed(3)} in`);
console.log(`crop       : ${cropWIn.toFixed(3)} x ${cropHIn} in at ${cropLeftIn.toFixed(3)}, ${cropTopIn} in`);
console.log(`           : ${width} x ${height} px -> ${TARGET_W} x ${TARGET_H}`);

const jpg = await sharp(SRC)
  .extract({ left, top, width, height })
  .resize(TARGET_W, TARGET_H, { fit: 'fill', kernel: 'lanczos3' })
  .toColourspace('srgb')
  .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
  .toBuffer();

writeFileSync(OUT, jpg);
const out = await sharp(jpg).metadata();
console.log(`\nfile   : ${OUT}`);
console.log(`pixels : ${out.width} x ${out.height}  space ${out.space}  channels ${out.channels}`);
console.log(`bytes  : ${jpg.length}`);
console.log(`sha256 : ${createHash('sha256').update(jpg).digest('hex')}`);
process.exit(0);
