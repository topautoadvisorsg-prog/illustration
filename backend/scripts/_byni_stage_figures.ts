/**
 * BEFORE YOU NEED IT — stage the approved figures under stable names.
 *
 * NAMED BY CHAPTER, NOT BY PAGE. The retired set was named p015-, p036-, p045-
 * and so on, and every one of those numbers was wrong within a day — the book
 * moved 184 -> 175 -> 174 -> 173 -> 172 while the filenames stayed put. A
 * chapter does not move.
 *
 * Also knocks the near-white generated background out to pure white. These come
 * back at 253-254 rather than 255, which prints as a faint grey panel on the
 * page — the same defect the first illustration set hit.
 *
 *   yarn tsx scripts/_byni_stage_figures.ts
 *
 * Local and free. Copies only; the originals in Downloads are not touched.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { OUT_DIR } from './before-you-need-it-config.js';

const DL = 'C:/Users/jovan/Downloads';
const OUT = `${OUT_DIR}/figures`;
mkdirSync(OUT, { recursive: true });

interface Fig {
  id: string;
  from: string;
  chapter: string;
  teaches: string;
  alt: string;
}

const FIGURES: Fig[] = [
  {
    id: 'ch03-breast-bud',
    from: `${DL}/Understanding Breast Buds_ A Simple Guide.png`,
    chapter: 'Chapter 3 — Breasts and bras',
    teaches:
      'That the firm lump a girl can feel is directly beneath the nipple and is normal development, not something to fear.',
    alt: 'A side-view diagram of a breast bud. The nipple is labelled on the outside, and directly beneath it a small firm disc is labelled as the breast bud. A note says this can happen on one side first, then the other.',
  },
  {
    id: 'ch03-bra-types',
    from: `${DL}/Three Common Bra Types Guide.png`,
    chapter: 'Chapter 3 — Breasts and bras',
    teaches:
      'How to tell a soft crop top or bralette from a regular bra and from a sports bra, so she can ask for the right one by name.',
    alt: 'Three bras shown one above the other and labelled: a soft crop top or bralette, soft and stretchy and often the first kind people try; a regular bra with more structure and sizing, which may have cups, hooks or underwires; and a sports bra, made to hold things still during movement, sports or PE.',
  },
  {
    id: 'ch06-three-openings',
    from: `${DL}/Three Separate Openings Anatomy Guide.png`,
    chapter: 'Chapter 6 — What a period is',
    teaches:
      'That there are three separate openings, each with its own job, so period blood and a tampon have nothing to do with urinating.',
    alt: 'A simple front-view diagram titled Three separate openings, labelled from front to back: the urethra, where pee comes out; the vaginal opening, where period blood comes out and where tampons go; and the anus, where poop comes out. A note says each opening has its own job.',
  },
  {
    id: 'ch06-menstrual-cycle',
    from: `${OUT_DIR}/illustrations-v2/menstrual-cycle.png`,
    chapter: 'Chapter 6 — What a period is',
    teaches:
      'That the cycle is a loop of four stages: the lining builds up, an ovary releases an egg, the egg is not needed and breaks down, and the lining then comes away.',
    alt: 'A four-stage ring diagram of the menstrual cycle. One: the lining builds up, which takes roughly two weeks. Two: an ovary releases an egg, one egg from one ovary. Three: the egg is not needed and breaks down. Four: the lining comes away over several days. Arrows show the stages returning to the start, and a note says the whole thing then starts again.',
  },
  {
    id: 'ch09-tampon-angle',
    from: `${DL}/Minimalist Tampon Insertion Guide.png`,
    chapter: 'Chapter 9 — The products, and how each one works',
    // The arrow variant ("How to Angle a Tampon") is superseded. The owner's
    // final approved figure is the simplified one: title "Using a Tampon", no
    // arrow, caption "Push gently until it feels comfortable."
    teaches:
      'Where a tampon actually sits once it is in, and that it goes in gently rather than being forced — the anatomy behind the book’s “if it hurts, stop”.',
    alt: 'A side-view cross-section titled Using a Tampon. A tampon and its applicator are shown in place in the vagina with the string hanging outside the body; the uterus and bladder are drawn in outline and the base of the spine sits behind. A note at the foot says: push gently until it feels comfortable.',
  },
];

const manifest: unknown[] = [];
for (const f of FIGURES) {
  if (!existsSync(f.from)) {
    console.error(`MISSING: ${f.from}`);
    continue;
  }
  const src = readFileSync(f.from);
  const meta = await sharp(src).metadata();
  // Lift near-white to pure white so no faint panel prints behind the figure.
  // WHITE POINT AT 250, NOT `.linear(1, 0)`. That was the original operation
  // here and it is a no-op -- multiply by one, add zero -- so for four of the
  // five figures the near-white ground survived untouched at 253-254 and
  // printed as a faint grey panel, which is the exact defect this step exists
  // to prevent. The 250-254 band is 70-90% of a generated figure (the ground);
  // designed light greys sit below 240. Mapping 250 -> 255 through the origin
  // flattens the ground and leaves the linework's tone alone.
  const cleaned = await sharp(src)
    .greyscale()
    .linear(255 / 250, 0)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(`${OUT}/${f.id}.png`, cleaned);
  writeFileSync(`${OUT}/${f.id}.alt.txt`, f.alt);
  const sha = createHash('sha256').update(cleaned).digest('hex');
  console.log(`${f.id.padEnd(22)} ${meta.width}x${meta.height}  sha ${sha.slice(0, 12)}…  ${f.chapter}`);
  manifest.push({
    id: f.id,
    file: `${f.id}.png`,
    chapter: f.chapter,
    // The field the prevention rule requires: if you cannot say what it teaches,
    // it does not get placed.
    teaches: f.teaches,
    alt: f.alt,
    sha256: sha,
    widthPx: meta.width,
    heightPx: meta.height,
  });
  copyFileSync(f.from, `${OUT}/_original-${f.id}.png`);
}
writeFileSync(`${OUT}/FIGURE-MANIFEST.json`, JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.length} figures staged -> ${OUT}`);
console.log('Originals preserved as _original-*.png. Nothing placed.');
process.exit(0);
