/**
 * Place the five approved plates into the interior, through the NON-REFLOW path.
 *
 * The art is drawn onto the FINISHED PDF at fixed coordinates, anchored to the
 * stable block id of the last block on its destination page. Text, fonts,
 * wrapping, folios, running heads, page geometry and PAGE COUNT are untouched by
 * construction — nothing here can alter a content stream that already exists.
 *
 * That matters beyond tidiness: the approved cover's spine is computed from 116
 * pages. If placing art could move pagination, it would silently invalidate a
 * cover that has already been signed off.
 *
 * Two steps:
 *   --plan     resolve anchors and print the placement table (free, writes nothing)
 *   --apply    copy assets into project storage and write config.illustrations
 *
 *   npx tsx scripts/national-parks-stamp-plates.ts <projectId> --plan
 *   npx tsx scripts/national-parks-stamp-plates.ts <projectId> --apply
 */
import { readFileSync } from 'node:fs';

await import('../src/env.js');
process.env.CHROMIUM_PATH ??= 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const projectId = process.argv[2];
if (!projectId) throw new Error('usage: national-parks-stamp-plates.ts <projectId> --plan|--apply');
const APPLY = process.argv.includes('--apply');

const PLATE_DIR = 'C:/Users/jovan/Downloads/_np_build/plates';

/**
 * Placement, in inches, per destination page.
 *
 * Sized against the free band measured in the interior inventory, with a margin
 * of safety: the stamper recomputes the safe region from where type ACTUALLY
 * ends on the resolved page and refuses to draw if the placement no longer fits,
 * so an over-ambitious size becomes an orphan rather than a clipped plate.
 *
 * Every plate is 2048x3072 after the 2x upscale, so even the largest placement
 * here sits far above 300 DPI. The aspect is held at 2:3 so no plate is
 * distorted to fill its slot.
 */
const PLACEMENTS: Array<{ page: number; id: string; widthIn: number; heightIn: number; subject: string }> = [
  { page: 10, id: 'p10', widthIn: 3.30, heightIn: 4.95, subject: 'Part 1 — trail into the wilderness' },
  { page: 22, id: 'p22', widthIn: 3.30, heightIn: 4.95, subject: 'Part 2 — the seven parks' },
  { page: 68, id: 'p68', widthIn: 3.90, heightIn: 5.85, subject: 'Grand Canyon chapter-end plate' },
  { page: 89, id: 'p89', widthIn: 3.90, heightIn: 5.85, subject: 'Rocky Mountain chapter-end plate' },
  { page: 100, id: 'p100', widthIn: 3.30, heightIn: 4.95, subject: 'Part 3 — the journey continuing' },
];

const { ProjectConfigSchema } = await import('@wildlands/shared');
const { getProject } = await import('../src/db/repositories/projects.repo.js');
const { buildTypesetInterior } = await import('../src/pipeline/typeset/build-typeset-interior.js');
const { getProjectStorage } = await import('../src/services/storage/project-storage.js');

const project = await getProject(projectId);
if (!project) throw new Error(`project ${projectId} not found`);
const config = ProjectConfigSchema.parse(project.config);

/**
 * Resolve anchors against a CLEAN build — no illustrations configured.
 *
 * The anchor must be chosen from the pagination the book actually has, not from
 * one that already has art on it. Stamping does not move pagination, so the two
 * agree; resolving against the clean build is what makes that checkable rather
 * than assumed.
 */
console.log('building clean interior to resolve anchors…');
const clean = await buildTypesetInterior(
  projectId,
  { ...config, illustrations: {} },
  { chaptersStartRecto: true },
);
console.log(`clean interior: ${clean.pageCount} pages\n`);

const pageBlocks = clean.report.pageBlocks;
const plan: Array<{ page: number; id: string; blockId: string; widthIn: number; heightIn: number; ppi: number; subject: string }> = [];

console.log('PLACEMENT PLAN');
for (const p of PLACEMENTS) {
  const blocks = pageBlocks[p.page] ?? [];
  if (blocks.length === 0) {
    console.log(`  p${p.page}: NO BLOCKS on this page — cannot anchor`);
    continue;
  }
  // The LAST block on the page: the illustration sits under where type ends.
  const blockId = blocks[blocks.length - 1]!;
  const ppi = Math.round(2048 / p.widthIn);
  plan.push({ ...p, blockId, ppi });
  console.log(
    `  p${String(p.page).padStart(3)}  anchor ${blockId}  ${p.widthIn}x${p.heightIn}in  ${ppi} PPI  — ${p.subject}`,
  );
}

if (!APPLY) {
  console.log('\n--plan only. Nothing written. Re-run with --apply.');
  process.exit(0);
}

// ── Copy the plates into project storage and write the config ──────────────
const storage = getProjectStorage();
const illustrations: Record<string, unknown> = {};
console.log('\nuploading plates…');
for (const p of plan) {
  /**
   * Converted to a GREYSCALE JPEG here, not shipped as PNG.
   *
   * pdf-lib's embedPng expands a greyscale PNG to DeviceRGB, which puts a
   * colour space on a page in a black-and-white book — and KDP prices an
   * interior by what its pages declare. A single-component JPEG embeds as
   * DeviceGray and stays grey.
   *
   * Quality 94 on a 2048x3072 engraving: high enough that the hatching shows no
   * ringing at 500+ PPI, and it takes the interior from 78MB to a fraction of it.
   */
  const sharp = (await import('sharp')).default;
  const bytes = await sharp(readFileSync(`${PLATE_DIR}/plate-${p.id}.png`))
    .grayscale()
    .toColourspace('b-w')
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toBuffer();
  const stored = await storage.writeProjectFile(projectId, ['illustrations', `plate-${p.id}.jpg`], bytes);
  const key = stored.relativePath;
  illustrations[p.blockId] = {
    rawAssetPath: key,
    approvedAssetPath: key,
    version: 1,
    nativeWidthPx: 2048,
    nativeHeightPx: 3072,
    placementWidthIn: p.widthIn,
    placementHeightIn: p.heightIn,
    status: 'approved',
    model: 'gpt-image-2',
    subject: p.subject,
    note: `Dore-inspired B&W engraving. Destination p${p.page} in the 116-page build.`,
    createdAt: new Date().toISOString(),
  };
  console.log(`  ${key} (${bytes.length} bytes) -> anchor ${p.blockId}`);
}

const API = process.env.WL_API_BASE ?? 'http://127.0.0.1:8001';
const KEY = process.env.WILDLANDS_KEY ?? process.env.CONSOLE_PASSWORD ?? '';
const res = await fetch(`${API}/api/projects/${projectId}/config`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
  body: JSON.stringify({ config: { illustrations } }),
});
if (!res.ok) {
  console.error(`config patch failed: ${res.status}\n${await res.text()}`);
  process.exit(1);
}
console.log(`\nconfig.illustrations written: ${Object.keys(illustrations).length} anchors`);
process.exit(0);
