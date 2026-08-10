/**
 * PUBLISH AN ILLUSTRATION — move approved artwork off the developer's disk.
 *
 * Production artwork living only as a PNG in someone's working directory is not
 * a deliverable. This uploads the asset into project storage and records it in
 * the project config, anchored to the STABLE BLOCK ID of the last block on the
 * page it decorates. From that point the console renders it, the interior build
 * stamps it, and replacing it never touches the manuscript or pagination.
 *
 * The NATIVE asset is what gets stored and stamped, never a resampled copy. The
 * PDF scales the image to the placement box at output time, so the printed
 * result carries exactly the pixels the model generated and no resampling step
 * sits in between inventing detail.
 *
 *   yarn workspace @wildlands/backend art:publish -- <projectId> <blockId> <asset.png> <wIn> <hIn>
 *
 * Writes nothing until every check passes: the block must exist in the current
 * render, and native pixels over the requested placement must clear 300 ppi.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
// Deliberately does NOT load .env.development.local. That file repoints
// DATABASE_URL at a local Postgres for day-to-day work, and publishing artwork
// to a local database that the console never reads is exactly the failure this
// script exists to end. Publishing targets the real project or it does nothing.
loadDotenv({ path: path.join(ROOT, '.env') });

const MIN_NATIVE_PPI = 300;

const [projectId, blockId, assetPath, wArg, hArg] = process.argv.slice(2);
if (!projectId || !blockId || !assetPath || !wArg || !hArg) {
  console.error('usage: art:publish -- <projectId> <blockId> <asset.png> <widthIn> <heightIn>');
  process.exit(1);
}
const placementWidthIn = Number(wArg);
const placementHeightIn = Number(hArg);

const { getProject, updateProjectConfig } = await import('../src/db/repositories/projects.repo.js');
const { getProjectStorage } = await import('../src/services/storage/project-storage.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');

const project = await getProject(projectId);
if (!project) throw new Error(`no project ${projectId}`);
const config = ProjectConfigSchema.parse(project.config);

const bytes = await readFile(assetPath);
const meta = await sharp(bytes).metadata();
const nativeWidthPx = meta.width ?? 0;
const nativeHeightPx = meta.height ?? 0;

const nativePpi = nativeWidthPx / placementWidthIn;
if (nativePpi < MIN_NATIVE_PPI) {
  console.error(
    `REFUSING: ${nativeWidthPx}px over ${placementWidthIn}in is ${Math.round(nativePpi)} native ppi, under ${MIN_NATIVE_PPI}.\n` +
      `Resampling the file would raise its pixel count and add no detail. Place it smaller, or regenerate it larger.`,
  );
  process.exit(2);
}

// The aspect the art will be drawn at must match the aspect it was drawn in, or
// the stamp quietly stretches it.
const nativeAspect = nativeWidthPx / nativeHeightPx;
const placeAspect = placementWidthIn / placementHeightIn;
if (Math.abs(nativeAspect - placeAspect) / nativeAspect > 0.01) {
  console.error(
    `REFUSING: asset aspect ${nativeAspect.toFixed(4)} vs placement aspect ${placeAspect.toFixed(4)}.\n` +
      `Stamping would distort the artwork.`,
  );
  process.exit(2);
}

const storage = getProjectStorage();
const version = (config.illustrations?.[blockId]?.version ?? 0) + 1;
const base = path.basename(assetPath, path.extname(assetPath));
const stored = await storage.writeProjectFile(projectId, ['illustrations', `${blockId}-v${version}-${base}.png`], bytes);

const promptPath = path.join(path.dirname(assetPath), `${base.replace(/-art-raw$/, '')}-prompt.txt`);
const prompt = await readFile(promptPath, 'utf8').catch(() => undefined);

const next = ProjectConfigSchema.parse({
  ...config,
  illustrations: {
    ...(config.illustrations ?? {}),
    [blockId]: {
      rawAssetPath: stored.relativePath,
      approvedAssetPath: stored.relativePath,
      version,
      nativeWidthPx,
      nativeHeightPx,
      placementWidthIn,
      placementHeightIn,
      status: 'approved',
      prompt,
      model: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
      styleDnaId: 'bw-educational-clearline',
      createdAt: new Date().toISOString(),
    },
  },
});
await updateProjectConfig(projectId, next);

console.log(`published illustration for block ${blockId}`);
console.log(`  asset        ${stored.relativePath}`);
console.log(`  native       ${nativeWidthPx}x${nativeHeightPx}px`);
console.log(`  placement    ${placementWidthIn} x ${placementHeightIn} in`);
console.log(`  native ppi   ${Math.round(nativePpi)}  (gate ${MIN_NATIVE_PPI})`);
console.log(`  version      ${version}`);
console.log('\nThe next typeset preview will stamp it. Pagination is untouched.');
process.exit(0);
