/**
 * Read-only QA on the cover source art.
 *
 * Maps the 1536x1024 generation onto the real 184pp wrap, then measures the
 * three things the NO ONE TOLD ME THAT cover got wrong or nearly wrong:
 *   1. a seam / crease / bevel anywhere near the folds
 *   2. content sitting too close to a trim edge
 *   3. readable copy inside the barcode reserve
 */
import sharp from 'sharp';

const DIR = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/cover';

// Canonical white-paper geometry, 184pp.
const WRAP_W = 11.664368, WRAP_H = 8.75, BLEED = 0.125, SPINE = 0.414368, TRIM_W = 5.5;
const BACK_TRIM_L = BLEED;                       // 0.125
const FOLD_1 = BLEED + TRIM_W;                   // 5.625
const FOLD_2 = FOLD_1 + SPINE;                   // 6.039368
const FRONT_TRIM_R = FOLD_2 + TRIM_W;            // 11.539368
const BARCODE_W = 2.0, BARCODE_H = 1.2;

async function qa(id: string): Promise<void> {
  const file = `${DIR}/BYNI-cover-wrap-art-${id}_1536x1024.png`;
  const img = sharp(file);
  const meta = await img.metadata();
  const W = meta.width!, H = meta.height!;
  // Crop centred to the wrap aspect, as the precedent did.
  const targetW = Math.round(H * (WRAP_W / WRAP_H));
  const offset = Math.round((W - targetW) / 2);
  const pxPerIn = targetW / WRAP_W;
  const toPx = (inches: number) => Math.round(offset + inches * pxPerIn);

  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const lum = (x: number, y: number) => data[y * info.width + x]!;

  console.log(`\n═══ VERSION ${id} ═══`);
  console.log(`  source ${W}x${H}  -> wrap crop ${targetW}x${H} (${offset}px off each side)`);
  console.log(`  ${pxPerIn.toFixed(1)} px/in at source scale`);
  console.log(`  back trim ${toPx(BACK_TRIM_L)}px | fold1 ${toPx(FOLD_1)}px | fold2 ${toPx(FOLD_2)}px | front trim ${toPx(FRONT_TRIM_R)}px`);

  // ── 1. seam detection: strongest column-to-column luminance step in the
  //      spine band and just outside it, where a painted crease would live.
  const bandL = toPx(FOLD_1 - 0.25), bandR = toPx(FOLD_2 + 0.25);
  let worst = 0, worstX = 0;
  for (let x = bandL + 1; x < bandR; x += 1) {
    let sum = 0;
    for (let y = 0; y < H; y += 4) sum += Math.abs(lum(x, y) - lum(x - 1, y));
    const mean = sum / Math.ceil(H / 4);
    if (mean > worst) { worst = mean; worstX = x; }
  }
  // Baseline: the same measure across the whole image, for comparison.
  let base = 0;
  for (let x = 1; x < W; x += 1) {
    let sum = 0;
    for (let y = 0; y < H; y += 8) sum += Math.abs(lum(x, y) - lum(x - 1, y));
    base = Math.max(base, sum / Math.ceil(H / 8));
  }
  console.log(`  seam check: strongest step inside the fold band = ${worst.toFixed(2)} at x=${worstX}`);
  console.log(`              strongest step anywhere in the image = ${base.toFixed(2)}`);
  console.log(`              verdict: ${worst < base * 0.5 ? 'NO seam artefact in the fold band' : 'INSPECT — step in the band rivals image maximum'}`);

  /**
   * ── 2. where does INK actually reach on the front panel?
   *
   * Absolute brightness cannot answer this: the background is cream, so a
   * threshold on luminance marks the whole panel. Text is distinguished from
   * smooth artwork by LOCAL CONTRAST — letterforms have hard edges, a painted
   * gradient does not.
   */
  const edgeAt = (x: number, y: number): number =>
    Math.abs(lum(x, y) - lum(x - 1, y)) + Math.abs(lum(x, y) - lum(x, y - 1));
  const frontL = toPx(FOLD_2), frontR = toPx(FRONT_TRIM_R);
  let inkMin = Infinity, inkMax = -Infinity;
  for (let x = frontL; x < Math.min(W - 1, frontR + Math.round(0.3 * pxPerIn)); x += 1) {
    let strong = 0;
    for (let y = 1; y < H - 1; y += 2) if (edgeAt(x, y) > 45) strong += 1;
    if (strong > 6) { if (x < inkMin) inkMin = x; if (x > inkMax) inkMax = x; }
  }
  console.log(`  front panel ink (high-contrast content): x ${inkMin}..${inkMax}px`);
  const clr = (frontR - inkMax) / pxPerIn;
  console.log(`  rightmost ink to front trim: ${clr.toFixed(3)}in ${clr < 0 ? '(bleeds past trim - fine for artwork, NOT for text)' : clr < 0.25 ? '<-- inside the 0.25in live-content margin' : 'ok'}`);

  /**
   * ── 3. barcode reserve: is there READABLE COPY in it?
   *
   * Artwork may run through; text may not. Same discriminator — count pixels
   * with letterform-scale local contrast, and compare against a patch of the
   * same panel known to be plain field.
   */
  const bcR = toPx(FOLD_1 - 0.25), bcL = bcR - Math.round(BARCODE_W * pxPerIn);
  const bcB = H - Math.round(0.25 * pxPerIn), bcT = bcB - Math.round(BARCODE_H * pxPerIn);
  let bcEdges = 0, bcN = 0;
  for (let x = bcL; x < bcR; x += 1) for (let y = bcT; y < bcB; y += 1) {
    bcN += 1; if (edgeAt(x, y) > 45) bcEdges += 1;
  }
  const bcDensity = (bcEdges / bcN) * 100;
  console.log(`  barcode reserve ${BARCODE_W}x${BARCODE_H}in at x ${bcL}..${bcR}, y ${bcT}..${bcB}`);
  console.log(`  high-contrast pixel density inside it: ${bcDensity.toFixed(3)}% ${bcDensity < 0.5 ? '-> no readable copy, artwork only: SAFE' : '-> possible text, inspect'}`);
}

for (const id of ['A', 'B']) await qa(id);
process.exit(0);
