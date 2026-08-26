/**
 * FIVE FULL-PAGE FRONTISPIECES for the parity blanks of 7 NATIONAL PARKS.
 *
 * `chaptersStartRecto` puts every chapter opening on a right-hand page, which
 * leaves five blank versos at 42, 54, 80, 92 and 106. Each of them faces a
 * chapter opening, which is the frontispiece position in a trade book: the
 * reader turns the leaf and meets a full-page plate and the chapter title
 * together across one spread.
 *
 *   p 42  faces p 43  Chapter 6  Yellowstone
 *   p 54  faces p 55  Chapter 7  Grand Canyon
 *   p 80  faces p 81  Chapter 9  Rocky Mountain
 *   p 92  faces p 93  Chapter 10 Acadia
 *   p106  faces p107  Chapter 12 Where to go next
 *
 * ANCHORED TO THE CHAPTER OPENING, NOT TO THE BLANK. A parity blank has no
 * blocks, so it cannot be an anchor. Each plate anchors to the FIRST block of
 * the chapter it faces and carries `pageOffset: -1`, so it stays welded to the
 * leaf in front of that chapter however the pagination moves.
 *
 * FOUR OF THE FIVE PARKS ALREADY HAVE A CLOSING PLATE, so each subject below is
 * deliberately a different scene from that park's endpiece: a chapter that opens
 * and closes on the same view is a chapter that looks padded.
 *
 *   npx tsx scripts/national-parks-frontispieces.ts --prompts
 *   npx tsx scripts/national-parks-frontispieces.ts --generate --confirm
 *   npx tsx scripts/national-parks-frontispieces.ts --plan
 *   npx tsx scripts/national-parks-frontispieces.ts --apply
 *
 * `--prompts`, `--plan` are free. `--generate` SPENDS about $0.05 per image.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { COMPOSITION, FORBIDDEN, STYLE } from './national-parks-plate-style.js';

const OUT_DIR = 'C:/Users/jovan/Downloads/_np_build/plates';

/**
 * 4.875 x 7.3125in: the full width of the type measure, at the 2:3 aspect the
 * generator produces, so nothing is cropped or stretched. That is the largest a
 * plate can be and still sit inside the margins the rest of the book respects.
 * A true edge-to-edge bleed would require rebuilding the whole interior at
 * 6.125 x 9.25 with bleed, which would touch all 118 pages; this touches none.
 */
const WIDTH_IN = 4.875;
const HEIGHT_IN = 7.3125;

interface Frontispiece {
  id: string;
  blankPage: number;
  facingPage: number;
  chapter: string;
  subject: string;
}

const PLATES: Frontispiece[] = [
  {
    id: 'fp42',
    blankPage: 42,
    facingPage: 43,
    chapter: 'Chapter 6 — Yellowstone',
    subject: [
      'SUBJECT — the thermal terraces, steaming at dawn.',
      'A hillside of wide stepped mineral terraces, each shelf holding a shallow pool that spills over',
      'its lip to the one below, the whole formation pale and luminous against a dark timbered slope',
      'behind. Heavy steam lifts off the water and drifts left across the frame, thinning as it rises.',
      'Dead standing trees, bleached and bare, stand in the terrace flats. Low sun rakes across the',
      'steps so each rim throws a hard shadow. No people, no boardwalk, no railings.',
    ].join('\n'),
  },
  {
    id: 'fp54',
    blankPage: 54,
    facingPage: 55,
    chapter: 'Chapter 7 — Grand Canyon',
    subject: [
      'SUBJECT — the inner gorge, from high on the rim.',
      'Looking steeply down and across an immense canyon: successive walls and flat-topped buttes',
      'stepping down and away in layered bands, each band lighter than the one in front so the depth',
      'reads for miles. Far below and small, a river threads through the narrow dark inner gorge,',
      'catching one line of light. The near rim edge cuts across the bottom corner of the frame in',
      'deep shadow to anchor the drop. Thin haze in the far distance. No people, no buildings.',
    ].join('\n'),
  },
  {
    id: 'fp80',
    blankPage: 80,
    facingPage: 81,
    chapter: 'Chapter 9 — Rocky Mountain',
    subject: [
      'SUBJECT — the alpine basin above treeline.',
      'A high cirque holding a still tarn, ringed by broken talus and snowfields that persist in the',
      'shaded gullies. Bare rounded tundra in the foreground, cropped low, with a few stunted',
      'wind-flagged trees marking the last of the treeline at the lower left. Steep grey walls rise',
      'behind the lake to a serrated ridge. Big open sky with high thin cloud in engraved line.',
      'A sense of thin cold air and great altitude. No people, no trail, no structures.',
    ].join('\n'),
  },
  {
    id: 'fp92',
    blankPage: 92,
    facingPage: 93,
    chapter: 'Chapter 10 — Acadia',
    subject: [
      'SUBJECT — the headland and the surf.',
      'A tall broken cliff of pink-grey granite dropping straight into the Atlantic, seen from slightly',
      'above and to one side. Heavy swell breaks white against the base of the rock and washes back',
      'through the fissures. Dark spruce crowd the clifftop, leaning inland from the wind. Beyond the',
      'headland the open sea runs flat to a high horizon under banked cloud, with one shaft of light',
      'on the water. No people, no boats, no lighthouse, no buildings.',
    ].join('\n'),
  },
  {
    id: 'fp106',
    blankPage: 106,
    facingPage: 107,
    chapter: 'Chapter 12 — Where to go next',
    subject: [
      'SUBJECT — the country beyond, at last light.',
      'A vast open landscape seen from a high vantage: ridge behind ridge behind ridge, receding in',
      'progressively lighter tone to a far horizon, with no single peak dominating and nothing that',
      'identifies a particular park. Low sun behind the farthest ridge throws long bands of light and',
      'shadow across the middle distance. A foreground shelf of rock and scattered pine frames the',
      'bottom of the frame. Quiet, wide and unresolved, a view of somewhere not yet visited.',
      'No people, no road, no vehicles, no buildings.',
    ].join('\n'),
  },
];

const prompts = PLATES.map((plate) => ({
  plate,
  prompt: [
    'A single black-and-white engraved illustration for the interior of a printed book.',
    '',
    plate.subject,
    '',
    COMPOSITION,
    '',
    STYLE,
    '',
    FORBIDDEN,
  ].join('\n'),
}));

const argv = process.argv.slice(2);

if (argv.includes('--prompts')) {
  for (const { plate, prompt } of prompts) {
    console.log(`\n${'='.repeat(72)}`);
    console.log(`${plate.id}  blank p${plate.blankPage}, facing p${plate.facingPage} — ${plate.chapter}\n`);
    console.log(prompt);
  }
  console.log(`\n${'='.repeat(72)}`);
  console.log(`${PLATES.length} prompts at ${WIDTH_IN} x ${HEIGHT_IN}in. Nothing generated, nothing spent.`);
  process.exit(0);
}

if (argv.includes('--generate')) {
  if (!argv.includes('--confirm')) {
    console.error(`REFUSING: --generate produces ${PLATES.length} paid images, about $0.05 each. Re-run with --confirm.`);
    process.exit(1);
  }
  await import('../src/env.js');
  const { generateImage } = await import('../src/services/openai/openai.js');
  const sharp = (await import('sharp')).default;

  /** ONE SHOT PER PLATE. A failure is named and never silently retried. */
  let made = 0;
  let failed = 0;
  for (const { plate, prompt } of prompts) {
    console.log(`\n${'─'.repeat(64)}`);
    console.log(`${plate.id}  p${plate.blankPage} — ${plate.chapter}`);
    const t0 = Date.now();
    try {
      const result = await generateImage({ prompt, size: '1024x1536', quality: 'high' });
      writeFileSync(`${OUT_DIR}/plate-${plate.id}-raw.png`, result.pngBuffer);
      const up = await sharp(result.pngBuffer)
        .resize(result.widthPx * 2, result.heightPx * 2, { kernel: 'lanczos3' })
        .png({ compressionLevel: 9 })
        .toBuffer();
      writeFileSync(`${OUT_DIR}/plate-${plate.id}.png`, up);
      made += 1;
      console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s  -> ${result.widthPx * 2}x${result.heightPx * 2}`);
    } catch (err) {
      failed += 1;
      console.log(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
      console.log('  NOT retried.');
    }
  }
  console.log(`\n${made} generated, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

const APPLY = argv.includes('--apply');
if (!APPLY && !argv.includes('--plan')) throw new Error('pass --prompts, --generate --confirm, --plan or --apply');

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

console.log('building clean interior to resolve anchors…');
const clean = await buildTypesetInterior(P, { ...config, illustrations: {} }, { chaptersStartRecto: true });
console.log(`clean interior: ${clean.pageCount} pages\n`);
const pageBlocks = clean.report.pageBlocks;

const plan: Array<Frontispiece & { blockId: string }> = [];
console.log('PLACEMENT PLAN');
for (const p of PLATES) {
  const blankBlocks = pageBlocks[p.blankPage] ?? [];
  if (blankBlocks.length > 0) {
    console.log(`  p${p.blankPage}: NOT BLANK in this build (${blankBlocks.length} blocks) — refusing`);
    continue;
  }
  /** FIRST block of the facing chapter opening, so offset -1 lands on the blank. */
  const facing = pageBlocks[p.facingPage] ?? [];
  if (facing.length === 0) {
    console.log(`  p${p.facingPage}: no blocks — cannot anchor`);
    continue;
  }
  const blockId = facing[0]!;
  if (config.illustrations?.[blockId]) {
    console.log(`  p${p.blankPage}: anchor ${blockId} already carries art — refusing`);
    continue;
  }
  plan.push({ ...p, blockId });
  console.log(
    `  p${String(p.blankPage).padStart(3)} <- anchor ${blockId} on p${p.facingPage} (offset -1)  ` +
      `${WIDTH_IN}x${HEIGHT_IN}in  — ${p.chapter}`,
  );
}
if (plan.length !== PLATES.length) {
  console.error(`\nREFUSING: only ${plan.length} of ${PLATES.length} resolved.`);
  process.exit(1);
}

if (!APPLY) {
  console.log('\n--plan only. Nothing written.');
  process.exit(0);
}

const sharp = (await import('sharp')).default;
const storage = getProjectStorage();
const illustrations: Record<string, unknown> = { ...(config.illustrations ?? {}) };

console.log('\nuploading plates…');
for (const p of plan) {
  const src = sharp(readFileSync(`${OUT_DIR}/plate-${p.id}.png`));
  const meta = await src.metadata();
  const nativeWidthPx = meta.width ?? 0;
  const nativeHeightPx = meta.height ?? 0;
  const ppi = Math.round(nativeWidthPx / WIDTH_IN);
  if (ppi < 300) throw new Error(`REFUSING ${p.id}: ${ppi} PPI is below the 300 print gate`);
  /** Greyscale JPEG so the page embeds as DeviceGray and the book stays B&W-priced. */
  const bytes = await src.grayscale().toColourspace('b-w').jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
  const stored = await storage.writeProjectFile(P, ['illustrations', `plate-${p.id}.jpg`], bytes);
  illustrations[p.blockId] = {
    rawAssetPath: stored.relativePath,
    approvedAssetPath: stored.relativePath,
    version: 1,
    nativeWidthPx,
    nativeHeightPx,
    placementWidthIn: WIDTH_IN,
    placementHeightIn: HEIGHT_IN,
    status: 'approved',
    pageOffset: -1,
    model: 'gpt-image-2',
    subject: `${p.chapter} frontispiece`,
    note: `Full-page frontispiece on the parity blank p${p.blankPage}, facing p${p.facingPage}. Anchored to the chapter opening at offset -1.`,
    createdAt: new Date().toISOString(),
  };
  console.log(`  ${stored.relativePath} (${bytes.length} bytes) ${ppi} PPI -> p${p.blankPage}`);
}

await updateProjectConfig(P, ProjectConfigSchema.parse({ ...config, illustrations }));
console.log(`\nillustrations: ${Object.keys(config.illustrations ?? {}).length} -> ${Object.keys(illustrations).length}`);
console.log('written. Rebuild the interior to stamp them.');
process.exit(0);
