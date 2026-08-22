/**
 * THE CLEAN WRAP SOURCE THE KINDLE COVER IS CUT FROM.
 *
 * The Kindle cover is cropped out of the paperback wrap so the ebook and the
 * print editions are unmistakably the same book. It is NOT cropped out of the
 * shipped cover PDF, for two reasons:
 *
 *   1. The proof PNG beside that PDF is 1600px on its long edge. Cropping a
 *      6in-wide panel out of it and resizing back up to 1600 x 2560 gave a
 *      visibly soft cover.
 *   2. The frozen paperback wrap carries a mild smear at the very top, left over
 *      from an early sky stretch that filled the last of the bleed by blowing up
 *      40 rows of pixels. The paperback is approved and frozen, so that stays —
 *      but there is no reason to inherit it in a new file.
 *
 * So this rebuilds the wrap at full print resolution from the SAME approved
 * artwork and the SAME scale and crop as the printed cover, changing one thing:
 * the sky is extended by stretching a tall band gently rather than a thin one
 * hard. Same picture, no smear.
 *
 * It writes a PNG/JPEG only. It never touches the cover PDF.
 *
 *   npx tsx scripts/national-parks-kindle-cover-source.ts <outJpg>
 *
 * Then feed the result to national-parks-kindle-cover.ts, which does the crop.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: national-parks-kindle-cover-source.ts <outJpg>');

/**
 * The approved wrap artwork, as stored for this project.
 *
 * `backend/storage` is the local-disk storage root as the app writes it, and the
 * app runs with the repository root as its working directory even though the
 * folder sits inside `backend/`. Run this script from `backend/` — the same
 * place every other operator script here is run from — and the path resolves.
 */
const ART = path.join(
  'backend',
  'storage',
  '92c4ab36-4956-4435-b656-d2679fbc73d9',
  'cover',
  'cover-wrap-art-v2-spine.png',
);

const DPI = 300;
const WRAP_W = 12.511232;
const WRAP_H = 9.25;
const W = Math.round(WRAP_W * DPI);
const H = Math.round(WRAP_H * DPI);

/**
 * The scale and crop that put the back-cover copy safely inside trim on the
 * printed wrap. Reused verbatim — a different scale here would be a different
 * picture from the one on the paperback.
 */
const SCALE = 2.5153;

const meta = await sharp(ART).metadata();
const sw = Math.round(meta.width! * SCALE);
const sh = Math.round(meta.height! * SCALE);
const crop = Math.round((sw - W) / 2);
const stretch = H - sh;
if (stretch < 0) throw new Error(`art is already taller than the wrap by ${-stretch}px — check SCALE`);

const body = await sharp(ART)
  .resize(sw, sh, { kernel: 'lanczos3' })
  .extract({ left: crop, top: 0, width: W, height: sh })
  .toBuffer();

/**
 * Extend the sky by stretching the TOP HALF of the image by a few per cent,
 * rather than the top 40 rows by several hundred. Sky is a smooth gradient, so a
 * gentle stretch across a tall band is invisible; a hard stretch of a thin band
 * smears whatever texture those rows happened to contain.
 */
const band = Math.round(sh * 0.5);
const jpg = await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
  .composite([
    {
      input: await sharp(body)
        .extract({ left: 0, top: 0, width: W, height: band })
        .resize(W, band + stretch, { fit: 'fill', kernel: 'lanczos3' })
        .toBuffer(),
      left: 0,
      top: 0,
    },
    {
      input: await sharp(body).extract({ left: 0, top: band, width: W, height: sh - band }).toBuffer(),
      left: 0,
      top: band + stretch,
    },
  ])
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toBuffer();

writeFileSync(OUT, jpg);
console.log(`art    : ${ART} (${meta.width} x ${meta.height})`);
console.log(`wrap   : ${W} x ${H} px at ${DPI} DPI (${WRAP_W} x ${WRAP_H} in)`);
console.log(
  `stretch: ${(stretch / DPI).toFixed(3)} in over a ${(band / DPI).toFixed(2)} in band ` +
    `(${((stretch / band) * 100).toFixed(0)}% — gentle, no smear)`,
);
console.log(`file   : ${OUT} (${(jpg.length / 1048576).toFixed(2)} MB)`);
process.exit(0);
