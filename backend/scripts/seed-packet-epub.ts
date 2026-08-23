/**
 * WHAT THE SEED PACKET SKIPS — Kindle EPUB build.
 *
 * Read-only against book data: no re-render, no spend, no writes to pages,
 * renders or print files. Runs in a one-shot PRODUCTION context because the
 * title, subtitle and manuscript live on the production project, and the dev
 * project still carries the old title.
 *
 * ─── THE COVER ────────────────────────────────────────────────────────────────
 * This project has no `publishing.coverAssetPath`: its wrap was built by
 * `seed-packet-cover-paperback.ts` from an approved master the operator chose,
 * and that script writes a print PDF rather than registering a project asset. So
 * the front panel is cut here, from EXACT geometry rather than the builder's
 * right-edge heuristic, and handed to the packer directly.
 *
 * The paperback wrap is used rather than the hardcover: both carry the same
 * artwork, and the paperback's front panel is the one that was reviewed.
 *
 *   node ../node_modules/tsx/dist/cli.mjs scripts/seed-packet-epub.ts <outDir>
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';
import sharp from 'sharp';

const REPO_ROOT = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '../../');

// Let env.ts do its normal load, then declare this process production before
// anything reads env. getEnv() caches lazily, so this override wins.
await import('../src/env.js');
const PROD = parseDotenv(readFileSync(nodePath.join(REPO_ROOT, '.env')));
process.env.DATABASE_URL = PROD.DATABASE_URL;
process.env.APP_ENVIRONMENT = 'production';

const PROJECT_ID = 'a4e2bbda-645f-4583-9123-7d24ab515c9c';
const OUT = process.argv[2] ?? 'C:/Users/jovan/Downloads/dirt rich book/KINDLE';
const WRAP = 'C:/Users/jovan/Downloads/dirt rich book/COVER REV5 - new title/COVER-PAPERBACK-proof.png';

/* Paperback wrap geometry, the same numbers the cover build used:
   0.125 bleed | 6.000 back | 0.315 spine | 6.000 front | 0.125 bleed = 12.565in.
   The front panel therefore starts at 6.440in and the trim box runs 0.125in in
   from the head and foot. Cutting on these numbers rather than on "the rightmost
   portrait region" is the difference between a front cover and a front cover
   with a slice of spine down one side. */
const DPI = 300;
const FRONT_LEFT_IN = 0.125 + 6.0 + 0.315;
const TRIM_W_IN = 6.0;
const TRIM_H_IN = 9.0;
const BLEED_IN = 0.125;
/* Amazon's recommended ebook cover: 1600 x 2560, an aspect of 0.625. The front
   panel is 6 x 9in, an aspect of 0.667, so 112px of width has to go. It is taken
   SYMMETRICALLY, 56px from each side — 0.19in of fence on the left and trellis
   on the right, both edge scenery.

   Cutting it here rather than leaving it to the builder is the point. The
   builder's fallback for a portrait cover is `fit:'cover', position:'right'`,
   which is a reasonable guess for an unknown image and wrong for this one: it
   took the whole 107px off the LEFT, sliding the composition 0.36in sideways.
   Handing over an image that is already exactly 1600 x 2560 makes that step a
   no-op. Both resizes DOWNSAMPLE from 2700px — nothing here is invented detail. */
const COVER_W = 1600;
const COVER_H = 2560;
const PANEL_W = Math.round(TRIM_W_IN * DPI);
const PANEL_H = Math.round(TRIM_H_IN * DPI);
const KEEP_W = Math.round(PANEL_H * (COVER_W / COVER_H));
const SIDE_TRIM = Math.round((PANEL_W - KEEP_W) / 2);

const wrapMeta = await sharp(WRAP).metadata();
const front = await sharp(WRAP)
  .extract({
    left: Math.round(FRONT_LEFT_IN * DPI) + SIDE_TRIM,
    top: Math.round(BLEED_IN * DPI),
    width: KEEP_W,
    height: PANEL_H,
  })
  .resize(COVER_W, COVER_H)
  .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
  .toBuffer();
const frontMeta = await sharp(front).metadata();

const { buildKindleEpub } = await import('../src/pipeline/stage-8-epub/build-epub.js');

const result = await buildKindleEpub(PROJECT_ID, { coverImage: front });
const outPath = nodePath.join(OUT, result.fileName);
writeFileSync(outPath, result.buffer);

console.log('\n=== KINDLE EPUB BUILT ===');
console.log('file:', outPath, `(${(result.buffer.length / 1048576).toFixed(2)} MB)`);
console.log('sha256:', createHash('sha256').update(result.buffer).digest('hex'));
console.log('title:', result.meta.title);
console.log('author:', result.meta.authors.join(', '), '| lang:', result.meta.language);
console.log(
  `cover: ${result.coverEmbedded ? 'EMBEDDED' : 'MISSING'} — front panel cut from the ` +
    `${wrapMeta.width}x${wrapMeta.height} wrap at ${frontMeta.width}x${frontMeta.height}, ` +
    `${SIDE_TRIM}px trimmed from each side`,
);
console.log('entry source:', result.entrySource);
console.log(
  'chapters:', result.model.stats.chapters,
  '| body chapters:', result.model.stats.bodyChapters,
  '| words:', result.model.stats.words,
  '| figures:', result.model.stats.heroesEmbedded ?? 0,
);
if (result.model.stats.skipped.length) console.log('skipped:', result.model.stats.skipped.join('; '));
if (result.model.stats.warnings.length) {
  console.log('\nWARNINGS');
  for (const w of result.model.stats.warnings) console.log('  -', w);
} else {
  console.log('\nno warnings');
}

console.log('\nCHAPTER LIST (nav order)');
for (const c of result.model.chapters) {
  const bytes = Buffer.byteLength(c.content, 'utf8');
  console.log(`  ${c.kind.padEnd(13)} ${String(bytes).padStart(7)}B  ${c.title}`);
}
