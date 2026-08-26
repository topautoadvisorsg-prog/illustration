/**
 * EDIT THE APPROVED COVER ARTWORK. Same picture, three changes.
 *
 * The cover is settled. Twice now it has been REGENERATED from a prompt when
 * what was wanted was an edit of the existing painting, and both times a
 * different landscape came back. The approved artwork already exists at
 * `cover/cover-wrap-art-v1.png`; this hands that file to the model as the image
 * to work on, so the scene cannot drift.
 *
 * THE THREE CHANGES, and nothing else:
 *
 *   1. The dark green panel behind the title and subtitle comes off. The words
 *      stay exactly where and as they are; the photograph shows behind them.
 *   2. The dark green panel at the foot of the front cover comes off, and the
 *      author name inside it goes with it. That area becomes clean photograph.
 *      The name is set afterwards, in real type, by the compositor.
 *   3. The back-cover copy moves UP and finishes inside the upper 80% of the
 *      height. Amazon prints a barcode over the lower right of the back cover;
 *      the last four lines of the bio were sitting under it, 0.818in inside the
 *      reserve. The words are unchanged, only their size and position.
 *
 * The picture itself is not to be touched: same landscape, same crop, same
 * light, same colours.
 *
 *   npx tsx scripts/national-parks-cover-art-edit.ts --prompt
 *   npx tsx scripts/national-parks-cover-art-edit.ts --generate --confirm
 *
 * `--prompt` is free. `--generate` SPENDS about $0.05, once.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE_ART =
  'C:/Users/jovan/Downloads/wildlands agents platform/backend/backend/storage/' +
  '92c4ab36-4956-4435-b656-d2679fbc73d9/cover/cover-wrap-art-v1.png';
const OUT = 'C:/Users/jovan/Downloads/_np_build/cover-art-edited.png';

const PROMPT = [
  'The attached image is a FINISHED book cover wrap. Keep it. You are making three specific corrections to it,',
  'not designing a new cover and not painting a new picture.',
  '',
  'HOLD EVERYTHING ELSE EXACTLY AS IT IS. The same photograph, the same canyon, the same cliffs, the same sky, the',
  'same hiker on the same rock, the same sunset light, the same colours, the same crop and the same composition.',
  'Do not reframe it, do not re-light it, do not replace the landscape, do not move anything. The title wording, the',
  'subtitle wording and every word of the back-cover text stay exactly as written, letter for letter.',
  '',
  'CORRECTION 1 — REMOVE THE GREEN PANEL BEHIND THE TITLE.',
  '  On the front cover, the title and subtitle currently sit inside a dark green rectangle with a thin gold border.',
  '  Delete that rectangle and its border completely. The title and subtitle stay in the same place, at the same size,',
  '  in the same cream and gold lettering — but now directly on the photograph, with the sky and canyon visible behind',
  '  every letter. Fill what the rectangle covered with the surrounding photograph, continued naturally.',
  '  No box, no band, no plaque, no tint, no border, no shadow rectangle. Nothing behind the words but the picture.',
  '',
  'CORRECTION 2 — REMOVE THE AUTHOR PANEL AND THE AUTHOR NAME.',
  '  At the foot of the front cover there is a second dark green rectangle with a gold border containing an author',
  '  name. Delete the rectangle, the border AND the name. That whole area becomes clean, uninterrupted photograph:',
  '  continue the rock, the trail and the foliage through it as though the panel had never been there.',
  '  Paint NO name, NO byline, NO signature and NO lettering anywhere in the lower third of the front cover.',
  '',
  'CORRECTION 3 — MOVE THE BACK-COVER TEXT UP, CLEAR OF THE BARCODE.',
  '  The back cover is the LEFT panel. Its text currently runs too far down the page. A barcode is printed over the',
  '  lower right of that panel and destroys anything underneath it.',
  '  Keep every word, in the same order, in the same style. Set the whole block slightly smaller and tighter, and',
  '  move it up, so that the LAST line of the closing paragraph finishes within the UPPER 80% of the image height.',
  '  Below that line there must be nothing but photograph.',
  '  The bottom of the back cover is ARTWORK at full bleed, exactly like the rest of the picture. Do NOT blank it,',
  '  lighten it, fade it, flatten it, or leave a white box, plate, panel or clear area waiting for the barcode. The',
  '  barcode prints on top of the photograph; the photograph simply continues underneath it.',
  '',
  'THE SPINE STAYS EMPTY. The narrow vertical strip between the two covers carries no text, no letters, no ornament',
  'and no rule. Leave it as plain continuous artwork. The spine lettering is added afterwards by the typesetting system.',
  '',
  'DO NOT add a barcode, an ISBN, a price box, a publisher logo, a watermark, a crop mark or any guide line.',
  'DO NOT add any panel, band, box, plate, ribbon or tinted shape anywhere on the cover, for any purpose.',
].join('\n');

const argv = process.argv.slice(2);

if (argv.includes('--prompt')) {
  console.log(PROMPT);
  console.error(`\nsource: ${SOURCE_ART}`);
  console.error(`${PROMPT.length} characters. Nothing generated, nothing spent.`);
  process.exit(0);
}

if (!argv.includes('--generate')) throw new Error('pass --prompt or --generate --confirm');
if (!argv.includes('--confirm')) {
  console.error('REFUSING: --generate produces one paid image, about $0.05. Re-run with --confirm.');
  process.exit(1);
}

await import('../src/env.js');
const { generateImageFromBlueprint } = await import('../src/services/openai/openai.js');

/**
 * The APPROVED ARTWORK is the reference image, not the layout blueprint.
 *
 * That is the whole point: the edits endpoint composes against the image it is
 * given, so handing it the finished cover keeps the finished cover. Handing it
 * the blueprint, as the original generation did, invites a new painting.
 */
const source = readFileSync(SOURCE_ART);
console.log(`source     : ${SOURCE_ART} (${source.length} bytes)`);

const t0 = Date.now();
const result = await generateImageFromBlueprint({
  prompt: PROMPT,
  blueprintPng: source,
  size: '1536x1024',
});
writeFileSync(OUT, result.pngBuffer);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${result.widthPx} x ${result.heightPx}  ->  ${OUT}`);
process.exit(0);
