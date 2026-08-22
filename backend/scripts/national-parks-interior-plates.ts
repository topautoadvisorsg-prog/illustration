/**
 * The five approved INTERIOR plates, in the locked Doré-inspired engraving style.
 *
 * BLACK AND WHITE, always. The cover is full colour and the interior is not, and
 * the two rules are separate — an earlier pass had one profile trying to hold
 * both and the style DNA quietly won.
 *
 * PORTRAIT, always. Each plate is composed for the vertical slot it will
 * actually occupy on a 6x9 page. Nothing here is generated wide and cropped
 * down: the destination aspect is an input, not an afterthought.
 *
 * Generated at 1024x1536 and upscaled 2x, because 1024px across a 3.4in
 * placement is exactly 300 DPI with nothing spare. The upscale buys headroom so
 * the plates can be placed larger and stay print-sharp.
 *
 *   npx tsx scripts/national-parks-interior-plates.ts <outDir> --confirm [--only=p10]
 */
import { writeFileSync } from 'node:fs';

await import('../src/env.js');

const OUT_DIR = process.argv[2];
if (!OUT_DIR) throw new Error('usage: national-parks-interior-plates.ts <outDir> --confirm [--only=p10]');
if (!process.argv.includes('--confirm')) {
  console.error('REFUSING: this generates paid images. Re-run with --confirm.');
  process.exit(1);
}
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];

/**
 * THE STYLE BLOCK — identical on every plate, so the five read as one set.
 *
 * Doré-inspired means the LANGUAGE of nineteenth-century steel engraving: burin
 * line, dense cross-hatch shadow, luminous open sky, theatrical scale. It does
 * not mean copying any existing plate, and it must not drift toward modern
 * vector illustration or comic linework.
 *
 * "No greys, no halftone" matters practically rather than stylistically: a
 * black-and-white interior prints line art at one ink density, and a grey wash
 * either bands or disappears.
 */
const STYLE = [
  'STYLE — hold this exactly:',
  'A black-and-white engraving in the manner of nineteenth-century steel-plate and wood engraving,',
  'in the tradition of Gustave Doré: burin line, dense cross-hatching, dramatic chiaroscuro, deep',
  'velvety shadow against luminous open sky, and a theatrical sense of scale where the landscape',
  'dwarfs any human figure. Fine, disciplined line detail throughout — rock strata, foliage and cloud',
  'all described by line, never by wash.',
  '',
  'PURE BLACK INK ON WHITE. No colour of any kind. No greys, no gradients, no halftone dots, no',
  'airbrush, no digital blur — every tone built from hatching, cross-hatching and stipple, because a',
  'black-and-white book prints line art at a single ink density.',
  '',
  'Serious, elegant and timeless. NOT cartoon, NOT comic-book, NOT modern flat vector, NOT clip art,',
  'NOT photographic, NOT painterly wash. Detailed but READABLE at printed size: the main shapes must',
  'still separate when the plate is only three and a half inches wide.',
].join('\n');

const COMPOSITION = [
  'COMPOSITION — this is a PORTRAIT plate for a 6x9 book page:',
  'Vertical composition, taller than it is wide, designed for a tall narrow slot. Build the image in',
  'clear depth layers from foreground to far distance so the eye travels up and back through it.',
  'Keep the important subject CENTRED and well inside the frame — nothing critical near the left or',
  'right edge. Leave calm, open space toward the top so the plate breathes and does not read as a',
  'crowded poster.',
].join('\n');

const FORBIDDEN = [
  'MUST NOT INCLUDE: no text, no letters, no numbers, no caption, no title, no signature, no',
  'monogram, no watermark, no logo, no page number. No decorative border, frame, rule or vignette',
  'box. No colour. No modern objects — no vehicles, no power lines, no signage with writing, no',
  'buildings. No visible faces.',
  '',
  'OUTPUT: white background, image running to the edges of the canvas, no matting and no margins.',
].join('\n');

interface Plate {
  id: string;
  page: number;
  purpose: string;
  subject: string;
}

const PLATES: Plate[] = [
  {
    id: 'p10',
    page: 10,
    purpose: 'Part 1 divider — BEFORE YOU GO',
    subject: [
      'SUBJECT — entering the journey.',
      'A narrow foot trail in the foreground leads away from the viewer and into deep old-growth',
      'conifer forest. A simple weathered wooden trail post stands beside the path, its arm BLANK and',
      'unlettered. Beyond and above the trees, a mountain wall rises into bright open sky. Morning',
      'light rakes through the trunks and throws long shadows across the path. No people.',
    ].join('\n'),
  },
  {
    id: 'p22',
    page: 22,
    purpose: 'Part 2 divider — THE SEVEN PARKS',
    subject: [
      'SUBJECT — the monumental parks.',
      'A towering range of peaks stacked in receding planes, seen from a low vantage so the summits',
      'loom. The summits are deliberately varied in character — a rounded granite dome, a flat-topped',
      'mesa with horizontal strata, a sharp alpine spire, a broad forested shoulder — so the range',
      'reads as several different places gathered into one view. A dark conifer treeline runs across',
      'the lower third. Sunlight breaks between the peaks into a luminous sky. No people.',
    ].join('\n'),
  },
  {
    id: 'p68',
    page: 68,
    purpose: 'Chapter-end plate — end of Grand Canyon',
    subject: [
      'SUBJECT — a canyon overlook.',
      'A vast desert canyon seen from a high rim. Layered horizontal rock strata step down and away in',
      'receding terraces, each band described by fine parallel hatching, with deep shadow pooling in',
      'the gorge below. A dark rock outcrop anchors the foreground at the bottom of the frame. Far',
      'above, a wide luminous sky with long banded cloud. Immense, still and quiet. No people.',
    ].join('\n'),
  },
  {
    id: 'p89',
    page: 89,
    purpose: 'Chapter-end plate — end of Rocky Mountain',
    subject: [
      'SUBJECT — an alpine ridge above the treeline.',
      'A high rocky ridgeline of broken granite and scree rising steeply, with the last stunted,',
      'wind-bent conifers clinging at the lower edge and bare rock above them. Patches of old snow lie',
      'in the shaded gullies. Clouds stream across a bright cold sky behind the ridge. Thin air,',
      'severe and exposed. No people.',
    ].join('\n'),
  },
  {
    id: 'p100',
    page: 100,
    purpose: 'Part 3 divider — AFTER YOU’RE HOOKED',
    subject: [
      'SUBJECT — the journey continuing.',
      'Seen from behind and slightly below, a trail climbs over the crest of a near ridge in the',
      'foreground and carries on down the far side toward range after range of distant peaks fading',
      'into bright haze. The near ground is dark and heavily hatched; the far ranges are light and',
      'open, so the eye is drawn outward into the distance. A sense of more country ahead. No people.',
    ].join('\n'),
  },
];

const { generateImage } = await import('../src/services/openai/openai.js');
const sharp = (await import('sharp')).default;

for (const plate of PLATES) {
  if (only && only !== plate.id) continue;
  const prompt = [
    `A single black-and-white engraved illustration for the interior of a printed book.`,
    '',
    plate.subject,
    '',
    COMPOSITION,
    '',
    STYLE,
    '',
    FORBIDDEN,
  ].join('\n');

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`${plate.id} (page ${plate.page}) — ${plate.purpose}`);
  const t0 = Date.now();
  const result = await generateImage({ prompt, size: '1024x1536', quality: 'high' });
  const rawPath = `${OUT_DIR}/plate-${plate.id}-raw.png`;
  writeFileSync(rawPath, result.pngBuffer);

  /**
   * 2x upscale. 1024px across a 3.41in placement is exactly 300 DPI with nothing
   * spare; doubling it allows the plate to be placed up to 6.8in wide and still
   * be print-sharp. Lanczos on line art stays crisp — this is not inventing
   * detail, it is refusing to be the reason the placement has to stay small.
   */
  const up = await sharp(result.pngBuffer)
    .resize(result.widthPx * 2, result.heightPx * 2, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const upPath = `${OUT_DIR}/plate-${plate.id}.png`;
  writeFileSync(upPath, up);

  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s  raw ${result.widthPx}x${result.heightPx} -> ${result.widthPx * 2}x${result.heightPx * 2}`);
  console.log(`  ${upPath} (${up.length} bytes)`);
}

console.log('\nall plates written. Nothing stamped yet.');
process.exit(0);
