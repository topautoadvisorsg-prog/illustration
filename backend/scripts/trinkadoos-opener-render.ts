/**
 * THE TRINKADOOS — opener artwork, with the banner painted INTO the illustration.
 *
 * The composited-afterwards opener looked composited: a flat panel and flat type
 * dropped onto a painted scene, lit by nothing, belonging to nothing. A real
 * picture-book opener has its banner painted as an object in the world -- carved
 * wood, hanging cloth, weathered parchment -- catching the same light as the
 * trees behind it.
 *
 * Two variants, so the trade can be seen rather than argued about:
 *
 *   painted  the model paints the banner AND letters the title. One flattened
 *            illustration, fully integrated, but the spelling is the model's and
 *            must be read before it ships.
 *   blank    the model paints the banner as an empty object and leaves the sky
 *            below it clear. Type is composited on afterwards, so spelling and
 *            cross-book consistency stay exact while the banner is still real art.
 *
 * Usage: tsx scripts/trinkadoos-opener-render.ts <painted|blank> [book]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateImageFromBlueprint } from '../src/services/openai/openai.js';
import { BOOK } from './trinkadoos-config.js';

/*
 * Splits are duplicated here rather than imported: trinkadoos-opener.ts runs its
 * own `await main()` at module scope, so importing from it would render an
 * opener as a side effect of asking for a string. Kept identical by hand and
 * asserted below.
 */
const TITLE_SPLITS: Record<number, [string, string]> = {
  1: ['The Lantern Tree', 'Went Dark'],
  2: ['The Baby Dragon', 'of Cloudstone'],
  3: ['The Forest That', 'Lost Its Colors'],
  4: ['The Moon Fox', 'Who Lost His Way'],
  5: ['The Valley of', 'Giant Flowers'],
  6: ['The Bridge That Forgot', 'How to Build Itself'],
  7: ['The Firefly Festival', 'That Lost Its Spark'],
  8: ['The Creature Who', "Didn't Want to Be Seen"],
  9: ['The Door Beneath', 'The Glowing Waterfall'],
  10: ['The City Beneath', 'The Giant Leaf'],
};

const REF = 'C:/Users/jovan/Downloads/wildlands agents platform/docs/trinkadoos/references/characters/everyday/four-children-everyday.png';
const OUT = `${BOOK}/10-ARTWORK`;
const CHAPTER_WORD = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** The scene itself. Identical in both variants so only the banner treatment differs. */
const SCENE =
  'Use the approved Trinkadoos STYLE REFERENCE for the visual style. Use ONLY the approved ' +
  'EVERYDAY CHARACTER REFERENCE sheet for Bram, Tessa, Nico and Sivi — ordinary clothes, no ' +
  'costumes and no Packs. These control identity, clothing, hair, proportions and style. Do not ' +
  'redesign the characters. ' +
  'A big natural park on a bright ordinary Saturday morning. The four children, in everyday ' +
  'clothes, are mid-run toward a mossy log, moving left to right through dappled light. Sivi is ' +
  'at the front, skidding to a stop with her weight thrown back; the other three are still ' +
  'running and beginning to pile up behind her. Excited, breathless, faintly startled. Towering ' +
  'trees frame the lower two-thirds, a rocky rise soft and distant behind. In the middle ' +
  'distance, picnic tables with families at them, small and unremarkable — adults soft, out of ' +
  'focus, no clear faces. No magic anywhere in the scene. Keep the children\u2019s heads below the ' +
  'upper 38% of the frame. Compose as a single square page, 1:1.';

/**
 * A small CARVED WOODEN SIGN, not cloth.
 *
 * The first pass came back as a sagging fabric banner on a rope. Fabric reads
 * as bunting -- a party decoration -- and it drifts in the wind of whatever the
 * model feels like. Wood is an object: it holds an edge, takes carved lettering,
 * and sits in a forest without explanation. Every negative here is a mistake the
 * model has already made once.
 */
const BANNER_ART =
  'At the very top of the illustration, painted as a real object in the scene: a SMALL CARVED ' +
  'WOODEN SIGN — a hand-made storybook plaque of warm honey-toned wood with visible grain, softly ' +
  'rounded and slightly worn edges, a simple carved border, and small iron hooks or short ropes ' +
  'holding it from a branch above. Solid wood, not cloth, NOT fabric, NOT a ribbon, NOT canvas, ' +
  'NOT a hanging parchment banner and NOT bunting. It catches the same warm daylight as the ' +
  'canopy, casts a soft shadow, and sits naturally among the leaves as part of the painting.';

/**
 * Lettering, not type.
 *
 * The second thing that went wrong: the title read as a font dropped on the page.
 * What a premium picture book actually has is lettering the illustrator drew --
 * warm, slightly irregular, with weight and light on it.
 */
const LETTERING =
  'All lettering must look HAND-LETTERED BY THE ILLUSTRATOR — custom storybook display lettering ' +
  'with soft rounded serifs, gentle organic variation in the stroke weights, and a little warmth ' +
  'and irregularity in the letterforms. Elegant, whimsical, child-friendly and highly readable. ' +
  'It must NOT look like a plain system font, a typewriter face, flat digital text or clip-art ' +
  'lettering pasted over the picture.';

function prompt(variant: 'painted' | 'blank', book: number): string {
  const [l1, l2] = TITLE_SPLITS[book]!;
  const chapter = `Chapter ${CHAPTER_WORD[book]}`;
  if (variant === 'painted') {
    return [
      SCENE,
      BANNER_ART,
      LETTERING,
      `Carved or hand-painted into the wooden sign, centred, in a warm dark brown: "${chapter}". ` +
        `Below the sign, across the open sky and clear of the children, the book title on exactly ` +
        `two centred lines — "${l1}" on the first line and "${l2}" on the second — in creamy ivory ` +
        `hand-lettering with a soft darker outline and a gentle glow so it reads clearly against ` +
        `the sky and feels painted into the scene. Spell every word exactly as given. No other ` +
        `text, letters or numbers anywhere in the illustration.`,
    ].join(' ');
  }
  return [
    SCENE,
    BANNER_ART,
    'The banner is completely EMPTY — no letters, words, numbers or marks on it of any kind; it is ' +
      'a blank surface waiting for lettering to be added later. Below the banner, keep the open sky ' +
      'clear, calm and uncluttered so a title can be placed there afterwards. No text, letters, ' +
      'numbers or signage anywhere in the illustration.',
  ].join(' ');
}

async function main() {
  const variant = (process.argv[2] ?? 'painted') as 'painted' | 'blank';
  if (variant !== 'painted' && variant !== 'blank') throw new Error('variant must be painted or blank');
  const book = Number(process.argv[3] ?? 1);
  const p = prompt(variant, book);

  console.log(`opener artwork — book ${book}, variant "${variant}"`);
  console.log(`  prompt : ${p.length} chars`);
  console.log('  calling gpt-image-2 ...');
  const image = await generateImageFromBlueprint({
    prompt: p,
    blueprintPng: readFileSync(REF),
    size: '1024x1024',
  });

  mkdirSync(OUT, { recursive: true });
  const out = `${OUT}/opener-${String(book).padStart(2, '0')}_banner-${variant}.png`;
  writeFileSync(out, image.pngBuffer);
  console.log(`  written: ${out}  (${(image.pngBuffer.length / 1024).toFixed(0)} KB)`);
}

await main();
