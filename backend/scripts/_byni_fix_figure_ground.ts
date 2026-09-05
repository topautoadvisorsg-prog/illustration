/**
 * BEFORE YOU NEED IT — flatten the figure grounds to pure white.
 *
 * THE BUG THIS REPAIRS. `_byni_stage_figures.ts` claimed to knock the generated
 * near-white ground to 255 and did not: its operation was `.linear(1, 0)`,
 * which multiplies by one and adds zero. A no-op with a docstring. Four of the
 * five figures shipped with a 253-254 ground, which prints as a faint grey
 * panel floating on the page -- the exact defect the docstring named.
 *
 * WHITE POINT AT 250, chosen from the histograms rather than by eye. The
 * 250-254 band is 70-90% of each figure: that is the ground. The 240-249 band
 * is 2-3.5%: antialiasing at the edge of the linework. Designed light-grey
 * fills sit below 240 and are 1% or less. Mapping 250 -> 255 on a straight line
 * through the origin therefore flattens the ground, barely touches the
 * antialiasing, and leaves the drawing's tonal structure intact.
 *
 * The menstrual cycle is skipped: the Real-ESRGAN upscale already normalised it
 * to a 255 ground, and it is the one figure whose source is not recoverable by
 * re-staging.
 *
 *   yarn tsx scripts/_byni_fix_figure_ground.ts
 *
 * Local and free. Every file is backed up before it is touched.
 */
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { OUT_DIR } from './before-you-need-it-config.js';

const DIR = `${OUT_DIR}/figures`;
const FIX = ['ch03-breast-bud', 'ch03-bra-types', 'ch06-three-openings', 'ch09-tampon-angle'];
const WHITE_POINT = 250;

for (const id of FIX) {
  const f = `${DIR}/${id}.png`;
  const backup = `${DIR}/_grey-ground-${id}.png`;
  if (!existsSync(backup)) copyFileSync(f, backup);
  const before = await sharp(backup).greyscale().raw().toBuffer();
  const out = await sharp(backup)
    .greyscale()
    .linear(255 / WHITE_POINT, 0)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(f, out);
  const after = await sharp(out).greyscale().raw().toBuffer();
  const pct = (b: Buffer, lo: number, hi: number) => {
    let n = 0;
    for (const v of b) if (v >= lo && v <= hi) n++;
    return ((n / b.length) * 100).toFixed(1);
  };
  console.log(
    `${id.padEnd(22)} pure-white ${pct(before, 255, 255)}% -> ${pct(after, 255, 255)}%   ` +
      `ink (<200) ${pct(before, 0, 199)}% -> ${pct(after, 0, 199)}%   sha ${createHash('sha256').update(out).digest('hex').slice(0, 12)}…`,
  );
}
console.log(`\nch06-menstrual-cycle skipped: already a 255 ground after the upscale.`);
console.log('Originals kept as _grey-ground-*.png.');
process.exit(0);
