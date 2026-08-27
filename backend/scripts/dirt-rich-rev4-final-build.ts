/**
 * DIRT RICH Rev 4 — authoritative final interior.
 *
 * Builds through the LOCAL assembly lineage (`buildTypesetInterior`), which is
 * the delivery renderer for this book, reading the production project and its
 * production assets — including the two `-v2` charts that exist only there. The
 * Rev 4 pagination proof used v1 stand-ins because the filenames cannot affect
 * text flow; this build uses the real ones, so the PDF is the shipping artifact.
 *
 * Read-only against production apart from nothing: this writes no database row,
 * no storage object. It renders and writes one local PDF.
 *
 *   yarn tsx scripts/dirt-rich-rev4-final-build.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { ProjectConfigSchema } from '@wildlands/shared';

const PROD_PROJECT = 'a4e2bbda-645f-4583-9123-7d24ab515c9c';
const REV4_SHA = '7247b4766de764f28555fd260dd9709dadadaed672715a75b2085bf9065345d7';
const OUT = 'C:/Users/jovan/Downloads/dirt rich book/DIRT-RICH-INTERIOR-PRINT-READY-REV4.pdf';


// env.ts runs dotenv with override:true at import, so import first, then set.
const { getEnv } = await import('../src/env.js');
const { openOperationalDatabase, describeAccess } = await import('../src/db/operational-access.js');
const __access = openOperationalDatabase({ environment: 'production', intent: 'read' });
process.env.APP_ENVIRONMENT = 'production';
const env = getEnv();
if (env.APP_ENVIRONMENT !== 'production') throw new Error('env did not resolve to production');

const { getProject } = await import('../src/db/repositories/projects.repo.js');
const { buildTypesetInterior } = await import('../src/pipeline/typeset/build-typeset-interior.js');

const project = await getProject(PROD_PROJECT);
if (!project) throw new Error('project not found');
if (project.manuscriptSha256 !== REV4_SHA) {
  throw new Error(`production is not on Rev 4 (${project.manuscriptSha256})`);
}
const config = ProjectConfigSchema.parse(project.config);

console.log(`project    : ${project.title} (${PROD_PROJECT})`);
console.log(`manuscript : ${project.manuscriptSha256}`);
console.log(`standard   : ${config.typesetLayoutStandardId}`);
console.log(`trim       : ${config.trimSize.widthIn} x ${config.trimSize.heightIn} in\n`);

const interior = await buildTypesetInterior(PROD_PROJECT, config, {
  chaptersStartRecto: Boolean(config.typesetChaptersStartRecto),
  reviewGuides: false,
});
writeFileSync(OUT, interior.pdf);
const pdfSha = createHash('sha256').update(interior.pdf).digest('hex');

const r = interior.report;
const figures = Object.keys(config.illustrations ?? {}).length;
console.log(`pages            : ${interior.pageCount}`);
console.log(`vertical overflow: ${r.verticalOverflowPages.length}`);
console.log(`horizontal ovf   : ${r.horizontalOverflow.length}`);
console.log(`blank pages      : ${r.blankPages.length ? r.blankPages.join(', ') : 'none'}`);
console.log(`\npdf sha256 : ${pdfSha}`);
console.log(`-> ${OUT}`);

const gates: Array<[string, boolean, string]> = [
  ['zero vertical overflow', r.verticalOverflowPages.length === 0, `${r.verticalOverflowPages.length}`],
  ['zero horizontal overflow', r.horizontalOverflow.length === 0, `${r.horizontalOverflow.length}`],
  ['built from Rev 4', project.manuscriptSha256 === REV4_SHA, REV4_SHA.slice(0, 16)],
];
console.log('\nGATES');
for (const [l, ok, d] of gates) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l.padEnd(26)} ${d}`);
console.log(`  (figure anchors configured: ${figures})`);
process.exit(gates.every(([, ok]) => ok) ? 0 : 1);
