/**
 * Place the four chapter-end plates, through the same NON-REFLOW path the first
 * five use: drawn onto the finished PDF at fixed coordinates, anchored to the
 * stable block id of the last block on the destination page.
 *
 * Nothing here can move a line box, a folio, a running head or the page count —
 * which matters because the spine of a printed cover is computed from that count.
 *
 * Two steps, so nothing is written blind:
 *   --plan    resolve anchors against a CLEAN build and print the table (free)
 *   --apply   convert, upload, and write config.illustrations
 *
 *   npx tsx scripts/national-parks-stamp-endpieces.ts --plan
 *   npx tsx scripts/national-parks-stamp-endpieces.ts --apply
 */
import { readFileSync } from 'node:fs';

await import('../src/env.js');
process.env.CHROMIUM_PATH ??= 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const APPLY = process.argv.includes('--apply');
if (!APPLY && !process.argv.includes('--plan')) throw new Error('pass --plan or --apply');

const PLATE_DIR = 'C:/Users/jovan/Downloads/_np_build/plates';

/**
 * Placement, in inches, sized against the free band each page actually has.
 *
 * The portrait plates are smaller than p68 and p89 (3.90 x 5.85) because these
 * two chapters end lower on the page — about 4.2in of clear band rather than
 * 6in. The stamper recomputes the safe region from where type ACTUALLY ends and
 * refuses to draw if a placement no longer fits, so an over-ambitious size
 * becomes a reported orphan rather than a clipped plate.
 *
 * Aspect is held to the source (2:3 portrait, 3:2 landscape) so nothing is
 * distorted to fill its slot.
 */
const PLACEMENTS: Array<{
  page: number;
  id: string;
  widthIn: number;
  heightIn: number;
  nativeWidthPx: number;
  nativeHeightPx: number;
  subject: string;
}> = [
  { page: 41, id: 'p41', widthIn: 2.70, heightIn: 4.05, nativeWidthPx: 2048, nativeHeightPx: 3072, subject: 'Zion chapter-end plate — the narrow canyon' },
  { page: 53, id: 'p53', widthIn: 2.70, heightIn: 4.05, nativeWidthPx: 2048, nativeHeightPx: 3072, subject: 'Yellowstone chapter-end plate — the open valley at first light' },
  { page: 101, id: 'p101', widthIn: 3.90, heightIn: 2.60, nativeWidthPx: 3072, nativeHeightPx: 2048, subject: 'Acadia chapter-end endpiece — the granite shore at dawn' },
  { page: 109, id: 'p109', widthIn: 3.90, heightIn: 2.60, nativeWidthPx: 3072, nativeHeightPx: 2048, subject: 'Chapter 12 endpiece — the road out' },
];

const { P } = await import('./_project.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');
const { getProject, updateProjectConfig } = await import('../src/db/repositories/projects.repo.js');
const { buildTypesetInterior } = await import('../src/pipeline/typeset/build-typeset-interior.js');
const { getProjectStorage } = await import('../src/services/storage/project-storage.js');

const project = await getProject(P);
if (!project) throw new Error(`project ${P} not found`);
const config = ProjectConfigSchema.parse(project.config);

/**
 * Anchors resolved against a build with NO illustrations configured.
 *
 * The anchor has to come from the pagination the book actually has, not from one
 * that already carries art. Stamping does not move pagination, so the two agree —
 * resolving against the clean build is what makes that checkable rather than
 * assumed.
 */
console.log('building clean interior to resolve anchors…');
const clean = await buildTypesetInterior(P, { ...config, illustrations: {} }, { chaptersStartRecto: true });
console.log(`clean interior: ${clean.pageCount} pages\n`);

const pageBlocks = clean.report.pageBlocks;
const plan: Array<(typeof PLACEMENTS)[number] & { blockId: string; ppi: number }> = [];

console.log('PLACEMENT PLAN');
for (const p of PLACEMENTS) {
  const blocks = pageBlocks[p.page] ?? [];
  if (blocks.length === 0) {
    console.log(`  p${p.page}: NO BLOCKS on this page — cannot anchor`);
    continue;
  }
  const blockId = blocks[blocks.length - 1]!;
  const ppi = Math.round(p.nativeWidthPx / p.widthIn);
  plan.push({ ...p, blockId, ppi });
  console.log(
    `  p${String(p.page).padStart(3)}  anchor ${blockId}  ${p.widthIn}x${p.heightIn}in  ${ppi} PPI  — ${p.subject}`,
  );
}
if (plan.length !== PLACEMENTS.length) {
  console.error(`\nREFUSING: only ${plan.length} of ${PLACEMENTS.length} anchors resolved.`);
  process.exit(1);
}

if (!APPLY) {
  console.log('\n--plan only. Nothing written. Re-run with --apply.');
  process.exit(0);
}

const storage = getProjectStorage();
const illustrations: Record<string, unknown> = { ...(config.illustrations ?? {}) };
console.log('\nuploading plates…');
for (const p of plan) {
  /**
   * Greyscale JPEG, not PNG. pdf-lib's embedPng expands a greyscale PNG to
   * DeviceRGB, which puts a colour space on a page in a black-and-white book,
   * and KDP prices an interior by what its pages declare. A single-component
   * JPEG embeds as DeviceGray and stays grey.
   */
  const sharp = (await import('sharp')).default;
  const bytes = await sharp(readFileSync(`${PLATE_DIR}/plate-${p.id}.png`))
    .grayscale()
    .toColourspace('b-w')
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toBuffer();
  const stored = await storage.writeProjectFile(P, ['illustrations', `plate-${p.id}.jpg`], bytes);
  illustrations[p.blockId] = {
    rawAssetPath: stored.relativePath,
    approvedAssetPath: stored.relativePath,
    version: 1,
    nativeWidthPx: p.nativeWidthPx,
    nativeHeightPx: p.nativeHeightPx,
    placementWidthIn: p.widthIn,
    placementHeightIn: p.heightIn,
    status: 'approved',
    model: 'gpt-image-2',
    subject: p.subject,
    note: `Dore-inspired B&W engraving. Destination p${p.page} in the 118-page build.`,
    createdAt: new Date().toISOString(),
  };
  console.log(`  ${stored.relativePath} (${bytes.length} bytes) -> anchor ${p.blockId}`);
}

await updateProjectConfig(P, ProjectConfigSchema.parse({ ...config, illustrations }));
console.log(`\nillustrations: ${Object.keys(config.illustrations ?? {}).length} -> ${Object.keys(illustrations).length}`);
console.log('written. Rebuild the interior to stamp them.');
process.exit(0);
