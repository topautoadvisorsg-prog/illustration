/**
 * FOUR CHAPTER-END PLATES for 7 NATIONAL PARKS, in the locked Doré style.
 *
 * The five approved plates fill the three part dividers and two chapter ends.
 * Four more chapter endings were left with several inches of white beneath the
 * last line — Zion, Yellowstone, Acadia and the closing chapter. These fill them.
 *
 * TWO WEIGHTS, chosen by what the reader meets overleaf:
 *
 *   p41  Zion         full portrait plate, as p68 and p89 are: an ordinary
 *   p53  Yellowstone  parity blank follows, so the plate has the spread to itself
 *
 *   p101 Acadia       restrained endpiece: PART 3 follows
 *   p109 Chapter 12   restrained endpiece: the back-matter opener follows
 *
 * A full plate against a part divider would be two strong pages fighting across
 * one spread, so those two close quietly instead.
 *
 * STAMPED, NEVER FLOWED. The art is drawn onto the finished PDF at fixed
 * coordinates anchored to a stable block id, so page count, folios, running
 * heads and every line box are untouched by construction. That matters here
 * more than usual: the spine of a printed cover is computed from the page count.
 *
 *   npx tsx scripts/national-parks-endpieces.ts --prompts
 *   npx tsx scripts/national-parks-endpieces.ts --generate --confirm
 *
 * `--prompts` is free. `--generate` SPENDS roughly $0.05 per image.
 */
import { writeFileSync } from 'node:fs';
import { COMPOSITION, ENDPIECE_COMPOSITION, FORBIDDEN, STYLE } from './national-parks-plate-style.js';

const OUT_DIR = 'C:/Users/jovan/Downloads/_np_build/plates';

interface Endpiece {
  id: string;
  page: number;
  weight: 'plate' | 'endpiece';
  purpose: string;
  subject: string;
}

const PLATES: Endpiece[] = [
  {
    id: 'p41',
    page: 41,
    weight: 'plate',
    purpose: 'Zion chapter ending',
    subject: [
      'SUBJECT — the narrow canyon, looking up.',
      'A slot canyon of sheer sandstone walls rising close on both sides, their horizontal strata',
      'described in fine parallel burin lines. A shallow river runs out of the gap toward the viewer',
      'over a cobbled bed. Far above and between the walls, a bright wedge of open sky, with one',
      'cottonwood catching the light on a ledge. Deep velvety shadow low in the canyon, luminous',
      'stone at the rim. No people.',
    ].join('\n'),
  },
  {
    id: 'p53',
    page: 53,
    weight: 'plate',
    purpose: 'Yellowstone chapter ending',
    subject: [
      'SUBJECT — the open valley at first light.',
      'A broad river valley seen from a low rise: the river winding in long curves across open',
      'sagebrush flats, a scattered herd of bison small in the middle distance, and a dark timbered',
      'ridge closing the far side. A tall column of geyser steam rises on the horizon and drifts.',
      'Foreground grasses in crisp line detail, the far ridge in massed shadow, the sky luminous and',
      'open above. No people, no vehicles.',
    ].join('\n'),
  },
  {
    id: 'p101',
    page: 101,
    weight: 'endpiece',
    purpose: 'Acadia chapter ending — PART 3 divider follows',
    subject: [
      'SUBJECT — the granite shore at dawn.',
      'A low band of rounded coastal granite ledges running left to right, the Atlantic beyond them',
      'flat and calm, and three small spruce silhouetted on the rock toward the right. A single line',
      'of brightness on the water where the sun is about to break. Nothing else. No people, no',
      'boats, no buildings, no lighthouse.',
    ].join('\n'),
  },
  {
    id: 'p109',
    page: 109,
    weight: 'endpiece',
    purpose: 'Chapter 12 ending — back-matter opener follows',
    subject: [
      'SUBJECT — the road out, at the end of the book.',
      'An empty two-lane road seen from behind, running away from the viewer and curving out of',
      'sight between low forested hills. Open sky above the hills with a few high drifting clouds in',
      'engraved line. A quiet, resolved, going-home shape. No vehicles, no people, no signs.',
    ].join('\n'),
  },
];

const argv = process.argv.slice(2);

const prompts = PLATES.map((plate) => ({
  plate,
  prompt: [
    'A single black-and-white engraved illustration for the interior of a printed book.',
    '',
    plate.subject,
    '',
    plate.weight === 'plate' ? COMPOSITION : ENDPIECE_COMPOSITION,
    '',
    STYLE,
    '',
    FORBIDDEN,
  ].join('\n'),
}));

if (argv.includes('--prompts')) {
  for (const { plate, prompt } of prompts) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`${plate.id} (page ${plate.page}, ${plate.weight}) — ${plate.purpose}\n`);
    console.log(prompt);
  }
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${PLATES.length} prompts. Nothing generated, nothing spent.`);
  process.exit(0);
}

if (!argv.includes('--generate')) throw new Error('pass --prompts or --generate');
if (!argv.includes('--confirm')) {
  console.error(`REFUSING: --generate produces ${PLATES.length} paid images, about $0.05 each. Re-run with --confirm.`);
  process.exit(1);
}

await import('../src/env.js');
const { generateImage } = await import('../src/services/openai/openai.js');
const sharp = (await import('sharp')).default;

/**
 * ONE SHOT PER PLATE, and a failure does not stop the run.
 *
 * No retry loop: a transient error must never quietly double the spend on a book
 * that is already paid for. A plate that fails is named, and re-running for that
 * one plate is a deliberate act once the cause is understood.
 */
let made = 0;
let failed = 0;
for (const { plate, prompt } of prompts) {
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`${plate.id} (page ${plate.page}, ${plate.weight}) — ${plate.purpose}`);
  const t0 = Date.now();
  try {
    const size = plate.weight === 'plate' ? '1024x1536' : '1536x1024';
    const result = await generateImage({ prompt, size, quality: 'high' });
    writeFileSync(`${OUT_DIR}/plate-${plate.id}-raw.png`, result.pngBuffer);
    /**
     * 2x upscale, as the five approved plates had. 1024px across a 3.41in
     * placement is exactly 300 DPI with nothing spare; doubling it lets the
     * plate be placed wider and stay print-sharp. Lanczos on line art stays
     * crisp — this is not inventing detail, it is refusing to be the reason the
     * placement has to stay small.
     */
    const up = await sharp(result.pngBuffer)
      .resize(result.widthPx * 2, result.heightPx * 2, { kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toBuffer();
    writeFileSync(`${OUT_DIR}/plate-${plate.id}.png`, up);
    made += 1;
    console.log(
      `  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${result.widthPx}x${result.heightPx}` +
        ` -> ${result.widthPx * 2}x${result.heightPx * 2}`,
    );
  } catch (err) {
    failed += 1;
    console.log(`  FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${err instanceof Error ? err.message : String(err)}`);
    console.log('  NOT retried.');
  }
}
console.log(`\n${made} generated, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
