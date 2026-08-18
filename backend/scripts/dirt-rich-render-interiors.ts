/**
 * Render the six approved DIRT RICH interior illustrations.
 *
 * STYLE: photo-realistic black and white, documentary rather than staged.
 * Operator's call, made after seeing three drawn styles side by side.
 *
 * The two "cross-section" subjects are rendered as things that can ACTUALLY be
 * photographed — a spade-cut soil profile, and a bed part-filled so its layers
 * show — rather than forcing a cut-away diagram into a photographic style, which
 * would read as a fake. That was the operator's instruction: where a subject is
 * not photographable, choose the best real equivalent.
 *
 * ONE SHOT each. No retries. 6 x $0.05 = $0.30.
 *
 *   yarn tsx scripts/dirt-rich-render-interiors.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateImage } from '../src/services/openai/openai.js';
import { AVG_COST_PER_IMAGE_USD } from '../src/services/cost/estimate.js';

/**
 * STYLE is a parameter, not a rewrite. The six subjects are fixed; only the
 * rendering tradition changes, so two styles can be compared on identical
 * content instead of on two different sets of drawings.
 */
const STYLES: Record<string, { dir: string; block: string }> = {
  photoreal: {
    dir: 'dirt-rich-figures',
    block:
      'A photorealistic black and white photograph. Documentary and editorial in feel, natural available light, ' +
      'moderate depth of field, fine film grain, a full tonal range with true blacks and clean whites. ' +
      'Completely monochrome — no colour of any kind, not even a tint. Unstaged and believable, as if shot for a ' +
      'serious practical gardening book. No text, no watermark, no signature, no border, no people, no faces.',
  },
  dore: {
    dir: 'dirt-rich-figures-v2-dore',
    block:
      'A majestic black and white engraving in the manner of Gustave Dore. Dense, fine burin line work and layered ' +
      'cross-hatching building deep velvety blacks against luminous paper-white highlights. Theatrical chiaroscuro, ' +
      'shafts of light falling through the scene, dramatic atmosphere and a sense of monumental scale even in a small ' +
      'subject. Romantic, richly detailed and reverent. Entirely monochrome — no colour of any kind. ' +
      'No text, no watermark, no signature, no border, no people, no faces.',
  },
};

const styleId = (process.argv.find((a) => a.startsWith('--style='))?.split('=')[1] ?? 'photoreal').trim();
const STYLE_DEF = STYLES[styleId];
if (!STYLE_DEF) {
  console.error(`Unknown --style=${styleId}. Known: ${Object.keys(STYLES).join(', ')}`);
  process.exit(2);
}
const OUT = `C:/Users/jovan/Downloads/${STYLE_DEF.dir}`;
mkdirSync(OUT, { recursive: true });

/**
 * Applied to every image. B&W is stated twice on purpose — once as medium, once
 * as a prohibition — because the model will drift back to colour otherwise, and
 * the interior of this book prints black on cream.
 */
const STYLE = STYLE_DEF.block;

const FIGURES: { id: string; page: number; label: string; subject: string }[] = [
  {
    id: 'p13-soil-profile',
    page: 13,
    label: 'p13 — soil profile',
    subject:
      'A close, straight-on view of a freshly cut vertical soil profile in a garden bed, as if a spade has ' +
      'sliced a clean section out of the ground. Dark crumbly topsoil in the top few inches with a little leaf mulch ' +
      'on the surface, paler subsoil below it, and a few small stones. Fine plant roots thread down through the layers, ' +
      'one or two earthworms are visible, and the soil texture and crumb structure are clearly readable. A seedling or ' +
      'two at the top edge. Soft natural daylight.',
  },
  {
    id: 'p21-raised-bed',
    page: 21,
    label: 'p21 — raised bed, layers visible',
    subject:
      'A simple untreated-timber raised garden bed that is only partly filled, seen from a low ' +
      'three-quarter angle so the layered fill is clearly visible against the inside of the boards: coarse woody ' +
      'material at the bottom, then dark compost, then finished soil close to the top rail. A lettuce and a young ' +
      'staked tomato are planted at one end. Ordinary suburban garden ground around it. Flat overcast daylight.',
  },
  {
    id: 'p47-coop-dusk',
    page: 47,
    label: 'p47 — coop at dusk',
    subject:
      'A small ordinary backyard chicken coop and wire run at dusk. Four or five hens are settling for ' +
      'the night, one on the ramp, two already inside the doorway. The coop is plain plywood and batten with a shingled ' +
      'roof, plainly homemade rather than decorative. Low warm evening light, long shadows, quiet and still. ' +
      'Restrained and matter-of-fact.',
  },
  {
    id: 'p57-zucchini',
    page: 57,
    label: 'p57 — the zucchini',
    subject:
      'A single large summer squash plant that has completely overtaken its raised bed, from a slight ' +
      'three-quarter angle. Broad lobed leaves sprawl well past the wooden bed edge and onto the path, with thick hollow ' +
      'stems, and two or three oversized zucchini lie half hidden underneath, one of them clearly too big to have been ' +
      'picked in time. A second bed is visible behind. Bright late-summer daylight.',
  },
  {
    id: 'p83-january-garden',
    page: 83,
    label: 'p83 — frozen January garden',
    subject:
      'A small suburban vegetable garden in deep winter, from a slightly elevated three-quarter view. ' +
      'Empty raised beds under a thin crust of frost and old snow, bare soil showing through, a few blackened stems ' +
      'still standing. A modest chicken coop at one side with warm light spilling from its doorway. An ordinary ' +
      'residential fence behind, bare deciduous trees, and the roofline of a neighbouring house. Flat overcast winter ' +
      'light. Dormant and still, not bleak.',
  },
  {
    id: 'p99-quarter-acre',
    page: 99,
    label: 'p99 — the whole quarter acre',
    subject:
      'An ordinary suburban backyard at the height of late summer, from a slightly elevated ' +
      'three-quarter view as if seen from an upstairs window. Six raised vegetable beds in productive disorder: staked ' +
      'tomatoes heavy with fruit, pole beans climbing a frame, salad greens, garlic tops drying, and a squash sprawling ' +
      'over one edge. In-ground rows beyond them. A small chicken coop and run with several hens at one side. A ' +
      'three-bay compost area half screened by a shrub. Rich dark worked soil in the paths between the beds. A modest ' +
      'single-storey house and garage at the back of the plot, an ordinary residential fence, and a neighbouring ' +
      'roofline beyond. Warm late-afternoon light. Clearly a normal suburban lot made productive — not a farm, not an ' +
      'estate, no barn and no tractor.',
  },
];

console.log(`rendering ${FIGURES.length} interiors — estimated $${(FIGURES.length * AVG_COST_PER_IMAGE_USD).toFixed(2)}`);
console.log('photo-realistic black and white; one shot each, no retries\n');

let ok = 0;
for (const f of FIGURES) {
  process.stdout.write(`  ${f.label.padEnd(34)} `);
  try {
    const img = await generateImage({ prompt: `${STYLE}\n\n${f.subject}`, size: '1536x1024', quality: 'high' });
    writeFileSync(`${OUT}/${f.id}.png`, img.pngBuffer);
    console.log(`ok  ${img.widthPx}x${img.heightPx}  ${Math.round(img.pngBuffer.length / 1024)}KB`);
    ok++;
  } catch (err) {
    console.log(`FAILED — ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\n${ok}/${FIGURES.length} rendered -> ${OUT}`);
console.log(`spent approximately $${(ok * AVG_COST_PER_IMAGE_USD).toFixed(2)}`);
