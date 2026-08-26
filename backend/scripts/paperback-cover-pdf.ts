/**
 * THIN WRAPPER over the canonical compositor. Kept only so an existing habit
 * keeps working; it holds no geometry and makes no decisions.
 *
 *   tsx scripts/paperback-cover-pdf.ts --interior final.pdf --title "..." --author "..."
 *
 * WHAT THIS USED TO DO, AND WHY IT WAS WRONG
 *
 * It carried three defects, all of the kind Phase 1C exists to remove:
 *
 *   1. A TYPED PAGE COUNT (`const PAGES = 276`). Nothing tied it to the interior
 *      that was actually shipping, so it could not be wrong loudly.
 *   2. `t.bleedIn` — the INTERIOR's bleed setting — used as the COVER's bleed. A
 *      text interior legitimately prints with no bleed, and that produced a wrap
 *      0.25in short in both directions. Cover bleed is always 0.125in.
 *   3. No validation of any kind: no effective-resolution check, no barcode
 *      reserve, no proof.
 *
 * All three are handled by `build-cover`. This file now just reads the project's
 * approved artwork out of storage and hands it over.
 *
 * For anything new, call `scripts/qa/build-cover.ts` directly.
 */
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { buildCover } from '../src/pipeline/cover/compositor/build-cover.js';
import { P } from './_project.js';

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const next = argv[argv.indexOf(hit) + 1];
  return next && !next.startsWith('--') ? next : '';
};

const INTERIOR = flag('interior');
if (!INTERIOR) {
  console.error(
    'paperback-cover-pdf: --interior <final interior PDF> is required.\n' +
      'The page count is read from it. This script no longer accepts a typed page count,\n' +
      'because the one it used to carry could not be checked against anything.',
  );
  process.exit(1);
}

const project = await getProject(P);
const config = ProjectConfigSchema.parse(project!.config);
const trim = `${config.trimSize.widthIn}x${config.trimSize.heightIn}`;
const artwork = await getProjectStorage().readProjectFile(config.publishing.coverAssetPath!);

const result = await buildCover({
  interiorPdf: readFileSync(INTERIOR),
  interiorName: INTERIOR,
  artwork,
  artworkName: config.publishing.coverAssetPath!,
  binding: 'PAPERBACK',
  ink: 'PREMIUM_COLOR',
  paper: 'WHITE',
  trim,
  title: flag('title') ?? project!.title ?? 'Untitled',
  author: flag('author') ?? 'Unknown',
  // The art already carries its own spine treatment on this lineage.
  spineText: false,
});

const OUT = flag('out') ?? 'C:/Users/jovan/Downloads/WILDLANDS_PAPERBACK_COVER.pdf';
const PROOF = flag('proof') ?? 'C:/Users/jovan/Downloads/WILDLANDS_PAPERBACK_COVER_proof.png';
writeFileSync(OUT, result.productionPdf);
writeFileSync(PROOF, result.proofPng);

console.log(result.report);
console.log(`  production            ${OUT}`);
console.log(`  proof                 ${PROOF}`);
if (result.status === 'BLOCKED') process.exit(2);
