/**
 * Build the 7 NATIONAL PARKS WITHOUT THE ROOKIE MISTAKES interior.
 *
 * Runs against the LOCAL DEV database and local Chromium. It never touches
 * production: `.env.development.local` already points DATABASE_URL at
 * wildlands_dev, and this script does not override it — unlike the DIRT RICH
 * build scripts, which deliberately re-point at production and are the reason
 * that override has to be an explicit, visible line rather than a default.
 *
 *   npx tsx scripts/national-parks-build.ts <outPdf> [--guides]
 *
 * `--guides` draws the trim and text-area rules for on-screen review. It is
 * NEVER used for the file that goes to KDP: an exported interior must carry
 * nothing on it that is not the book.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

await import('../src/env.js');
process.env.CHROMIUM_PATH ??= 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: national-parks-build.ts <outPdf> [--guides]');
const GUIDES = process.argv.includes('--guides');

const PID = '92c4ab36-4956-4435-b656-d2679fbc73d9';

const { ProjectConfigSchema } = await import('@wildlands/shared');
const { getProject } = await import('../src/db/repositories/projects.repo.js');
const { buildTypesetInterior } = await import('../src/pipeline/typeset/build-typeset-interior.js');

const sha = (b: Buffer | string): string => createHash('sha256').update(b as never).digest('hex');

const project = await getProject(PID);
if (!project) throw new Error(`project ${PID} not found in this database`);
const config = ProjectConfigSchema.parse(project.config);

console.log(`title    : ${config.title}`);
console.log(`author   : ${config.authorName}`);
console.log(`trim     : ${config.trimSize.widthIn} x ${config.trimSize.heightIn} in, bleed ${config.trimSize.bleedIn}`);
console.log(`profile  : ${config.productionProfileId}`);
console.log(`standard : ${config.typesetLayoutStandardId}`);
console.log(`paper    : ${config.paperStock ?? '(unset)'}`);
console.log(`guides   : ${GUIDES}`);
console.log('\nbuilding…');

const t0 = Date.now();
const result = await buildTypesetInterior(PID, config, {
  chaptersStartRecto: true,
  reviewGuides: GUIDES,
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);

writeFileSync(OUT, result.pdf);

console.log(`\nbuilt in ${secs}s`);
console.log(`file     : ${OUT}`);
console.log(`bytes    : ${result.pdf.length}`);
console.log(`sha256   : ${sha(result.pdf)}`);
console.log(`pages    : ${result.pageCount}`);
console.log(`standard : ${result.layoutStandardId}`);
console.log(`profile  : ${result.productionProfileId}`);
console.log(`blocks   : ${result.blocks.length}`);
if (result.orphanedOverrides.length) console.log(`orphaned overrides: ${result.orphanedOverrides.join(', ')}`);

const r = result.report;
console.log(`\ntrim     : ${r.trim.widthIn} x ${r.trim.heightIn} in`);
console.log(
  `margins  : top ${r.marginsIn.topIn} bottom ${r.marginsIn.bottomIn} outside ${r.marginsIn.outsideIn} gutter ${r.marginsIn.gutterIn} in`,
);
console.log(`type     : ${r.bodyPt}pt / ${r.lineHeight} leading`);
console.log(`\nvertical overflow pages : ${r.verticalOverflowPages.length ? r.verticalOverflowPages.join(', ') : 'none'}`);
console.log(`horizontal overflow     : ${JSON.stringify(r.horizontalOverflow)}`);
console.log(`blank pages             : ${r.blankPages.length ? r.blankPages.join(', ') : 'none'} (${r.blankPages.length})`);
console.log(`\nsection starts (${r.sectionStarts.length}):`);
for (const s of r.sectionStarts) {
  const side = s.page % 2 === 1 ? 'recto' : 'VERSO';
  console.log(`  p${String(s.page).padStart(3)} ${side}  [${s.kind}] ${s.label ? `${s.label} — ` : ''}${s.title}`);
}

/**
 * Exit explicitly.
 *
 * The database pool keeps a handle open, so the process would otherwise sit
 * there after the build finished and look like a hang — the render itself takes
 * about thirteen seconds.
 */
process.exit(0);
