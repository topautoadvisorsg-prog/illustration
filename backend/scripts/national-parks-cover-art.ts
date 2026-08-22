/**
 * Generate the National Parks full-wrap cover ARTWORK.
 *
 * THIS SPENDS MONEY — one gpt-image-2 image, ~$0.05 by the platform's own
 * estimate. It runs the same paid path the console's cover button runs, so the
 * prompt, the blueprint and the preflight are the ones already reviewed rather
 * than a side door with different inputs.
 *
 * Runs against the LOCAL DEV database. The artwork lands in local storage.
 *
 *   npx tsx scripts/national-parks-cover-art.ts <projectId> --confirm
 */
await import('../src/env.js');

const projectId = process.argv[2];
if (!projectId) throw new Error('usage: national-parks-cover-art.ts <projectId> --confirm');
if (!process.argv.includes('--confirm')) {
  console.error('REFUSING: this generates a paid image. Re-run with --confirm.');
  process.exit(1);
}

const { generateCoverWrapArtwork } = await import('../src/pipeline/stage-6-layout/render-chapter.js');

const t0 = Date.now();
const result = await generateCoverWrapArtwork(projectId, {});
console.log(`\ngenerated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`page count : ${result.pageCount}`);
console.log(`dimensions : ${JSON.stringify(result.dimensions)}`);
console.log(`image      : ${result.imagePath}`);
console.log(`prompt     : ${result.promptPath}`);
console.log(`pixels     : ${result.widthPx} x ${result.heightPx}`);
console.log(`model      : ${result.model}`);
process.exit(0);
