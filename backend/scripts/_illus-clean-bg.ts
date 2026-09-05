/**
 * Drop the near-white ground out of each illustration.
 *
 * gpt-image-2 returns a background around 253-254, not 255. Stamped onto a pure
 * white page that prints as a faint grey panel around the art — a box the design
 * never asked for. Anything at 246 or above becomes fully transparent, so the
 * paper shows through and there is no edge at any paper shade. Line work and the
 * flat grey fills sit far below that threshold and are untouched.
 */
import sharp from 'sharp';
import { readdirSync, renameSync, existsSync } from 'node:fs';
const D = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/illustrations';
const CUT = 246;
for (const f of readdirSync(D).filter((x) => x.endsWith('.png') && !x.startsWith('_'))) {
  const raw = `${D}/_raw-${f}`;
  if (!existsSync(raw)) renameSync(`${D}/${f}`, raw);
  const { data, info } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let cleared = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i]! >= CUT && data[i + 1]! >= CUT && data[i + 2]! >= CUT) { data[i + 3] = 0; cleared += 1; }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png().toFile(`${D}/${f}`);
  console.log(`${f.padEnd(34)} ${((cleared / (info.width * info.height)) * 100).toFixed(1)}% of pixels made transparent`);
}
process.exit(0);
