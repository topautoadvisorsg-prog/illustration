/**
 * THE COVER ARTWORK AS A CLEAN PLATE: the same scene, with no lettering at all.
 *
 * WHY THIS EXISTS
 * The shipped wrap has the model painting the title, the subtitle, the back copy
 * and the author name. Three defects came out of that and none of them are
 * fixable by asking again:
 *
 *   1. The back copy runs 0.818in into KDP's barcode reserve. Measured, not
 *      estimated: the reserve begins 7.675in down the wrap and the last line of
 *      the bio sits at 8.493in.
 *   2. The title and the author name each sit in a solid green panel. The
 *      operator wants the artwork visible behind the type instead.
 *   3. The author name is painted lettering, not set type.
 *
 * The existing prompt ALREADY says, in these words, "DO NOT PAINT THE AUTHOR
 * NAME... no byline, no signature, no plaque, no label and no banner." The model
 * painted one anyway, inside a panel, while a different line of the same prompt
 * asked for "something to sit on" beneath the author. A prompt that contradicts
 * itself gets resolved by the model, not by us, and the same prompt's own
 * comments record it placing back copy at 5.3% of the canvas when instructed to
 * use 8.7%.
 *
 * So the fix is not a better instruction. It is to stop asking the model for
 * type at all. It paints the landscape; the compositor sets every word, against
 * measured clearances it already prints on every run for the spine and the park
 * lists. Then the barcode clearance is a computed fact rather than a hope.
 *
 * WHAT CHANGES FROM THE ORIGINAL PROMPT
 * The scene language is carried over VERBATIM, so the landscape comes back as
 * close to the approved one as the model allows. Removed: the copy strings, the
 * type-safety block, the panel-behind-the-title block. Added: an explicit
 * no-lettering rule, and the tonal requirements the type needs from the art.
 *
 *   npx tsx scripts/national-parks-cover-art-clean.ts --prompt
 *   npx tsx scripts/national-parks-cover-art-clean.ts --generate --confirm
 *
 * `--prompt` is free. `--generate` SPENDS about $0.05, once.
 */
import { writeFileSync } from 'node:fs';

const OUT = 'C:/Users/jovan/Downloads/_np_build/cover-art-clean.png';

/** Carried over verbatim from COVER-PROMPT.txt so the scene does not drift. */
const SCENE = [
  'ART DIRECTION — how the cover should LOOK.',
  '  Atmosphere: one cohesive, cinematic full-colour landscape photograph of dramatic American wilderness —',
  '  sweeping canyon walls, granite cliffs, layered mountain ridges, pine forest, a trail or overlook — with real',
  '  atmospheric depth from foreground to far distance and warm natural light near sunrise or the golden hour.',
  '  One strong scene that evokes several iconic national parks through landform and depth, never a grid or',
  '  collage of separate places.',
  '  Mood: premium, commercial adult travel nonfiction: adventurous but believable, sophisticated rather than',
  '  touristic. It should say "I want to go there, and this book will help me do it right" — never a stock-photo',
  '  brochure, never a coffee-table art book.',
  '',
  'A photographic, photorealistic cover image for commercial trade nonfiction: a real scene, convincingly lit and',
  'textured, as though shot on location for a serious practical book. NOT flat graphic design, NOT vector shapes,',
  'NOT a painted illustration, NOT a cartoon.',
  'LINE WORK: There is no drawn line. Form comes from photographic detail, depth of field and real texture.',
  'COLOUR: FULL COLOUR, naturalistic. Real daylight colour with a warm earthy bias. Rich saturated darks that stay',
  'detailed rather than crushing to black, and highlights that hold texture. Never flat fills, never posterised,',
  'never monochrome or sepia.',
  'LIGHT: Real directional daylight with believable shadows and falloff. Warm and low is preferred over flat midday.',
  'PAPER: None. This is a photographic surface: no paper grain, no kraft, no newsprint, no vignetting, no distressing.',
  'EDGES: The photograph runs to the edges of the wrap and continues through the bleed. The full wrap reads as one',
  'continuous photographic scene from back through spine to front.',
].join('\n');

/**
 * The tonal contract. Type is set onto this image afterwards, so the art has to
 * offer places quiet enough to receive it. These are composition requirements,
 * not text instructions: nothing here is lettering.
 */
const ZONES = [
  'PANEL GEOMETRY — measured on the canvas you are painting, left edge = 0%:',
  '  • BACK COVER  spans 5.8% to 49.1% of the width.',
  '  • SPINE       spans 49.1% to 50.9% of the width. Only 1.9% wide: a narrow strip, not a panel.',
  '  • FRONT COVER spans 50.9% to 94.2% of the width.',
  '  The outer 9.8% of the image width is cropped away in total, half from each side.',
  '',
  'WHERE THE IMAGE MUST STAY QUIET — type is set onto this artwork afterwards, so these areas need to be',
  'calm and tonally even. Quiet does NOT mean empty, blank, flat or faded: it means the real scene continues',
  'there in an unbusy passage — open sky, a shadowed cliff face, still water, massed distant forest — with',
  'no fine detail, no strong edge and no bright highlight running through it.',
  '',
  '  • UPPER FRONT PANEL, from 53% to 92% of the width and 4% to 45% of the height:',
  '    a DEEP, EVENLY TONED, comparatively DARK passage. A large light-coloured title is set here and has to',
  '    read at thumbnail size, so this area must be a full stop or two darker than the brightest part of the sky,',
  '    and must not contain a sun, a sunburst, a bright cloud edge or a hard skyline running through it.',
  '  • LOWER FRONT PANEL, from 53% to 92% of the width and 78% to 93% of the height:',
  '    a second calm, darker passage, clear of any focal subject, where the author name is set.',
  '  • BACK PANEL, from 7% to 47% of the width and 5% to 82% of the height:',
  '    a large, quiet, comparatively DARK region — shadowed rock, dense forest, deep canyon — even enough that',
  '    several paragraphs of small light text set on it stay legible from top to bottom.',
  '  • BACK PANEL LOWER RIGHT, from 30% to 47% of the width and 82% to 100% of the height:',
  '    the printed barcode lands here. Keep the artwork running FULL BLEED through it exactly as everywhere',
  '    else — do NOT blank it, lighten it, flatten it, or leave a box, plate or clear area. It simply must not',
  '    hold the focal point of the picture.',
  '  • SPINE STRIP, 49.1% to 50.9% of the width: a plain, EVEN field of the scene\'s dominant dark colour running',
  '    the full height, with no change of tone, no rule, no border and no painted fold, crease, shadow or highlight.',
].join('\n');

const FORBIDDEN = [
  'ABSOLUTELY NO LETTERING OF ANY KIND. This image is a CLEAN PLATE. Every word on the finished book is set',
  'afterwards by a typesetting system, directly onto this artwork.',
  '  • NO title, NO subtitle, NO author name, NO byline, NO signature, NO publisher name, NO quotation,',
  '    NO blurb, NO caption, NO price, NO barcode, NO ISBN, NO logo, NO monogram, NO watermark.',
  '  • NO letters, NO numerals, NO glyphs, NO symbols and NO invented or decorative script anywhere in the',
  '    image — not on a sign, a trail marker, a plaque, a map, a book, a patch, a flag or a piece of equipment.',
  '  • NO panel, band, box, plate, card, banner, ribbon, scroll, tinted rectangle, colour block, frame, border',
  '    or vignette — neither carrying text nor waiting for it. There is nothing for type to sit on, because the',
  '    type sits on the photograph.',
  '  • NO guide line, dashed line, crop mark, registration mark, arrow, label or measurement.',
  '  • NO human face turned toward the camera; a small distant figure seen from behind is welcome for scale.',
  '',
  'OUTPUT: one continuous photographic landscape filling the entire canvas edge to edge, with nothing on it but',
  'the scene itself.',
].join('\n');

const PROMPT = [
  'You are painting the ARTWORK ONLY for a print book cover wrap: one single continuous photographic scene',
  'spanning back cover, spine and front cover. You are NOT designing the cover and you are NOT setting any type.',
  '',
  SCENE,
  '',
  ZONES,
  '',
  FORBIDDEN,
].join('\n');

const argv = process.argv.slice(2);

if (argv.includes('--prompt')) {
  console.log(PROMPT);
  console.log(`\n${'='.repeat(78)}`);
  console.log(`${PROMPT.length} characters. Nothing generated, nothing spent.`);
  process.exit(0);
}

if (!argv.includes('--generate')) throw new Error('pass --prompt or --generate --confirm');
if (!argv.includes('--confirm')) {
  console.error('REFUSING: --generate produces one paid image, about $0.05. Re-run with --confirm.');
  process.exit(1);
}

await import('../src/env.js');
const { generateImage } = await import('../src/services/openai/openai.js');

/** ONE SHOT. A failure is named, never silently retried into a doubled bill. */
const t0 = Date.now();
const result = await generateImage({ prompt: PROMPT, size: '1536x1024', quality: 'high' });
writeFileSync(OUT, result.pngBuffer);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${result.widthPx} x ${result.heightPx}  ->  ${OUT}`);
process.exit(0);
