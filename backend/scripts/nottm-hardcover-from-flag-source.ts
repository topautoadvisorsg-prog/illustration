/*
 * NO ONE TOLD ME THAT — hardcover art plate from the proven FLAG source.
 *
 * Reference image: _cover-preserved/cover-wrap-art-v2_CURRENT_1536x1024.png
 * (sha 03aa1ef7...), proven to be the AI original behind the approved FLAG
 * paperback #15 (sha 71426aaf...) — 96% of columns reconstruct at RMS 2.04.
 *
 * ONE paid gpt-image call. Output 1536x1024, centre-cropped by the caller to
 * 1362x1024 = the hardcover's 13.189/9.917 aspect.
 *
 * Margin arithmetic baked into the prompt: the centre crop removes 5.7% of the
 * width per side and the board wrap then hides a further 4.5% horizontally /
 * 6.0% vertically. Anything closer than ~10% to a side edge, or ~7% to the top
 * or bottom, is lost. The previous attempt composed edge-to-edge and the board
 * sliced the back copy and the title.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateImageFromBlueprint } from '../src/services/openai/openai.js';

const K = 'C:/Users/jovan/Downloads/NO_ONE_TOLD_ME_THAT_KDP';

const PROMPT = `Recreate the supplied approved paperback cover artwork as a hardcover-wrap artwork plate, preserving the same visual identity, composition, objects, colours and illustration style. This is the same book and must clearly match the paperback edition.

PRESERVE, exactly once each and in the same relative arrangement: the orange pennant flag on its pole beside the phone; one composition notebook with its marbled black-and-white cover; the loose lined sheet behind it; the blank sticky note; the headphones; the combination padlock with its two orange lightning bolts; the thermos; the boxed razor; the blue high-top sneaker; the phone; the audio waveform; the deep blue background; and the orange band across the bottom.

Do not mirror, duplicate, stretch, smear, amputate or clone any object. Do not create a second notebook. Do not create blue filler strips beside foreground objects. Do not invent new objects. Do not draw board edges, hinges, grooves, page blocks or shadows — this is flat artwork, not a photograph of a physical book.

TEXT: reproduce every word exactly as it appears, character for character, with the same typography and the same relative positions — the title, the subtitle inside its rounded box, the back-cover paragraphs, the INSIDE THIS VOLUME heading and its bulleted lines, and the author name on the orange band. Do not rewrite, reword, shorten or invent any text.

LEAVE THE SPINE CLEAN: the vertical strip down the centre of the wrap must be a plain flat blue field with NO lettering on it at all. Spine type is set separately afterwards.

CRITICAL MARGIN REQUIREMENT: this plate wraps a hard board, and roughly a tenth of the image is folded out of sight around the edges. Keep ALL text and ALL objects well inside the frame — no text or object may come closer to the left or right edge than 10% of the image width, or closer to the top or bottom than 7% of the image height. Those outer margins must contain nothing but plain background: blue at the top and sides, the orange band continuing at the bottom. The composition should sit comfortably inset with generous background around it, not run edge to edge.`;

const art = readFileSync(join(K, '_cover-preserved', 'cover-wrap-art-v2_CURRENT_1536x1024.png'));

console.log('gpt-image EDIT — hardcover plate from the FLAG source (PAID, ~$0.05, one shot) …');
const out = await generateImageFromBlueprint({
  prompt: PROMPT,
  blueprintPng: art,
  size: '1536x1024',
});
writeFileSync(join(K, '_hardcover-candidate', 'FLAGSRC_hardcover_raw.png'), out.pngBuffer);
console.log(`DONE  model=${out.model} size=${out.size} bytes=${out.pngBuffer.length}`);
process.exit(0);
