/**
 * BEFORE YOU NEED IT — the two figures the owner asked for.
 *
 * 1. THREE OPENINGS, regenerated for vocabulary. The owner's version labelled
 *    the openings "Pee" and "Poop". The manuscript uses "urine" (3x) and "poo"
 *    (1x) and never uses either of those words, and the book's stated method is
 *    to use real words because it "reduces confusion and shame". The figure was
 *    contradicting the book's own principle.
 *
 * 2. THE MENSTRUAL CYCLE, the one approved concept with no art yet.
 *
 * HOUSE STYLE IS THE OWNER'S, NOT MINE. The four figures he generated set the
 * system: bold sans title, lighter subtitle, one clean line drawing, numbered
 * labels on the right with leader lines, a rounded takeaway box at the foot,
 * square canvas. These two must sit beside those without looking imported.
 *
 * EVERY FACTUAL CLAIM IS QUOTED FROM rev-18. In particular the egg "breaks
 * down" — an earlier brief of mine said "unchanged", which contradicted the
 * text — and NO cycle length appears anywhere, because this book gives 21-45
 * days for teenagers and spends a page attacking the 28-day myth.
 *
 *   yarn tsx scripts/before-you-need-it-illustrations-v2.ts
 *
 * PAID: two gpt-image-2 generations.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { generateImage } from '../src/services/openai/openai.js';
import { AVG_COST_PER_IMAGE_USD } from '../src/services/cost/estimate.js';
import { OUT_DIR } from './before-you-need-it-config.js';

const OUT = `${OUT_DIR}/illustrations-v2`;
mkdirSync(OUT, { recursive: true });

/** The visual system, read off the four figures the owner already approved. */
const HOUSE = `A clean black-and-white educational diagram for a health book for girls aged 8 to 12, drawn as a single square figure on a plain white background.

LAYOUT, followed exactly:
- A bold black sans-serif TITLE across the top, centred.
- One lighter, smaller subtitle line directly beneath it.
- One clear line drawing occupying the centre-left of the square.
- Numbered labels stacked down the RIGHT side, each a bold short heading with one or two lighter lines of explanation beneath, joined to the drawing by thin straight leader lines.
- A single rounded-rectangle box centred at the very bottom holding one short summary sentence.

DRAWING STYLE: confident even black linework of consistent weight, with very light flat grey fills only where a shape needs to be distinguished. No colour whatsoever. No heavy shading, no gradients, no texture, no cross-hatching, no drop shadows, no frame around the whole image, no watermark.

TONE: calm, clinical and plain. Made for a twelve-year-old, not a six-year-old. Never cute, never cartoonish, never babyish. This must read as an authored textbook figure, NOT as a flat vector icon set and NOT as clip art.

All lettering must be correctly spelled, cleanly formed and horizontal.`;

interface Job { id: string; subject: string; alt: string }

const ONLY = process.argv[2];
const JOBS: Job[] = [
  {
    id: 'three-openings',
    alt:
      'A simple front-view diagram of the three separate openings between the legs, labelled in order from front to back: the urethra where urine comes out, the vaginal opening where period blood comes out and where a tampon goes, and the anus where poo comes out.',
    subject: `SUBJECT: a simple, schematic front-view diagram of the three separate openings between the legs, drawn in plain outline with no realistic detail and no shading of the body.

Three labels down the right side, connected by leader lines, in this exact order from top to bottom:

1. Urethra
Urine comes out here.

2. Vaginal opening
Period blood comes out here.
Tampons go here.

3. Anus
Poo comes out here.

TITLE: Three separate openings
SUBTITLE: They are close together, but they are not the same opening.
BOTTOM BOX: Each opening has its own job.

Use the words "Urine" and "Poo" exactly as written above. Do not substitute "pee" or "poop". Keep the drawing minimal, clinical and diagrammatic — the point of the figure is only that the three are SEPARATE.`,
  },
  {
    id: 'menstrual-cycle',
    alt:
      'A four-stage diagram of the menstrual cycle arranged as a ring: the lining of the uterus builds up over roughly two weeks, an ovary releases one egg, the egg is not needed and breaks down, and the lining then comes away over several days before the cycle begins again.',
    subject: `SUBJECT: a four-stage cycle diagram of the menstrual cycle, arranged as a RING of four equal circular vignettes read clockwise, joined by four bold curved arrows all flowing the same way so the fourth clearly returns to the first. Leave the centre of the ring open for the title.

Inside each circle, a simple schematic cross-section of the uterus drawn in clean outline with light grey fill:
1. the lining thickening along the inside wall of the uterus
2. a single small egg leaving one ovary and entering the tube
3. that same egg partway along the tube, visibly breaking apart into small fragments
4. the thickened lining detaching from the wall and passing downward and out

LABEL PLACEMENT, and this overrides the right-hand label column described above:
this figure is a RING, so there is NO column of labels down the right side.
Each stage is labelled ONCE ONLY, immediately outside its own circle, positioned
radially — stage 1 above its circle, stage 2 to the right of its circle, stage 3
below its circle, stage 4 to the left of its circle. Exactly four label blocks in
the whole figure. Do not repeat any stage label anywhere.

Each label is a bold number and short heading with one lighter line beneath:

1. The lining builds up
This takes roughly two weeks.

2. An ovary releases an egg
One egg, from one ovary.

3. The egg is not needed
It breaks down.

4. The lining comes away
This happens over several days.

TITLE, placed in the open centre of the ring: The menstrual cycle
BOTTOM BOX: Then the whole thing starts again.

Do NOT print any number of days or weeks for the length of the cycle anywhere in the figure. The only timings shown are the two written above.`,
  },
];

console.log('BEFORE YOU NEED IT — two figures');
console.log(`  model  gpt-image-2   size 1024x1024   quality high`);
console.log(`  cost   ${JOBS.length} x ~$${AVG_COST_PER_IMAGE_USD.toFixed(2)} = ~$${(JOBS.length * AVG_COST_PER_IMAGE_USD).toFixed(2)}\n`);

for (const j of JOBS.filter((x) => !ONLY || x.id === ONLY)) {
  console.log(`${j.id} ...`);
  const prompt = `${HOUSE}\n\n${j.subject}`;
  try {
    const img = await generateImage({ prompt, size: '1024x1024', quality: 'high' });
    writeFileSync(`${OUT}/${j.id}.png`, img.pngBuffer);
    writeFileSync(`${OUT}/${j.id}.prompt.txt`, prompt);
    writeFileSync(`${OUT}/${j.id}.alt.txt`, j.alt);
    console.log(`   ${img.widthPx}x${img.heightPx}  sha256 ${createHash('sha256').update(img.pngBuffer).digest('hex').slice(0, 16)}…`);
    console.log(`   -> ${OUT}/${j.id}.png\n`);
  } catch (e) {
    // A refusal is a result, not a failure to hide. The production profile says
    // that if a diagram cannot be drawn plainly and respectfully, use words.
    console.error(`   REFUSED OR FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
  }
}
console.log('Nothing placed. Review at full size before any placement.');
process.exit(0);
