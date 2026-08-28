/**
 * RESIZE ONE APPROVED PLATE TO THE SPACE ITS PAGE ACTUALLY HAS.
 *
 * The stamper refuses art that no longer fits the safe region below the type,
 * which is right — better a missing plate than one printed into the margin. But
 * when a deliberate pagination change shrinks that region, the choice is to
 * lose the plate or to set it smaller, and losing it is not a choice this book
 * makes: the fifteen plates are the book.
 *
 * Only the PLACEMENT changes. The approved asset is untouched, so this cannot
 * alter what the art is, only how large it prints. Aspect ratio is preserved
 * from the placement already on file, so a refit cannot stretch a picture.
 *
 *   npx tsx scripts/national-parks-plate-refit.ts <blockId> <maxHeightIn> [--dry]
 */
await import('../src/env.js');

const BLOCK = process.argv[2];
const MAX_H = Number(process.argv[3]);
const DRY = process.argv.includes('--dry');
if (!BLOCK || !Number.isFinite(MAX_H)) {
  throw new Error('usage: national-parks-plate-refit.ts <blockId> <maxHeightIn> [--dry]');
}

const P = '92c4ab36-4956-4435-b656-d2679fbc73d9';
const { ProjectConfigSchema } = await import('@wildlands/shared');
const { getProject, updateProjectConfig } = await import('../src/db/repositories/projects.repo.js');

const project = await getProject(P);
if (!project) throw new Error(`project ${P} not found`);
const config = ProjectConfigSchema.parse(project.config);

const ills = config.illustrations;
if (!ills || !(BLOCK in ills)) throw new Error(`no illustration anchored to block ${BLOCK}`);
const ill = ills[BLOCK]!;

const wasW = ill.placementWidthIn;
const wasH = ill.placementHeightIn;
const aspect = wasW / wasH;
/** Rounded to a thousandth of an inch: finer than any press can hold, and it
 *  keeps the stored number readable when the next person opens the config. */
const round = (n: number): number => Math.round(n * 1000) / 1000;
const newH = round(MAX_H);
const newW = round(MAX_H * aspect);

console.log(`block   : ${BLOCK}`);
console.log(`asset   : ${ill.approvedAssetPath}`);
console.log(`was     : ${wasW} x ${wasH} in  (aspect ${aspect.toFixed(4)})`);
console.log(`becomes : ${newW} x ${newH} in  (aspect ${(newW / newH).toFixed(4)})`);
console.log(`area    : ${(((newW * newH) / (wasW * wasH)) * 100).toFixed(0)}% of the approved placement`);

if (DRY) {
  console.log('\nDRY RUN — nothing written.');
  process.exit(0);
}

const next = {
  ...config,
  illustrations: { ...ills, [BLOCK]: { ...ill, placementWidthIn: newW, placementHeightIn: newH } },
};
await updateProjectConfig(P, ProjectConfigSchema.parse(next));
console.log('\nwritten. Rebuild the interior and confirm the plate count.');
process.exit(0);
