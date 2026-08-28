/**
 * ONE PLATE for the Yellowstone NOBODY WARNED ME page.
 *
 * That panel could not stay whole on the page it started on, so it was given a
 * page of its own. The box fills 3.17in of a 7.75in text block — 41% — and a
 * boxed panel alone in the top two fifths of an otherwise empty leaf reads as an
 * accident rather than a decision. This fills the rest.
 *
 * SUBJECT chosen against what the panel actually says: the loop roads run for
 * ninety minutes with nothing on them, and that fact structures a visitor's
 * whole day. So the plate is distance itself.
 *
 * It must not repeat the two plates it shares a book with:
 *   p53   Yellowstone chapter end — river valley, bison, geyser steam, dawn
 *   p109  closing endpiece        — an empty road curving away between hills
 * Neither a road nor a river valley, then. Ranks of ridge receding to a pale
 * horizon: emptiness as the subject rather than as the setting.
 *
 *   npx tsx scripts/national-parks-panel-plate.ts --prompt
 *   npx tsx scripts/national-parks-panel-plate.ts --generate --confirm
 *   npx tsx scripts/national-parks-panel-plate.ts --apply
 *
 * `--prompt` is free. `--generate` SPENDS about $0.05, once, with no retry.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ENDPIECE_COMPOSITION, FORBIDDEN, STYLE } from './national-parks-plate-style.js';

const OUT_DIR = 'C:/Users/jovan/Downloads/_np_build/plates';
const ID = 'panel-p50';
const P = '92c4ab36-4956-4435-b656-d2679fbc73d9';

/** The panel block. Offset 0, so the plate lands on the panel's own page. */
const ANCHOR = 'b526d11d';
const WIDTH_IN = 4.2;
const HEIGHT_IN = 2.8;
const NATIVE_W = 3072;
const NATIVE_H = 2048;

const SUBJECT = [
  'SUBJECT — distance itself, over an empty high plateau.',
  'A very high, very wide viewpoint over an enormous empty volcanic plateau: rank behind rank of',
  'low forested ridge receding across the whole width of the plate to a pale far horizon, each rank',
  'described in lighter line than the one in front of it so the eye reads mile after mile of depth.',
  'The nearest slope falls away in the foreground in deep hatched shadow, with a scatter of',
  'lodgepole pine crowns breaking its skyline. Above it all an immense open sky, mostly clear, with',
  'a few high drifting clouds in fine engraved line.',
  'The subject is emptiness and scale: there is nothing in this landscape at all. No road, no track,',
  'no path, no water, no river, no lake, no geyser, no steam, no animals, no people, no structure of',
  'any kind. Nothing but land and sky going back a very long way.',
].join('\n');

const PROMPT = [
  'A single black-and-white engraved illustration for the interior of a printed book.',
  '',
  SUBJECT,
  '',
  ENDPIECE_COMPOSITION,
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
  const result = await generateImage({ prompt: PROMPT, size: '1536x1024', quality: 'high' });
  writeFileSync(`${OUT_DIR}/plate-${ID}-raw.png`, result.pngBuffer);
  const up = await sharp(result.pngBuffer)
    .resize(result.widthPx * 2, result.heightPx * 2, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(`${OUT_DIR}/plate-${ID}.png`, up);
  console.log(
    `${((Date.now() - t0) / 1000).toFixed(1)}s  ${result.widthPx}x${result.heightPx}` +
      ` -> ${result.widthPx * 2}x${result.heightPx * 2}  ${OUT_DIR}/plate-${ID}.png`,
  );
  console.log('Look at it before running --apply.');
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

/** Single-component JPEG, so the page stays DeviceGray. See stamp-endpieces. */
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
  subject: 'Yellowstone NOBODY WARNED ME page — distance over an empty plateau',
  note: 'Fills the page the safety panel was given to itself; the box alone covers 41% of the text block.',
  createdAt: new Date().toISOString(),
};
await updateProjectConfig(P, ProjectConfigSchema.parse({ ...config, illustrations }));
console.log(`${stored.relativePath} (${bytes.length} bytes) -> anchor ${ANCHOR}`);
console.log(`illustrations: ${Object.keys(config.illustrations ?? {}).length} -> ${Object.keys(illustrations).length}`);
process.exit(0);
