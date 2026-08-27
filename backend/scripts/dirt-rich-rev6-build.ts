/**
 * DIRT RICH Rev 6 — build the final interior.
 *
 * One-shot production context (reads `.env`, declares the PROCESS production;
 * `.env.development.local` is never edited). Renders with the LOCAL Chromium,
 * which is the authoritative delivery lineage for this book.
 *
 * Layout standard is passed as an in-memory override, NOT written to the project.
 * Pinning happens only after the build is judged good.
 *
 *   tsx scripts/dirt-rich-rev6-build.ts <outPdf>
 */
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolvePaperbackSpine } from '../src/pipeline/publishing-standard/kdp-spec.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../');

await import('../src/env.js');
const { openOperationalDatabase, describeAccess } = await import('../src/db/operational-access.js');
const __access = openOperationalDatabase({ environment: 'production', intent: 'read' });
process.env.APP_ENVIRONMENT = 'production';
process.env.CHROMIUM_PATH ??= 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const OUT = process.argv[2];
const CACHE = process.argv[3];
if (!OUT) throw new Error('usage: dirt-rich-rev6-build.ts <outPdf> [freshCacheDir]');
/* The read-through cache keys on path and assumes keys are immutable, so a
   manuscript replaced at the same path is served stale — it would have built
   Rev 5 bytes under a Rev 6 label. Point the cache at a fresh directory for
   this run rather than deleting anything out of the shared one. */
if (CACHE) process.env.RENDER_CACHE_DIR = CACHE;

const { ProjectConfigSchema } = await import('@wildlands/shared');
const { getProject } = await import('../src/db/repositories/projects.repo.js');
const { getProjectStorage, R2StorageService } = await import('../src/services/storage/project-storage.js');
const { buildTypesetInterior } = await import('../src/pipeline/typeset/build-typeset-interior.js');

const PID = 'a4e2bbda-645f-4583-9123-7d24ab515c9c';
const STANDARD = 'trade-nonfiction-guide-typeset@2';
const sha = (b: Buffer | string): string => createHash('sha256').update(b as never).digest('hex');

const project = await getProject(PID);
if (!project?.manuscriptPath) throw new Error('no manuscript on the row');
const config = ProjectConfigSchema.parse(project.config);

console.log('CONTEXT');
console.log(`  project        : ${project.title}`);
console.log(`  row sha        : ${project.manuscriptSha256}`);
console.log(`  standard (was) : ${config.typesetLayoutStandardId}`);
console.log(`  standard (now) : ${STANDARD}  [in-memory override, not written]`);

/* STALE-CACHE GUARD.
   The manuscript GET endpoint has served superseded bytes on this project. The
   builder reads through the cached storage service, so verify that what it will
   read is byte-identical to what R2 actually holds before rendering anything. */
const truth = await new R2StorageService().readProjectFile(project.manuscriptPath);
const viaCache = await getProjectStorage().readProjectFile(project.manuscriptPath);
console.log('\nSTALE-CACHE GUARD');
console.log(`  R2 direct      : ${sha(truth)}`);
console.log(`  via builder    : ${sha(viaCache)}`);
console.log(`  row says       : ${project.manuscriptSha256}`);
if (sha(truth) !== sha(viaCache)) throw new Error('ABORT: builder would read stale bytes');
if (sha(truth) !== project.manuscriptSha256) throw new Error('ABORT: stored bytes disagree with the row');
console.log('  all three agree — safe to build');

const interior = await buildTypesetInterior(PID, { ...config, typesetLayoutStandardId: STANDARD }, {
  chaptersStartRecto: Boolean(config.typesetChaptersStartRecto),
  reviewGuides: false,
});
writeFileSync(OUT, interior.pdf);

console.log('\nBUILD');
console.log(`  pages          : ${interior.pageCount}`);
console.log(`  v-overflow     : ${interior.report.verticalOverflowPages.length} ${JSON.stringify(interior.report.verticalOverflowPages)}`);
console.log(`  h-overflow     : ${interior.report.horizontalOverflow.length}`);
console.log(`  sections       : ${interior.report.sectionStarts.length}`);
console.log(`  orphaned art   : ${interior.orphanedIllustrations.length}`);
console.log(`  pdf sha256     : ${sha(interior.pdf)}`);
console.log(`  -> ${OUT}`);

console.log('\nSPINE');
const spineRes = resolvePaperbackSpine({
  ink: 'BLACK_AND_WHITE',
  paper: 'CREAM',
  trim: '6x9',
  pageCount: interior.pageCount,
});
const spine = spineRes.spineIn;
console.log(`  ${spineRes.explanation}`);
console.log(`  full wrap = ${(6 * 2 + spine + 0.25).toFixed(3)} x 9.250in`);
