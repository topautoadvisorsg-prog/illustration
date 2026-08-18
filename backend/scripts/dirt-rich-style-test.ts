/**
 * STYLE TEST — three candidate looks for the DIRT RICH interior illustrations.
 *
 * Same subject (the p13 soil cross-section) drawn three ways, so the style can
 * be chosen by eye instead of from a description. Describing a drawing is not
 * the same as showing one, and the operator asked to see it.
 *
 * ONE SHOT each. No retries, no variants beyond these three. 3 x $0.05 = $0.15.
 *
 *   yarn tsx scripts/dirt-rich-style-test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateImage } from '../src/services/openai/openai.js';
import { AVG_COST_PER_IMAGE_USD } from '../src/services/cost/estimate.js';

const OUT = 'C:/Users/jovan/Downloads/dirt-rich-style-tests';
mkdirSync(OUT, { recursive: true });

/** The subject is held constant so the only variable is the STYLE. */
const SUBJECT =
  'Subject: a vertical cut-away slice of garden soil seen from the side, as if a spade had lifted a clean section out of the ground. ' +
  'The top few inches are dark crumbly topsoil with a little leaf mulch on the surface; below that, paler subsoil and a few small stones. ' +
  'Fibrous plant roots reach down through the layers, with fine root hairs and visible pore structure, and two or three earthworms. ' +
  'One or two seedlings emerge at the top edge. Cross-section only: no people, no tools, no buildings, no sky.';

const COMMON =
  'Illustration for the interior of a printed book. No colour of any kind. Clean white background, no border, no frame, ' +
  'no caption, no lettering, no numbers, no signature. Practical and observational; never whimsical, never cartoon, never cute.';

const STYLES: { id: string; label: string; style: string }[] = [
  {
    id: 'A-engraving',
    label: 'A — Bulletin plate / wood engraving',
    style:
      'Black and white pen-and-ink in the tradition of mid-century agricultural extension bulletin plates and 19th century wood engraving. ' +
      'Dense controlled cross-hatching and stipple for tone, firm confident outlines, high contrast, strong blacks. Precise and authoritative.',
  },
  {
    id: 'B-fieldsketch',
    label: 'B — Naturalist field sketch',
    style:
      'Black and white naturalist field-guide sketch. Open, economical line work with only light selective hatching where tone is needed. ' +
      'Much white space left in the drawing, an unfussy observational hand, as if drawn from life in a field notebook. Light and airy.',
  },
  {
    id: 'C-woodcut',
    label: 'C — Bold woodcut',
    style:
      'Black and white woodcut / linocut. Bold carved shapes, heavy solid blacks against white, simplified forms, visible gouge marks and ' +
      'chunky parallel cut lines for tone. Graphic and punchy rather than delicate.',
  },
];

console.log(`generating ${STYLES.length} style tests — estimated $${(STYLES.length * AVG_COST_PER_IMAGE_USD).toFixed(2)}\n`);

for (const s of STYLES) {
  const prompt = `${s.style}\n\n${SUBJECT}\n\n${COMMON}`;
  process.stdout.write(`  ${s.label} ... `);
  try {
    const img = await generateImage({ prompt, size: '1536x1024', quality: 'high' });
    const file = `${OUT}/${s.id}.png`;
    writeFileSync(file, img.pngBuffer);
    console.log(`ok  ${img.widthPx}x${img.heightPx}  ${Math.round(img.pngBuffer.length / 1024)}KB`);
  } catch (err) {
    // One shot. A failure is reported, not retried.
    console.log(`FAILED — ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\nwrote to ${OUT}`);
