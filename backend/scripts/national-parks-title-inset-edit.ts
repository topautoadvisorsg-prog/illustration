/**
 * ONE EDIT: pull the front title block in from the right edge.
 *
 * The approved artwork was composed for a PAPERBACK wrap, where the trim falls
 * 0.125in outside the panel. A HARDCOVER board is 6.197 x 9.236in -- larger than
 * the 6 x 9 trim -- and takes a further 0.591in of wrap-around on every edge, so
 * it eats margin the paperback never asked for.
 *
 * Measured, not guessed: with the compositor cropping ZERO from the sides, which
 * is the absolute limit, the painted title still cleared the hardcover board by
 * only 0.060in against KDP's 0.25in live margin. No scale or crop can fix that,
 * because the margin is not in the source image. The title's right edge sits at
 * 95.4% of the artwork width and has to reach about 92%.
 *
 * So the block moves once, in the artwork, and every binding is built from the
 * result. Nothing else changes.
 *
 *   npx tsx scripts/national-parks-title-inset-edit.ts --prompt
 *   npx tsx scripts/national-parks-title-inset-edit.ts --generate --confirm
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'C:/Users/jovan/Downloads/7-NATIONAL-PARKS-COVER-EDIT/APPROVED-ART_WES-DENMAN.png';
const OUT = 'C:/Users/jovan/Downloads/7-NATIONAL-PARKS-COVER-EDIT/APPROVED-ART_TITLE-INSET.png';

const PROMPT = [
  'The attached image is a finished book cover wrap. Make ONE change and nothing else.',
  '',
  'MOVE THE FRONT TITLE BLOCK IN FROM THE RIGHT EDGE.',
  '  The front cover is the RIGHT-HAND panel. Its title reads "7 NATIONAL PARKS WITHOUT THE ROOKIE',
  '  MISTAKES" in large cream capitals, with a gold rule under it and a two-line gold subtitle beneath.',
  '',
  '  Right now the longest title lines reach about 95% of the way across the whole image. They must',
  '  finish by 92%. Move the ENTIRE block -- title, gold rule and subtitle together, as one unit --',
  '  toward the middle of the image, and set it very slightly smaller if that is what it takes to reach',
  '  92%. Keep it centred on the front panel: take the space off the right and leave a matching gap on',
  '  the left, so the block still looks centred over that panel.',
  '',
  '  Keep every word exactly as written, on the same line breaks, in the same typeface, the same cream',
  '  and gold colouring, the same gold rule between title and subtitle, and the same vertical position.',
  '  This is a horizontal move and a small size change, nothing else.',
  '',
  'CHANGE NOTHING ELSE ANYWHERE. Same photograph, same canyon, same cliffs, same sky, same hiker on the',
  'same rock, same sunset light, same colours, same crop, same framing.',
  'The BACK cover -- the left-hand panel -- is finished and correct: do not re-set, re-flow, move or',
  'restyle its opening paragraph, its "INSIDE THIS VOLUME" heading, any of its five bullet points, or',
  'the closing paragraph that begins "Wes Denman drove to Zion".',
  'Paint NO author name on the front cover: that area stays clean photograph, and the name is set',
  'afterwards by the typesetting system.',
  'The narrow vertical strip between the two covers stays empty artwork with no lettering.',
  'Do NOT add a barcode, an ISBN, a price box, a logo, a panel, a border or any tinted shape.',
].join('\n');

const argv = process.argv.slice(2);
if (argv.includes('--prompt')) { console.log(PROMPT); process.exit(0); }
if (!argv.includes('--generate')) throw new Error('pass --prompt or --generate --confirm');
if (!argv.includes('--confirm')) {
  console.error('REFUSING: --generate produces one paid image, about $0.05. Re-run with --confirm.');
  process.exit(1);
}

await import('../src/env.js');
const { generateImageFromBlueprint } = await import('../src/services/openai/openai.js');
const t0 = Date.now();
const result = await generateImageFromBlueprint({
  prompt: PROMPT,
  blueprintPng: readFileSync(SOURCE),
  size: '1536x1024',
});
writeFileSync(OUT, result.pngBuffer);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${result.widthPx} x ${result.heightPx}  ->  ${OUT}`);
process.exit(0);
