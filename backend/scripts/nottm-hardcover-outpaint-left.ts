/*
 * NO ONE TOLD ME THAT — hardcover left turn-in outpaint.
 *
 * ONE paid gpt-image edit call. Extends the approved wrap artwork leftward into
 * the 0.591in hardcover turn-in so the composition notebook continues naturally
 * instead of being cut at the fold.
 *
 * The mask holds every pixel of the approved artwork. The caller composites the
 * approved raster back on top regardless, per the wrapper's own warning that a
 * mask constrains the request and never guarantees the response.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateImageFromBlueprint } from '../src/services/openai/openai.js';

const DIR = 'C:/Users/jovan/Downloads/NO_ONE_TOLD_ME_THAT_KDP/_hardcover-candidate';

const PROMPT = `Extend the supplied book-cover artwork naturally beyond its existing outer edges for hardcover wrap/turn-in. Preserve the existing image exactly. Continue any objects that intersect an edge naturally, including the composition notebook on the back cover. Preserve the same blue background and orange lower band. Do not duplicate, mirror, move, redesign, or replace any existing object. Do not add new objects or text. Generate only the missing continuation outside the original artwork.`;

const base = readFileSync(join(DIR, 'OUTPAINT_left_base.png'));
const mask = readFileSync(join(DIR, 'OUTPAINT_left_mask.png'));

console.log('gpt-image EDIT — left turn-in outpaint (PAID, ~$0.05, one shot, no retry) …');
const out = await generateImageFromBlueprint({
  prompt: PROMPT,
  blueprintPng: base,
  maskPng: mask,
  size: '1024x1536',
});
writeFileSync(join(DIR, 'OUTPAINT_left_result.png'), out.pngBuffer);
console.log(`DONE  model=${out.model} size=${out.size} bytes=${out.pngBuffer.length}`);
process.exit(0);
