/**
 * BEFORE YOU NEED IT — full-wrap cover source art.
 *
 * Two generations, one composition:
 *   A  the production cover, with front title/subtitle and back-cover copy
 *   B  the same look with NO TEXT ANYWHERE — the clean-art fallback, so live
 *      typography can be set if the model's lettering is imperfect
 *
 * ─── WHAT THIS INHERITS FROM NO ONE TOLD ME THAT ──────────────────────────
 * Every constraint below is a lesson from that book's COVER-SPEC.md:
 *
 *   - The art invented a spine: a painted drop shadow and highlight down each
 *     side of a crease it made up, at 5.3767/6.2667in, while the real folds were
 *     at 5.6250/6.0150in — 0.18in adrift and dark enough to print as a rule.
 *     They had to be removed row by row. Hence the prohibition list.
 *   - The spine lettering was baked in and cleared KDP's fold minimum by
 *     0.0008in. It had to be filled out and re-set as live vector. Hence no
 *     spine text is generated here at all.
 *   - The author name is not generated either, so its spelling and typography
 *     are exact rather than whatever the model draws.
 *
 * GEOMETRY (canonical white-paper formula, 184pp):
 *   wrap 11.664368 x 8.75in, spine 0.414368in, bleed 0.125in
 *   folds at 5.6250in and 6.0394in -> 48.2% and 51.8% of the width
 *   barcode reserve 2.0 x 1.2in, lower back cover; artwork may run under it,
 *   readable copy may not.
 *
 *   yarn tsx scripts/before-you-need-it-cover-art.ts
 *
 * PAID: two gpt-image-2 generations.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { generateImage } from '../src/services/openai/openai.js';
import { AVG_COST_PER_IMAGE_USD } from '../src/services/cost/estimate.js';

const OUT = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/cover';
mkdirSync(OUT, { recursive: true });

/** Shared composition, so B is a genuine stand-in for A's artwork. */
const ART = `A single continuous full-wrap book cover illustration, landscape format, spanning back cover, spine and front cover as ONE unbroken picture.

STYLE: polished modern commercial book-cover illustration. Contemporary editorial style with clean confident shapes, flat colour and simple forms, strong visual hierarchy. Warm, friendly and slightly grown-up. NOT photorealistic, NOT painterly fine art, NOT coloring-book, NOT comic-book, NOT childish clip art, NOT a princess or fairytale look.

CRITICAL — THE ARTWORK MUST NOT DEPICT A SPINE. The background and artwork flow continuously from the left edge to the right edge. The middle of the image, around 48 to 52 percent of the width, should simply be quieter and lower in detail than the rest, as an unremarkable part of the same continuous background. There must be absolutely NO vertical seam, NO painted crease, NO shadow line, NO bevel, NO highlight edge, NO border, NO frame, NO fake fold, and NO separate spine strip or panel of any kind. Nothing anywhere may suggest the image is divided into sections. The real spine and folds are production geometry added later.

FRONT COVER, the right-hand portion: one white girl of about ten or eleven, drawn as a modern editorial illustration. Confident, relaxed and approachable, in a simple natural seated or standing pose, looking calmly toward the viewer. Ordinary everyday clothes — a plain t-shirt and jeans. Natural hair, natural face, no makeup, no glamour, no jewellery, no princess styling, no sexualised pose. Fully clothed, drawn simply and respectfully. NO other people.

Around her, only a few restrained everyday cues to growing up, tidily spaced and never overlapping her face or the title: a wrapped sanitary pad, a small deodorant stick, a simple soft training or sports bra, and a hair tie. Four objects at most. Clear and tasteful, NOT a cluttered collage, NOT cosmetics, NOT a makeup bag or toiletry pouch.

The front must instantly communicate: a girl, puberty, periods, ages eight to twelve.

BACK COVER, the left-hand portion: this must look deliberately designed, NOT empty and NOT unfinished. Use the same palette and the same visual language as the front — soft coral and raspberry shapes, a few small navy dots or fine line accents, one or two simple leaf or arc forms. Keep them light and well spaced so text sitting on top stays easy to read. Do not overcrowd it, and place no figure and no large object there.

LOWER-LEFT AREA of the back cover: the background artwork must run straight through this area completely uninterrupted, exactly as it does everywhere else. Simply place no text, no faces and no objects in the lower-left. Do NOT draw a box, a rectangle, a panel, a frame, a label, a placeholder, a white patch or a lighter area of any kind anywhere on the cover. There is no reserved shape — a barcode is printed on top of the finished artwork later, so nothing should mark where it goes.

PALETTE: cream background with coral and muted raspberry, deep navy for contrast, and small teal accents where useful. Clean and commercial, appropriate for a girl aged eight to twelve and not embarrassing for an older girl to carry. Avoid loud pink and purple princess styling, butterflies, hearts and floating doodles.`;

const VERSION_A = `${ART}

TEXT: render exactly the following, and nothing else. Spell every word exactly as written.

FRONT COVER — right-hand portion, generous clear space, at least one tenth of the image width between any letter and the right edge, never crowding the girl:

  Title, dominant, the largest thing on the cover, readable at thumbnail size:
    BEFORE YOU NEED IT

  Subtitle beneath it, clearly smaller and secondary, broken across lines so
  that the words "Periods", "Puberty" and "For Girls 8-12" each land clearly
  and read at thumbnail size:
    A Mother's Honest Guide to Periods, Puberty, and Everything Nobody Explains - For Girls 8-12

BACK COVER — left-hand portion, set as a readable text column in the upper and
middle area, keeping all copy out of the lower-left corner area:

  Two paragraphs of main sales copy, the primary text on the back:
    Puberty can start before you feel ready for it. Periods, body changes, bras, sweat, moods, discharge, shaving, friendships, boundaries - suddenly there are a lot of things nobody seems to explain clearly.

    Before You Need It gives girls ages 8-12 the honest answers first, in plain language, without making growing up feel scary, embarrassing, or weird. It explains what may happen, what is normal, what deserves attention, and what to do when you are unsure - so you do not have to figure everything out after it happens.

  Then, underneath and visually SMALLER and quieter than the two paragraphs above:
    Every medical fact in this book is sourced - to the American Academy of Pediatrics, the American College of Obstetricians and Gynecologists, the FDA and the National Institutes of Health among others, listed chapter by chapter at the back.

Do NOT draw any box, rectangle, panel, frame, placeholder or blank patch anywhere. Render NO other text anywhere in the image: no author name, no person's name, no spine lettering, no publisher, no logo, no strapline, no price, no barcode, no numbers, no page references, no captions, no additional claims.`;

const VERSION_B = `${ART}

TEXT: render NO text anywhere in the image. No title, no subtitle, no back-cover copy, no author name, no spine lettering, no publisher, no logo, no strapline, no price, no barcode, no numbers, no captions, no letterforms of any kind. Leave clear uncluttered space in the right-hand portion where the title will be typeset later, and a clear readable column in the upper and middle left-hand portion where back-cover copy will be typeset later.`;

const RUNS = [
  { id: 'A', label: 'production cover, with front and back copy', prompt: VERSION_A },
  { id: 'B', label: 'clean art, no text anywhere', prompt: VERSION_B },
];

console.log('BEFORE YOU NEED IT — cover source art');
console.log(`  model    gpt-image-2 (OPENAI_IMAGE_MODEL)`);
console.log(`  size     1536x1024, quality high`);
console.log(`  wrap     11.664368 x 8.75in, spine 0.414368in, folds at 48.2% / 51.8%`);
console.log(`  cost     2 x ~$${AVG_COST_PER_IMAGE_USD.toFixed(2)} = ~$${(2 * AVG_COST_PER_IMAGE_USD).toFixed(2)}\n`);

for (const run of RUNS) {
  console.log(`generating version ${run.id} — ${run.label} ...`);
  const img = await generateImage({ prompt: run.prompt, size: '1536x1024', quality: 'high' });
  const png = `${OUT}/BYNI-cover-wrap-art-${run.id}_1536x1024.png`;
  writeFileSync(png, img.pngBuffer);
  writeFileSync(`${OUT}/BYNI-cover-wrap-art-${run.id}.prompt.txt`, run.prompt);
  console.log(
    `  ${img.widthPx}x${img.heightPx}  model=${img.model}  ` +
      `sha256=${createHash('sha256').update(img.pngBuffer).digest('hex').slice(0, 16)}…`,
  );
  console.log(`  -> ${png}\n`);
}
console.log('done — no cover PDF built, no text typeset, nothing placed.');
process.exit(0);
