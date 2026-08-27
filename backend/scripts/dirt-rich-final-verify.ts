/**
 * DIRT RICH — final read-only verification before KDP upload.
 *
 * Confirms that what production holds, what is on disk, and what the upload
 * folder contains are all the same revision. Writes nothing anywhere.
 *
 *   yarn tsx scripts/dirt-rich-final-verify.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PROD_PROJECT = 'a4e2bbda-645f-4583-9123-7d24ab515c9c';
const REV5_MS = 'ac6767503c639aa1a95dc3cda275c0c6d969d10f6e2d81b4c3afd3d4c6b543f5';
const REV5_PDF = 'e382e2e56bc3ef31904e6c5b680b86fc1be194fd78726ea084095b23dcf0cc8f';
const CANONICAL = 'bc27f4d50bb22be1eb4d0f4d83fa4041d97983cbbabc91077e496ee2205b358c';
const DIR = 'C:/Users/jovan/Downloads/dirt rich book';


const { getEnv } = await import('../src/env.js');
const { openOperationalDatabase, describeAccess } = await import('../src/db/operational-access.js');
const __access = openOperationalDatabase({ environment: 'production', intent: 'read' });
process.env.APP_ENVIRONMENT = 'production';
const env = getEnv();
if (env.APP_ENVIRONMENT !== 'production') throw new Error('env did not resolve to production');

const { getProject } = await import('../src/db/repositories/projects.repo.js');
const { getProjectStorage } = await import('../src/services/storage/project-storage.js');

const project = await getProject(PROD_PROJECT);
if (!project) throw new Error('project not found');
const stored = await getProjectStorage().readProjectFile(project.manuscriptPath!);
const storedSha = createHash('sha256').update(stored).digest('hex');
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');

const checks: Array<[string, boolean, string]> = [
  ['production column is Rev 5', project.manuscriptSha256 === REV5_MS, project.manuscriptSha256!.slice(0, 16)],
  ['production stored bytes are Rev 5', storedSha === REV5_MS, storedSha.slice(0, 16)],
  ['canonical provenance intact', project.canonicalManuscriptSha256 === CANONICAL, project.canonicalManuscriptSha256!.slice(0, 16)],
  ['local Rev 5 PDF matches the frozen sha', sha(`${DIR}/DIRT-RICH-INTERIOR-PRINT-READY-REV5.pdf`) === REV5_PDF, REV5_PDF.slice(0, 16)],
  ['upload folder interior is Rev 5', sha(`${DIR}/KDP UPLOAD/DIRT-RICH-KDP-INTERIOR.pdf`) === REV5_PDF,
    sha(`${DIR}/KDP UPLOAD/DIRT-RICH-KDP-INTERIOR.pdf`).slice(0, 16)],
  ['upload cover matches the approved cover',
    sha(`${DIR}/KDP UPLOAD/DIRT-RICH-KDP-COVER.pdf`) === sha(`${DIR}/COVER REV3 - APPROVED/DIRT-RICH-COVER-REV3-PRINT.pdf`),
    sha(`${DIR}/KDP UPLOAD/DIRT-RICH-KDP-COVER.pdf`).slice(0, 16)],
];

console.log(`project : ${project.title} (${PROD_PROJECT})\n`);
for (const [l, ok, d] of checks) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l.padEnd(40)} ${d}`);
const ok = checks.every(([, p]) => p);
console.log(ok ? '\nALL ALIGNED' : '\nMISMATCH — do not upload until resolved');
process.exit(ok ? 0 : 1);
