/**
 * ONE PLATE for the Rocky Mountain wildlife page.
 *
 * Chapter 9's NOBODY WARNED ME panel runs 5.03in and cannot fit the 3.60in left
 * on the page before it, so the panel moves whole to the next leaf -- correct,
 * and it leaves that page ending after "Wildlife and what to look for" with
 * 3.60in of white under it. A mid-chapter page half empty is a defect, not a
 * trade: the same one the Yellowstone panel page had, and it gets the same fix.
 *
 * SUBJECT is taken from the type directly above it: elk in Moraine Park, moose
 * in the Kawuneeche, bighorn in Horseshoe Park, and how far back to stand.
 *
 * It must not repeat the plates it shares a book with:
 *   p91  Rocky Mountain chapter end -- a summit ridge above treeline
 *   p54  Yellowstone chapter end    -- a river valley with bison and steam
 *   p50  Yellowstone panel page     -- ranks of ridge receding to a horizon
 * So: elk on a montane meadow floor at dusk, close enough to read as animals
 * rather than as landscape.
 *
 *   npx tsx scripts/national-parks-rockies-plate.ts --prompt
 *   npx tsx scripts/national-parks-rockies-plate.ts --generate --confirm
 *   npx tsx scripts/national-parks-rockies-plate.ts --apply
 *
 * `--prompt` is free. `--generate` SPENDS about $0.05, once, with no retry.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { COMPOSITION, FORBIDDEN, STYLE } from './national-parks-plate-style.js';

const OUT_DIR = 'C:/Users/jovan/Downloads/_np_build/plates';
const ID = 'rockies-p87';
const P = '92c4ab36-4956-4435-b656-d2679fbc73d9';

/** The last block on the page: "The distances: stay at least 75 feet…". */
const ANCHOR = '6bbfac57';
const WIDTH_IN = 2.333;
const HEIGHT_IN = 3.5;
const NATIVE_W = 2048;
const NATIVE_H = 3072;

const SUBJECT = [
  'SUBJECT — elk in a mountain meadow at dusk.',
  'A wide grassy park on the floor of a mountain valley in the last light. A small herd of elk',
  'stands out in the open grass in the middle distance, a bull among them with a full sweep of',
  'antlers, his head up. Behind them the meadow runs back to a wall of dark conifer timber, and',
  'above the timber a high rocky peak still catches the last of the light while the valley floor has',
  'already gone into shadow. Foreground grasses and low willow in crisp burin line. Long horizontal',
  'bands of mist lying on the meadow.',
  'The animals are the subject and must read clearly as elk at printed size. No people, no road, no',
  'track, no fence, no building, no water.',
].join('\n');

const PROMPT = [
  'A single black-and-white engraved illustration for the interior of a printed book.',
  '',
  SUBJECT,
  '',
  COMPOSITION,
  '',
  STYLE,
  '',
  FORBIDDEN,
].join('\n');

const argv = process.argv.slice(2);

if (argv.includes('--prompt')) {
  console.log(PROMPT);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`anchor ${ANCHOR}   placement ${WIDTH_IN} x ${HEIGHT_IN}in   nothing generated, nothing spent.`);
  process.exit(0);
}

if (argv.includes('--generate')) {
  if (!argv.includes('--confirm')) {
    console.error('REFUSING: --generate produces 1 paid image, about $0.05. Re-run with --confirm.');
    process.exit(1);
  }
  await import('../src/env.js');
  const { generateImage } = await import('../src/services/openai/openai.js');
  const sharp = (await import('sharp')).default;
  const t0 = Date.now();
  /** ONE SHOT. A transient failure must never quietly double the spend. */
  const result = await generateImage({ prompt: PROMPT, size: '1024x1536', quality: 'high' });
  writeFileSync(`${OUT_DIR}/plate-${ID}-raw.png`, result.pngBuffer);
  const up = await sharp(result.pngBuffer)
    .resize(result.widthPx * 2, result.heightPx * 2, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(`${OUT_DIR}/plate-${ID}.png`, up);
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${result.widthPx}x${result.heightPx} -> ${result.widthPx * 2}x${result.heightPx * 2}`);
  process.exit(0);
}

if (!argv.includes('--apply')) throw new Error('pass --prompt, --generate --confirm, or --apply');

await import('../src/env.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');
const { getProject, updateProjectConfig } = await import('../src/db/repositories/projects.repo.js');
const { getProjectStorage } = await import('../src/services/storage/project-storage.js');
const project = await getProject(P);
if (!project) throw new Error(`project ${P} not found`);
const config = ProjectConfigSchema.parse(project.config);
const sharp = (await import('sharp')).default;
const bytes = await sharp(readFileSync(`${OUT_DIR}/plate-${ID}.png`))
  .grayscale()
  .toColourspace('b-w')
  .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
  .toBuffer();
const storage = getProjectStorage();
const stored = await storage.writeProjectFile(P, ['illustrations', `plate-${ID}.jpg`], bytes);
const illustrations = { ...(config.illustrations ?? {}) };
illustrations[ANCHOR] = {
  rawAssetPath: stored.relativePath,
  approvedAssetPath: stored.relativePath,
  version: 1,
  nativeWidthPx: NATIVE_W,
  nativeHeightPx: NATIVE_H,
  placementWidthIn: WIDTH_IN,
  placementHeightIn: HEIGHT_IN,
  status: 'approved',
  model: 'gpt-image-2',
  subject: 'Rocky Mountain wildlife page — elk in a mountain meadow at dusk',
  note: 'Fills the 3.60in left when the chapter 9 safety panel moved whole to the next leaf.',
  createdAt: new Date().toISOString(),
};
await updateProjectConfig(P, ProjectConfigSchema.parse({ ...config, illustrations }));
console.log(`${stored.relativePath} (${bytes.length} bytes) -> anchor ${ANCHOR}`);
console.log(`illustrations: ${Object.keys(config.illustrations ?? {}).length} -> ${Object.keys(illustrations).length}`);
process.exit(0);
