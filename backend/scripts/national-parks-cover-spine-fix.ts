/**
 * COVER SPINE CORRECTION — carry the landscape through the spine.
 *
 * The approved artwork left the spine as a flat olive strip, because the cover
 * prompt asks for an EMPTY spine so code can set the type. Empty was read as
 * "blank field", and the result is a visible band where the photograph stops.
 *
 * This is an EDIT, not a regeneration. The composition is approved; only the
 * pixels inside the spine strip may change. Regenerating would produce a
 * different scene and throw away a cover that has already been signed off.
 *
 *   npx tsx scripts/national-parks-cover-spine-fix.ts <inPng> <outPng> --confirm
 */
import { readFileSync, writeFileSync } from 'node:fs';

await import('../src/env.js');

const IN = process.argv[2];
const OUT = process.argv[3];
if (!IN || !OUT) throw new Error('usage: national-parks-cover-spine-fix.ts <inPng> <outPng> --confirm');
if (!process.argv.includes('--confirm')) {
  console.error('REFUSING: this is a paid image edit. Re-run with --confirm.');
  process.exit(1);
}

/**
 * The spine's position on the MODEL's canvas, from the cover engine's own
 * geometry: back 5.8-49.1%, spine 49.1-50.9%, front 50.9-94.1%.
 */
const PROMPT = `EDIT THIS IMAGE. The attached image is an APPROVED, FINISHED book cover wrap. It is
not a draft and not a concept to reinterpret.

This is a SPINE BACKGROUND CORRECTION ONLY. Everything else is approved and stays.

────────────────────────────────────────────────────────────────
WHAT MUST NOT CHANGE — this is almost the whole job
────────────────────────────────────────────────────────────────
Preserve ALL of the following exactly as they appear, pixel for pixel:

  • the photographic canyon landscape on the BACK panel (left) and the FRONT
    panel (right), including every cliff, ridge, tree, road and cloud
  • the composition, framing, crop and aspect
  • the lighting, the low warm sun, the shadows, the colour treatment
  • the dark green title panel and every letter of the title and subtitle
  • the gold rule and the gold subtitle
  • the hiker on the rock ledge, the ledge, and the author panel with its type
  • every word of the back-cover copy, in the same position, size and face
  • the photorealism and level of detail

Do NOT add or remove any object. Do NOT restage, relight or reinterpret.
Do NOT change the crop. Do NOT "improve" anything.

────────────────────────────────────────────────────────────────
THE ONLY CHANGE — the vertical strip at the centre
────────────────────────────────────────────────────────────────
A narrow vertical strip runs down the centre of the image, from 49.1% to 50.9%
of the width, top edge to bottom edge. It is currently a FLAT, EVEN OLIVE-GREEN
BAND with no detail in it.

Replace that flat band with a natural CONTINUATION OF THE LANDSCAPE, so the
photograph runs unbroken from the back panel, through the strip, into the front
panel. Where the strip meets the back panel on its left and the front panel on
its right, the cliff lines, the treeline, the ridge horizon, the sky gradient and
the light must all MEET AND ALIGN, with no seam, no join, no edge and no change
of tone.

Treat it as a missing 1.8% slice of one continuous photograph, and paint back
what belongs there: the same forested canyon slope in the lower two thirds, the
same warm sky in the upper third.

Keep it QUIET. This slice becomes the spine of a physical book and type is
composited over it afterwards, so it should be ordinary background — canyon
slope and sky — with no bright highlight, no strong focal object, no dramatic
detail, and nothing a reader would try to look at. Do not stretch or distort a
recognisable subject into it.

────────────────────────────────────────────────────────────────
DELIBERATELY LEFT EMPTY — do not fill these
────────────────────────────────────────────────────────────────
Paint NO text, NO letters, NO words, NO numbers, NO logo, NO ornament, NO panel,
NO border and NO rule anywhere in that strip. The spine typography is composited
afterwards by the production system. This is intentional.

Also do NOT paint: a barcode, an ISBN, a price box, a publisher logo, crop marks,
registration marks, guides, labels or watermarks anywhere on the wrap.

────────────────────────────────────────────────────────────────
BEFORE YOU FINISH
────────────────────────────────────────────────────────────────
1. The back and front panels are identical to the attached image.
2. The flat olive band is gone; landscape runs through it unbroken.
3. The horizon, treeline and sky line up across both edges of the strip.
4. There is no lettering of any kind inside the strip.
5. The title, subtitle, author panel and back copy are untouched and correctly
   spelled.
6. No barcode, no logo, no guides, no watermark.`;

const source = readFileSync(IN);
console.log(`source : ${IN} (${source.length} bytes)`);
console.log('calling images.edit …\n');

const { generateImageFromBlueprint } = await import('../src/services/openai/openai.js');
const t0 = Date.now();
const result = await generateImageFromBlueprint({
  prompt: PROMPT,
  blueprintPng: source,
  size: '1536x1024',
});
writeFileSync(OUT, result.pngBuffer);
console.log(`edited in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`model  : ${result.model}`);
console.log(`pixels : ${result.widthPx} x ${result.heightPx}`);
console.log(`file   : ${OUT} (${result.pngBuffer.length} bytes)`);
process.exit(0);
