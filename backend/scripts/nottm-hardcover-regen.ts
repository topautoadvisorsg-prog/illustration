/*
 * NO ONE TOLD ME THAT — hardcover art regeneration.
 *
 * ONE paid gpt-image edit call. Sends the APPROVED paperback raster and asks for
 * the same cover reproduced at hardcover proportions. No mask: this is a full
 * reproduction, by operator instruction.
 *
 * Output is 1536x1024; the caller centre-crops to 1362x1024 (aspect 1.3301,
 * the hardcover's 13.189/9.917 = 1.3299) and upscales to 300 dpi. That is the
 * same crop-then-upscale lineage the approved paperback itself came through.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateImageFromBlueprint } from '../src/services/openai/openai.js';

const DIR = 'C:/Users/jovan/Downloads/NO_ONE_TOLD_ME_THAT_KDP';

const PROMPT = `Reproduce this exact book-cover artwork, unchanged, at the new wider proportions.

Everything must stay identical: the same composition, the same objects in the same relative positions, the same colours, the same blue background, the same orange lower band, the same layout.

TEXT IS CRITICAL. Reproduce every word exactly as it appears, character for character, with the same typography, the same sizes and the same positions. Do not rewrite, reword, shorten, paraphrase, drop or invent any text anywhere on the cover.

Do not redesign. Do not move, resize, duplicate, mirror or replace any object. Do not add or remove objects. Do not turn this into a photograph of a physical book, and do not draw board edges, hinges, grooves or shadows. It is flat artwork.

Only the outer proportions change: extend the existing background and the existing scene naturally to fill the wider canvas.`;

const art = readFileSync(join(DIR, '_cover-repair', 'cover_art_repaired.png'));

console.log('gpt-image EDIT — full hardcover reproduction (PAID, ~$0.05, one shot, no retry) …');
const out = await generateImageFromBlueprint({
  prompt: PROMPT,
  blueprintPng: art,
  size: '1536x1024',
});
writeFileSync(join(DIR, '_hardcover-candidate', 'REGEN_hardcover_raw.png'), out.pngBuffer);
console.log(`DONE  model=${out.model} size=${out.size} bytes=${out.pngBuffer.length}`);
process.exit(0);
