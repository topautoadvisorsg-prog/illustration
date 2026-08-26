/**
 * ONE INSTRUCTION: lift the back-cover copy clear of the barcode.
 *
 * The panel removal already landed, so this works on the EDITED artwork rather
 * than starting again. A single-purpose edit is far likelier to hold than a
 * three-part one, and there is nothing else left to change.
 *
 * THE NUMBER IS DERIVED, not chosen. The wrap is 9.25in tall and KDP's barcode
 * reserve begins 7.675in down it, which is 83.0% of the height. Fitting a
 * 1536x1024 artwork to that wrap shifts content down slightly, so the last line
 * of copy has to finish by about 81% of the ARTWORK's height to land above the
 * reserve. It currently finishes at 87.7%, which is why the compositor refused
 * to write the cover. Asking for 75% leaves the margin the model's imprecision
 * needs.
 *
 *   npx tsx scripts/national-parks-cover-art-raise-copy.ts --prompt
 *   npx tsx scripts/national-parks-cover-art-raise-copy.ts --generate --confirm
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'C:/Users/jovan/Downloads/_np_build/cover-art-edited.png';
const OUT = 'C:/Users/jovan/Downloads/_np_build/cover-art-final.png';

const PROMPT = [
  'The attached image is a finished book cover wrap. Change ONE thing about it.',
  '',
  'THE BACK COVER IS THE LEFT PANEL. Its block of text currently runs too far down the page: the last line sits about',
  '88% of the way down the image. A barcode is printed over the lower part of that panel and destroys any words',
  'underneath it.',
  '',
  'MOVE THE WHOLE BACK-COVER TEXT BLOCK UP, and set it a little smaller and tighter, so that the LAST LINE of the',
  'closing paragraph finishes by 75% of the image height. Measured from the top of the image, every word of back-cover',
  'text must sit in the top three quarters. The bottom quarter of the back cover must contain NO text at all.',
  '',
  'Keep every word exactly as written, in the same order, same wording, same style, same cream lettering, same left',
  'alignment, same left margin. The paragraph, the heading and the five bullet points all stay. Only the size and the',
  'vertical position change.',
  '',
  'CHANGE NOTHING ELSE. Same photograph, same canyon, same cliffs, same sky, same hiker, same light, same colours,',
  'same crop. The front cover is already correct: leave the title, the subtitle and the empty lower area exactly as',
  'they are, and do not add an author name. The spine strip stays empty.',
  '',
  'The bottom quarter of the back cover is ARTWORK at full bleed. Continue the photograph through it normally.',
  'Do NOT blank it, lighten it, fade it, flatten it, or leave a box, plate, panel or clear area there.',
  'Do NOT add a barcode, an ISBN, a price box, a logo, a border or any panel behind any text.',
].join('\n');

const argv = process.argv.slice(2);
if (argv.includes('--prompt')) {
  console.log(PROMPT);
  process.exit(0);
}
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
