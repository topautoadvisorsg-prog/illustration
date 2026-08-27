/**
 * ONE EDIT ON THE APPROVED COVER ARTWORK, for the author name change.
 *
 * The OLD author (Tom Everett) was baked into the raster in two places, which is why a name change
 * needs an image pass at all:
 *
 *   FRONT  the author line, ink box x 1027-1352, y 892-938 on the 1536x1024
 *          artwork. It comes OUT entirely and the photograph is restored, so the
 *          name can be SET by the compositor afterwards and every future change
 *          is a command-line argument rather than a paid render.
 *   BACK   the bio opens "Tom Everett drove to Zion at twenty-seven...". Two
 *          words change. The rest of that paragraph must not move.
 *
 * Nothing else about the artwork changes. The title, subtitle, every other word
 * of the back copy, the photograph, the crop and the empty spine all stay.
 *
 *   npx tsx scripts/national-parks-author-art-edit.ts --prompt
 *   npx tsx scripts/national-parks-author-art-edit.ts --generate --confirm
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'C:/Users/jovan/Downloads/7-NATIONAL-PARKS-COVER-EDIT/APPROVED-ART.png';
const OUT = 'C:/Users/jovan/Downloads/7-NATIONAL-PARKS-COVER-EDIT/APPROVED-ART_WES-DENMAN.png';

const PROMPT = [
  'The attached image is a finished book cover wrap. Make exactly TWO changes to it and nothing else.',
  '',
  'CHANGE 1 — DELETE THE AUTHOR NAME FROM THE FRONT COVER.',
  '  The front cover is the RIGHT-HAND panel. Near the bottom of it, over the sunlit rock, the name',
  '  "Tom Everett" is set in large cream serif capitals and lower case.',
  '  Remove that lettering COMPLETELY and restore the photograph underneath it: continue the rock, its',
  '  texture, its shadows and the light across it exactly as the surrounding picture does, so the area',
  '  looks as though no text was ever painted there.',
  '  Do NOT replace it with another name. Do NOT leave a smudge, a blur, a patch, a lighter rectangle,',
  '  a shadow of the letters, or a clean flat area. That part of the cover becomes plain photograph.',
  '',
  'CHANGE 2 — CORRECT ONE NAME IN THE BACK-COVER TEXT.',
  '  The back cover is the LEFT-HAND panel. Its final paragraph currently begins:',
  '      "Tom Everett drove to Zion at twenty-seven with no plan..."',
  '  Change those two words so it reads:',
  '      "Wes Denman drove to Zion at twenty-seven with no plan..."',
  '  Spelling exactly: W-e-s D-e-n-m-a-n.',
  '  Keep the same typeface, size, colour, line breaks and justification. Every other word of that',
  '  paragraph, and every other line on the back cover, stays exactly where it is.',
  '',
  'CHANGE NOTHING ELSE ANYWHERE. Same photograph, same canyon, same cliffs, same sky, same hiker, same',
  'light, same colours, same crop. The title and the subtitle on the front are already correct: do not',
  're-set, re-size or move them. The opening paragraph, the "INSIDE THIS VOLUME" heading and all five',
  'bullet points on the back cover are already correct: do not re-set or re-flow any of them.',
  'The narrow vertical strip between the two covers stays empty artwork with no lettering.',
  'Do NOT add a barcode, an ISBN, a price box, a logo, a panel or a border.',
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
