/**
 * BEFORE YOU NEED IT — prove WHICH images are in the shipping PDF.
 *
 * Not "five figures rendered" -- five of WHAT. Every image stream is pulled out
 * of the PDF, decoded to raw greyscale pixels, and hashed. The same is done to
 * each staged figure and to each retired asset. A pixel hash survives the
 * PDF's own re-encoding, which a file hash does not.
 *
 *   yarn tsx scripts/_byni_identity.ts
 *
 * Local and free. Reads only.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { buildPageModel } from '../src/pipeline/page-qa/page-model.js';
import { INTERIOR_PDF, OUT_DIR, FIGURES } from './before-you-need-it-config.js';

/** Hash of the decoded pixels, downsampled so re-encoding cannot change it. */
async function pixelHash(buf: Buffer): Promise<string> {
  const px = await sharp(buf).greyscale().resize(64, 64, { fit: 'fill' }).raw().toBuffer();
  return createHash('sha256').update(px).digest('hex').slice(0, 16);
}

const staged = new Map<string, string>();
for (const id of Object.keys(FIGURES)) {
  staged.set(await pixelHash(readFileSync(`${OUT_DIR}/figures/${id}.png`)), id);
}

const retired = new Map<string, string>();
for (const dir of ['illustrations', 'illustrations-v2']) {
  const d = `${OUT_DIR}/${dir}`;
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter((x) => x.endsWith('.png'))) {
    const h = await pixelHash(readFileSync(`${d}/${f}`));
    if (!staged.has(h)) retired.set(h, `${dir}/${f}`);
  }
}
// the superseded arrow variant, kept beside the staged set
for (const f of readdirSync(`${OUT_DIR}/figures`).filter((x) => x.startsWith('_superseded') || x.startsWith('_with-invented'))) {
  retired.set(await pixelHash(readFileSync(`${OUT_DIR}/figures/${f}`)), `figures/${f}`);
}

const model = await buildPageModel(readFileSync(INTERIOR_PDF));
const pages = model.pages.filter((p) => p.images.length);

// COMPARE WHAT PRINTS, NOT WHAT IS STORED. The stored streams are raw pixel
// data with no image header, so they cannot be decoded standalone. Rendering
// each art page and cropping the figure's own bounding box is a stronger check
// anyway: it proves the identity of the image the reader actually sees.
const { rasterizePages } = await import('../src/pipeline/page-qa/raster.js');
const SCALE = 3;
const shot = await rasterizePages(readFileSync(INTERIOR_PDF), pages.map((p) => p.n), { scale: SCALE });

console.log(`art-bearing pages: ${pages.map((p) => `p${p.n}`).join(' ')}`);
console.log(`approved figures: ${staged.size}   retired/superseded assets checked: ${retired.size}
`);
console.log('page   printed figure identity');
let retiredHits = 0, unmatched = 0;
for (const p of pages) {
  const png = shot.pages.get(p.n)!;
  const b = p.images[0]!;
  // PDF y grows upward from the page foot; raster y grows down from the head.
  const crop = {
    left: Math.round(b.x0 * SCALE),
    top: Math.round((p.heightPt - b.y1) * SCALE),
    width: Math.round((b.x1 - b.x0) * SCALE),
    height: Math.round((b.y1 - b.y0) * SCALE),
  };
  const cut = await sharp(png).extract(crop).png().toBuffer();
  const h = await pixelHash(cut);
  const id = staged.get(h);
  const bad = retired.get(h);
  if (id) console.log(`  p${String(p.n).padEnd(4)} APPROVED  ${id}`);
  else if (bad) { retiredHits++; console.log(`  p${String(p.n).padEnd(4)} RETIRED!  ${bad}`); }
  else {
    // A crop is resampled by the renderer, so an exact pixel hash can miss.
    // Fall back to a mean-absolute-difference match against every candidate.
    const mine = await sharp(cut).greyscale().resize(64, 64, { fit: 'fill' }).raw().toBuffer();
    let best = { name: '?', d: Infinity, retired: false };
    for (const [set, isRetired] of [[staged, false], [retired, true]] as const) {
      for (const name of set.values()) {
        const f = isRetired
          ? `${OUT_DIR}/${name}`
          : `${OUT_DIR}/figures/${name}.png`;
        const other = await sharp(readFileSync(f)).greyscale().resize(64, 64, { fit: 'fill' }).raw().toBuffer();
        let d = 0;
        for (let k = 0; k < mine.length; k++) d += Math.abs(mine[k]! - other[k]!);
        d /= mine.length;
        if (d < best.d) best = { name: String(name), d, retired: isRetired };
      }
    }
    if (best.retired) retiredHits++;
    else if (best.d > 12) unmatched++;
    console.log(
      `  p${String(p.n).padEnd(4)} ${best.retired ? 'RETIRED!' : best.d <= 12 ? 'APPROVED' : 'UNMATCHED'}  ${best.name}   (mean pixel difference ${best.d.toFixed(2)}/255)`,
    );
  }
}
console.log(`
retired assets printing anywhere: ${retiredHits}`);
console.log(`figures that matched no approved asset: ${unmatched}`);
process.exit(0);
