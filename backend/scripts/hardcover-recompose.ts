/**
 * ACTIVE WRAPPER over the canonical compositor.
 *
 * Re-compose a hardcover case from artwork that has already been generated and
 * approved. No new render, no model call, no spend.
 *
 *   tsx scripts/hardcover-recompose.ts <projectId> --interior final.pdf \
 *       --title "..." --author "..." [--out DIR]
 *
 * WHAT CHANGED, AND WHY IT MATTERS
 *
 * This script used to carry a hardcover wrap of its own: 16.409 x 11.417in,
 * spine 0.834in, wrap 0.591in, plus a hand-placed 2 x 1.2in barcode box. Phase
 * 1B replaced those literals with the verified calculator reading, and this
 * phase removes the geometry from the script entirely.
 *
 * It also hardcoded a 275-page book. That is the defect the compositor exists to
 * remove: a page count typed into a script cannot be wrong loudly, and a
 * hardcover spine that is wrong by one signature is a reprint. The count now
 * comes from the interior PDF that is shipping.
 *
 * The barcode reserve is no longer drawn as a white box by default. The
 * compositor reserves that region by construction and marks it on the proof, so
 * a human can see the region KDP may cover without a white rectangle being
 * baked into approved artwork.
 *
 * For anything new, call `scripts/qa/build-cover.ts` directly.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { buildCover } from '../src/pipeline/cover/compositor/build-cover.js';

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith('--'));
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const next = argv[argv.indexOf(hit) + 1];
  return next && !next.startsWith('--') ? next : '';
};

const projectId = positional[0];
const INTERIOR = flag('interior');
if (!projectId) {
  console.error('hardcover-recompose: a project id is required as the first argument.');
  process.exit(1);
}
if (!INTERIOR) {
  console.error(
    'hardcover-recompose: --interior <final interior PDF> is required.\n' +
      'The page count is read from it. This script no longer carries a hardcoded 275.',
  );
  process.exit(1);
}

const OUT = flag('out') ?? 'C:/Users/jovan/Downloads';
mkdirSync(OUT, { recursive: true });

const storage = getProjectStorage();
const artwork = await storage.readProjectFile(`${projectId}/cover/cover-wrap-hardcover-art.png`);

const result = await buildCover({
  interiorPdf: readFileSync(INTERIOR),
  interiorName: INTERIOR,
  artwork,
  artworkName: 'cover-wrap-hardcover-art.png',
  binding: 'HARDCOVER',
  ink: 'PREMIUM_COLOR',
  paper: 'WHITE',
  trim: flag('trim') ?? '7x10',
  title: flag('title') ?? 'Untitled',
  author: flag('author') ?? 'Unknown',
  // The generated art already carries its own spine treatment on this lineage.
  spineText: false,
});

writeFileSync(join(OUT, 'HARDCOVER-COVER.pdf'), result.productionPdf);
writeFileSync(join(OUT, 'HARDCOVER-COVER-proof.png'), result.proofPng);
writeFileSync(join(OUT, 'HARDCOVER-COVER-manifest.json'), JSON.stringify(result.manifest, null, 2));

console.log(result.report);
console.log(`  production            ${join(OUT, 'HARDCOVER-COVER.pdf')}`);
console.log(`  proof                 ${join(OUT, 'HARDCOVER-COVER-proof.png')}`);
console.log(`  manifest              ${join(OUT, 'HARDCOVER-COVER-manifest.json')}`);
if (result.status === 'BLOCKED') process.exit(2);
