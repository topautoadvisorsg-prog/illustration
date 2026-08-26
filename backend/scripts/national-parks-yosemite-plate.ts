/**
 * THE YOSEMITE CHAPTER-END PLATE for 7 NATIONAL PARKS, in the locked Doré style.
 *
 * Yosemite was the one park chapter with no closing plate. Its chapter end, p79
 * in the 118-page block, carries two lines of text and 7.39in of white beneath
 * them — the largest empty area left in the book, and larger than either page
 * the two full portrait plates already occupy.
 *
 * A FULL PORTRAIT PLATE, not an endpiece. The weight is chosen by what the
 * reader meets overleaf, exactly as the four earlier ones were: p80 is an
 * ordinary parity blank, so this plate has the spread to itself and does not
 * compete with a part divider. Sized 3.90 x 5.85in to match the two other full
 * plates rather than inventing a third size for one page.
 *
 * STAMPED, NEVER FLOWED. Drawn onto the finished PDF at fixed coordinates
 * anchored to a stable block id, so the page count the printed spine is
 * computed from cannot move.
 *
 *   npx tsx scripts/national-parks-yosemite-plate.ts --prompt
 *   npx tsx scripts/national-parks-yosemite-plate.ts --generate --confirm
 *   npx tsx scripts/national-parks-yosemite-plate.ts --stamp
 *
 * `--prompt` and `--stamp` are free. `--generate` SPENDS about $0.05, once.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { COMPOSITION, FORBIDDEN, STYLE } from './national-parks-plate-style.js';

const OUT_DIR = 'C:/Users/jovan/Downloads/_np_build/plates';
const ID = 'p79';
const PAGE = 79;
const WIDTH_IN = 3.9;
const HEIGHT_IN = 5.85;

const SUBJECT = [
  'SUBJECT — the granite valley, from the high country looking in.',
  'A monumental granite dome and a sheer cliff wall rising out of a deep valley, seen from a rocky',
  'foreground ledge that falls away steeply. The far wall is a single vast unbroken face of stone,',
  'its vertical fracture lines described in fine parallel burin strokes, catching low sun along one',
  'side while the valley floor below stays in deep velvety shadow. A thin waterfall drops down the',
  'cliff face in a long ribbon. Wind-shaped conifers cling to the rock in the near foreground, small',
  'against the wall to carry the scale. High cloud drifting in engraved line above the rim.',
  'No people, no vehicles, no buildings.',
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
  console.log(`${ID} -> page ${PAGE}, full portrait plate, ${WIDTH_IN} x ${HEIGHT_IN} in.`);
  console.log('Nothing generated, nothing spent.');
  process.exit(0);
}

if (argv.includes('--generate')) {
  if (!argv.includes('--confirm')) {
    console.error('REFUSING: --generate produces one paid image, about $0.05. Re-run with --confirm.');
    process.exit(1);
  }
  await import('../src/env.js');
  const { generateImage } = await import('../src/services/openai/openai.js');
  const sharp = (await import('sharp')).default;

  /**
   * ONE SHOT. No retry loop: a transient error must never quietly double the
   * spend. A failure is named and re-running is a deliberate act.
   */
  const t0 = Date.now();
  const result = await generateImage({ prompt: PROMPT, size: '1024x1536', quality: 'high' });
  writeFileSync(`${OUT_DIR}/plate-${ID}-raw.png`, result.pngBuffer);
  /** 2x, as every other plate in this set, so the placement is not held small by pixels. */
  const up = await sharp(result.pngBuffer)
    .resize(result.widthPx * 2, result.heightPx * 2, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(`${OUT_DIR}/plate-${ID}.png`, up);
  console.log(
    `${((Date.now() - t0) / 1000).toFixed(1)}s  ${result.widthPx}x${result.heightPx}` +
      ` -> ${result.widthPx * 2}x${result.heightPx * 2}  ->  ${OUT_DIR}/plate-${ID}.png`,
  );
  process.exit(0);
}

if (!argv.includes('--stamp')) throw new Error('pass --prompt, --generate --confirm, or --stamp');

await import('../src/env.js');
process.env.CHROMIUM_PATH ??= 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const { P } = await import('./_project.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');
const { getProject, updateProjectConfig } = await import('../src/db/repositories/projects.repo.js');
const { buildTypesetInterior } = await import('../src/pipeline/typeset/build-typeset-interior.js');
const { getProjectStorage } = await import('../src/services/storage/project-storage.js');

const project = await getProject(P);
if (!project) throw new Error(`project ${P} not found`);
const config = ProjectConfigSchema.parse(project.config);

/**
 * The anchor is resolved against a build with NO illustrations configured, so it
 * comes from the pagination the book actually has rather than from one that
 * already carries art. Stamping does not move pagination, so the two agree.
 */
console.log('building clean interior to resolve the anchor…');
const clean = await buildTypesetInterior(P, { ...config, illustrations: {} }, { chaptersStartRecto: true });
console.log(`clean interior: ${clean.pageCount} pages`);

const blocks = clean.report.pageBlocks[PAGE] ?? [];
if (blocks.length === 0) throw new Error(`p${PAGE} carries no blocks — cannot anchor`);
const blockId = blocks[blocks.length - 1]!;

const sharp = (await import('sharp')).default;
const src = sharp(readFileSync(`${OUT_DIR}/plate-${ID}.png`));
const meta = await src.metadata();
const nativeWidthPx = meta.width ?? 0;
const nativeHeightPx = meta.height ?? 0;
const ppi = Math.round(nativeWidthPx / WIDTH_IN);
console.log(`anchor ${blockId} on p${PAGE}  ${WIDTH_IN}x${HEIGHT_IN}in  ${nativeWidthPx}x${nativeHeightPx}px  ${ppi} PPI`);
if (ppi < 300) throw new Error(`REFUSING: ${ppi} PPI is below the 300 print gate`);

/**
 * Greyscale JPEG, not PNG. pdf-lib's embedPng expands a greyscale PNG to
 * DeviceRGB, which puts a colour space on a page in a black-and-white book, and
 * KDP prices an interior by what its pages declare. A single-component JPEG
 * embeds as DeviceGray and stays grey.
 */
const bytes = await src.grayscale().toColourspace('b-w').jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
const storage = getProjectStorage();
const stored = await storage.writeProjectFile(P, ['illustrations', `plate-${ID}.jpg`], bytes);

const illustrations = {
  ...(config.illustrations ?? {}),
  [blockId]: {
    rawAssetPath: stored.relativePath,
    approvedAssetPath: stored.relativePath,
    version: 1,
    nativeWidthPx,
    nativeHeightPx,
    placementWidthIn: WIDTH_IN,
    placementHeightIn: HEIGHT_IN,
    status: 'approved',
    model: 'gpt-image-2',
    subject: 'Yosemite chapter-end plate — the granite valley from the high country',
    note: `Dore-inspired B&W engraving. Destination p${PAGE} in the 118-page build.`,
    createdAt: new Date().toISOString(),
  },
};

await updateProjectConfig(P, ProjectConfigSchema.parse({ ...config, illustrations }));
console.log(`illustrations: ${Object.keys(config.illustrations ?? {}).length} -> ${Object.keys(illustrations).length}`);
console.log(`${stored.relativePath} (${bytes.length} bytes)`);
console.log('written. Rebuild the interior to stamp it.');
process.exit(0);
