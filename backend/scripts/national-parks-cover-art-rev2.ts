/**
 * REGENERATE THE COVER ARTWORK, same brief as the approved one, three fixes.
 *
 * This is the APPROVED prompt with targeted edits, not a new brief and not a new
 * scene. The cover concept is settled; three things about the last render are
 * not:
 *
 *   1. The title and the author each sat in a solid green panel. The operator
 *      wants the photograph visible behind the type instead.
 *   2. The back-cover copy ran 0.818in into KDP's barcode reserve. Measured, not
 *      estimated: the reserve begins 7.675in down a 9.25in wrap, and the last
 *      line of the bio sat at 8.493in. The barcode prints over the artwork after
 *      press, so those lines would have had a barcode on top of them.
 *   3. The author name was painted lettering. It is set by the compositor.
 *
 * WHAT THE MODEL STILL PAINTS: the title, the subtitle and all of the back-cover
 * copy. That is unchanged from the approved cover.
 * WHAT IT MUST NOT PAINT: the author name and anything on the spine. Both of
 * those are set afterwards, in real type, by `national-parks-cover-print.ts`.
 *
 * WHY THE APPROVED PROMPT NEEDED EDITING RATHER THAN REPEATING
 * It contradicted itself. One line said "DO NOT PAINT THE AUTHOR NAME"; another,
 * forty lines later, said "give the author name something to sit on — a shape,
 * band or colour block beneath it". A whole section headed CONTAIN THE TITLE
 * required the title to sit on "a solid colour block, a panel, a heavy band".
 * The model resolved the contradiction the way the louder instruction pointed,
 * and painted a name inside a panel. Asking again without removing those lines
 * would get the same cover back.
 *
 *   npx tsx scripts/national-parks-cover-art-rev2.ts --prompt
 *   npx tsx scripts/national-parks-cover-art-rev2.ts --generate --confirm
 *
 * `--prompt` is free. `--generate` SPENDS about $0.05, once.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC_PROMPT = 'C:/Users/jovan/Downloads/_np_build/cover/COVER-PROMPT.txt';
const BLUEPRINT = 'C:/Users/jovan/Downloads/_np_build/cover/COVER-BLUEPRINT.png';
const OUT = 'C:/Users/jovan/Downloads/_np_build/cover-art-rev2.png';

let prompt = readFileSync(SRC_PROMPT, 'utf8');

/** Every edit is asserted, so a prompt that has moved on fails loudly instead of half-applying. */
const cut = (needle: string, replacement: string, label: string): void => {
  if (!prompt.includes(needle)) throw new Error(`prompt edit "${label}" did not match; the source prompt has changed`);
  prompt = prompt.replace(needle, replacement);
  console.error(`  edited: ${label}`);
};

// ── 1. No panel behind the title ───────────────────────────────────────────
cut(
  `CONTAIN THE TITLE — this is how you keep it off the edge:
  • The title block must sit ON or WITHIN a visible graphic element that is part of the design: a solid colour block,
    a panel, a heavy band, or a bold shape behind the lettering. Not a thin outline, not a decorative frame.
  • That element must itself have clear background on its left and right, well inside the red safe line. The type stops
    where the element stops, and the element stops before the edge does.
  • Use the same graphic language as the rest of the cover — the bold flat bands and blocks already in the art direction.
  • Result: nothing on the front panel is ever floating loose near an edge. Every line of type has something holding it in.`,
  `THE TYPE SITS ON THE PHOTOGRAPH — no panel, anywhere, for anything:
  • Do NOT put the title, the subtitle or ANY text on a solid colour block, a panel, a band, a plaque, a card, a
    tinted rectangle, a scroll, a ribbon or a shape of any kind. There is no box behind any lettering on this cover.
  • The photograph must remain fully visible behind every word. Nothing may be covered over to make room for type.
  • Legibility comes from the PICTURE, not from a panel: compose so the title falls across a genuinely darker, quieter
    passage of the scene — deep sky, shadowed rock, massed distant forest — a full stop or two darker than the
    brightest part of the image, with no hard skyline, sunburst or bright cloud edge running through the lettering.
  • Set the type in a light, warm off-white so it separates from that darker passage by tone alone.
  • Keep the title well inside the safe line as before. Contain it by SIZE and POSITION, never by drawing a box.`,
  'title panel removed',
);

// ── 2. The author band contradiction ───────────────────────────────────────
cut(
  `  • Give the author name something to sit on — a shape, band or colour block beneath it — so it does not drift to the bottom edge.
`,
  `  • Paint NOTHING in the lower third of the front panel. No name, no band, no block, no shape, no plaque. That area
    is clean artwork; the author name is set onto it afterwards in real type. Keep it a calm, darker passage of the
    scene so light lettering will read on it, and put no focal subject there.
`,
  'author band removed',
);

// ── 3. The barcode reserve ─────────────────────────────────────────────────
cut(
  `  Keep the lower-right corner of the back cover quiet and free of type.`,
  `  THE BACK COVER COPY MUST FINISH IN THE UPPER 80% OF THE PANEL. Amazon prints a barcode over the lower right of
  the back cover, and any words underneath it are destroyed. Every line of back-cover text — the opening paragraph,
  the heading, the list and the closing paragraph — must END above 80% of the canvas height. Nothing below that line
  but photograph.
  • If the copy will not fit above 80%, SET IT SMALLER and tighter until it does. Never let it run down the panel.
  • The bottom 20% of the back cover is ARTWORK, running full bleed exactly like the rest of the picture. Do NOT
    blank it, lighten it, flatten it, fade it, or leave a box, plate, panel or clear area waiting for the barcode.
    The barcode is printed on top of the photograph; the photograph simply continues underneath it.`,
  'barcode reserve made explicit',
);

const argv = process.argv.slice(2);

if (argv.includes('--prompt')) {
  console.log(prompt);
  console.error(`\n${prompt.length} characters. Nothing generated, nothing spent.`);
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
 * Through the BLUEPRINT path, as the approved cover was. The blueprint is the
 * layout reference the prompt keeps calling "the attached image"; generating
 * without it would drop every position the prompt describes.
 */
const t0 = Date.now();
const result = await generateImageFromBlueprint({
  prompt,
  blueprintPng: readFileSync(BLUEPRINT),
  size: '1536x1024',
});
writeFileSync(OUT, result.pngBuffer);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${result.widthPx} x ${result.heightPx}  ->  ${OUT}`);
process.exit(0);
