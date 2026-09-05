/**
 * BEFORE YOU NEED IT — the seven approved interior illustrations.
 *
 * Style is the production profile's own `bw-educational-clearline`, quoted from
 * `publishing-standard/style-dna.ts` rather than reinvented:
 *
 *   "clean, confident vector-weight line drawing with flat grey tone fills.
 *    Reads as a well-made modern explainer or instructional guide, not as a
 *    period plate, not as a comic, not as a medical textbook."
 *   "Calm, plain-spoken and matter-of-fact... warm and approachable without
 *    being cute, jokey or babyish."
 *
 * SUBJECT POLICY, from `bw-educational-nonfiction.ts`, also quoted rather than
 * invented: prefer a diagram or labelled process over a decorative scene;
 * prefer objects, gear and step sequences over depictions of bodies; keep any
 * figure non-identifying; anatomy schematic and clinical only, never
 * naturalistic. No page here depicts a person.
 *
 * SIZE. 1536x1024 placed at roughly 3.5in wide is about 440 DPI — genuinely
 * native at placement size, which is what the companion book's interior plates
 * achieved and what its COVER did not.
 *
 *   yarn tsx scripts/before-you-need-it-illustrations.ts
 *
 * PAID: seven gpt-image-2 generations.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { generateImage } from '../src/services/openai/openai.js';
import { AVG_COST_PER_IMAGE_USD } from '../src/services/cost/estimate.js';

const OUT = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/illustrations';
mkdirSync(OUT, { recursive: true });

const STYLE = `Black and white editorial illustration for an educational nonfiction book, in a contemporary clear-line style: clean confident vector-weight linework with flat grey tone fills. Simple uncluttered forms, generous empty space, a single clear idea. Calm, plain-spoken and matter-of-fact — made for a twelve-year-old, not a six-year-old. Warm and approachable without being cute, jokey or babyish.

STRICTLY black, white and flat greys only. NO colour of any kind, not even a tint. Plain white background, no border, no frame, no panel, no drop shadow, no vignette, no texture, no watermark, no signature.

NO text, NO letters, NO numbers, NO labels, NO captions anywhere in the image.

NOT photorealistic, NOT a comic, NOT a coloring-book outline, NOT a medical textbook plate, NOT an engraving, NOT a children's storybook picture. No people, no faces, no bodies, no anatomy.`;

interface Slot {
  page: number;
  id: string;
  anchorLine: string;
  alt: string;
  subject: string;
}

/**
 * Anchored to the closing sentence of each chapter, not to a page number, so a
 * repagination cannot move the art away from what it belongs to.
 */
const SLOTS: Slot[] = [
  {
    page: 15,
    id: 'p015-preparedness-pouch',
    anchorLine: 'Ruby got the information afterwards. Tess got it first. Neither of',
    alt: 'A small zipped pouch tucked into the front pocket of a school bag, closed and waiting.',
    subject:
      'A small zipped fabric pouch tucked into the open front pocket of an ordinary school backpack, seen from the side. The pouch is closed. The bag rests upright on a plain surface. Quiet, tidy, unremarkable — something already packed and waiting. Two objects only: the bag and the pouch.',
  },
  {
    page: 36,
    id: 'p036-sequence-not-schedule',
    anchorLine: 'So: find yourself, do the arithmetic, and then go and be eleven.',
    alt: 'A row of small marks spaced unevenly along a line, showing an order of events rather than a timetable.',
    subject:
      'A simple abstract diagram: a single horizontal line with five small solid circles sitting along it at clearly UNEVEN intervals — some close together, some far apart. No ruler marks, no ticks at regular spacing, no arrowheads, nothing that reads as a measuring scale or a calendar. It must say "these happen in this order" and never "these happen on a schedule".',
  },
  {
    page: 45,
    id: 'p045-folded-bra-on-chair',
    anchorLine: 'Ruby wore that bra eventually. About five weeks later, once nobody',
    alt: 'A soft folded bra resting over the back of a plain wooden chair.',
    subject:
      'A simple soft training bra, folded once, resting over the back rail of a plain wooden chair. Seen from a little to one side. Undramatic and domestic, the way something is left when it is not being thought about. Object only — no figure, no body.',
  },
  {
    page: 55,
    id: 'p055-deodorant-and-hairbrush',
    anchorLine: 'thing I can do about it now is make sure you get the information',
    alt: 'A deodorant stick and a hairbrush standing together on a plain shelf.',
    subject:
      'A deodorant stick standing upright beside a flat hairbrush lying on its back, both on a plain narrow shelf. Ordinary, specific, everyday objects, evenly lit. Two objects only, well spaced.',
  },
  {
    page: 73,
    id: 'p073-cycle-four-steps',
    anchorLine: 'Now somebody has. It took a page and a half.',
    alt: 'A four-step loop diagram: the lining builds, an egg is released, nothing happens to it, the lining comes away — returning to the start.',
    subject:
      'A clean four-step cycle diagram: four equal simple round nodes arranged in a ring, joined by four curved arrows all flowing the same way, so the last returns to the first. Each node holds a very simple abstract symbol — a thickening band, a small dot leaving a curve, a plain dot alone, and the band coming away. Schematic and geometric, an explainer diagram, NOT an anatomical drawing of a body or an organ.',
  },
  {
    page: 125,
    id: 'p125-volume-dial',
    anchorLine: 'You are not becoming a difficult person. You',
    alt: 'A round volume dial turned well up, its pointer high on the scale.',
    subject:
      'A single round volume dial or knob, seen face on, its pointer turned clearly upward and to the right. A simple arc of small marks around it showing the sweep. Purely abstract and mechanical. Nothing about distress, no face, no figure, no exclamation.',
  },
  {
    page: 143,
    id: 'p143-two-seedlings',
    anchorLine: 'You will not be able to stop noticing. You can stop treating what',
    alt: 'Two seedlings of different heights growing in the same tray of soil.',
    subject:
      'Two young seedlings growing side by side in one long shallow tray of soil. One is noticeably taller than the other. Both are healthy, upright and well rooted, drawn with equal care and equal detail so neither reads as better or as behind. No measuring stick, no ruler, no scale, no comparison marks.',
  },
];

console.log('BEFORE YOU NEED IT — interior illustrations');
console.log(`  model  gpt-image-2   size 1536x1024   quality high`);
console.log(`  slots  ${SLOTS.length}`);
console.log(`  cost   ${SLOTS.length} x ~$${AVG_COST_PER_IMAGE_USD.toFixed(2)} = ~$${(SLOTS.length * AVG_COST_PER_IMAGE_USD).toFixed(2)}\n`);

const manifest: unknown[] = [];
for (const s of SLOTS) {
  console.log(`p${s.page} — ${s.id} ...`);
  const prompt = `${STYLE}\n\nSUBJECT: ${s.subject}`;
  const img = await generateImage({ prompt, size: '1536x1024', quality: 'high' });
  const png = `${OUT}/${s.id}.png`;
  writeFileSync(png, img.pngBuffer);
  writeFileSync(`${OUT}/${s.id}.prompt.txt`, prompt);
  const sha = createHash('sha256').update(img.pngBuffer).digest('hex');
  console.log(`   ${img.widthPx}x${img.heightPx}  sha256 ${sha.slice(0, 16)}…  -> ${png}\n`);
  manifest.push({
    page: s.page,
    id: s.id,
    file: `${s.id}.png`,
    sha256: sha,
    widthPx: img.widthPx,
    heightPx: img.heightPx,
    model: img.model,
    /** Anchored to text, never to a page number, so repagination cannot orphan it. */
    anchor: { anchor_line: s.anchorLine, occurrences: 1, unique_alone: true, qualified_by: null },
    alt: s.alt,
  });
}
writeFileSync(`${OUT}/ILLUSTRATION-MANIFEST.json`, JSON.stringify(manifest, null, 2));
console.log(`manifest -> ${OUT}/ILLUSTRATION-MANIFEST.json`);
console.log('nothing placed in the interior yet.');
process.exit(0);
