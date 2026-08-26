/**
 * ONE WORD. The raise-the-copy edit came back with "ccol" where the manuscript
 * says "cool", in the third line of the back-cover blurb. Every other word on
 * the cover was checked, letter by letter, and is correct.
 *
 * A model editing a page of set type can corrupt a word it was not asked to
 * touch, which is exactly what happened, so this asks for the smallest possible
 * change and the whole block is re-read afterwards.
 *
 *   npx tsx scripts/national-parks-cover-art-spellfix.ts --generate --confirm
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'C:/Users/jovan/Downloads/_np_build/cover-art-final.png';
const OUT = 'C:/Users/jovan/Downloads/_np_build/cover-art-final2.png';

const PROMPT = [
  'The attached image is a finished book cover. There is ONE spelling mistake in it. Correct that one word and',
  'change absolutely nothing else.',
  '',
  'On the BACK COVER, which is the left panel, the third line of the opening paragraph currently reads:',
  '    "book is quiet, ccol and yours for about two hours"',
  'The word "ccol" is wrong. It must read "cool".',
  '',
  'Correct that single word to "cool". Keep the same typeface, the same size, the same colour, the same line break',
  'and the same justification, so the line reads:',
  '    "book is quiet, cool and yours for about two hours"',
  '',
  'CHANGE NOTHING ELSE ANYWHERE. Every other word of the back cover, the title, the subtitle, the photograph, the',
  'canyon, the sky, the hiker, the light, the colours, the crop, the composition and the empty spine all stay exactly',
  'as they are. Do not re-set, re-flow, re-size or move any other text. Do not add an author name. Do not add a panel,',
  'a box, a barcode or a logo. Do not touch the lower quarter of the back cover, which is photograph only.',
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
