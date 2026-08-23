/**
 * DIRT RICH Rev 4 — guarded production write.
 *
 * Replaces ONLY the derived working manuscript, via `replaceWorkingManuscript`,
 * whose SET clause structurally omits the canonical provenance columns. The
 * canonical source is never a parameter, so this operation cannot move it even
 * by mistake — this platform has already lost provenance that way once.
 *
 * Refuses unless production is in the exact expected pre-state, backs the live
 * file up locally before overwriting, and verifies by re-reading afterwards.
 *
 * Dry run by default.
 *   yarn tsx scripts/dirt-rich-rev4-prod-write.ts            # check only
 *   yarn tsx scripts/dirt-rich-rev4-prod-write.ts --commit   # write
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const PROD_PROJECT = 'a4e2bbda-645f-4583-9123-7d24ab515c9c';
const REV3_SHA = 'e2a5f7832fed47e9e787a6b140f7283484bed6c56a7b7ee9b5048ed4be9e6dd4';
const CANONICAL_SHA = 'bc27f4d50bb22be1eb4d0f4d83fa4041d97983cbbabc91077e496ee2205b358c';
const REV4 = 'C:/Users/jovan/Downloads/dirt rich book/REV4-CANDIDATE-working-manuscript.md';
const BACKUP = 'C:/Users/jovan/Downloads/dirt rich book/REV3-live-working-manuscript.backup.md';
const COMMIT = process.argv.includes('--commit');

const envFile = readFileSync('../.env', 'utf8');
const prodUrl = envFile.match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m)?.[1];
if (!prodUrl) throw new Error('no DATABASE_URL in .env');
if (prodUrl.includes('127.0.0.1') || prodUrl.includes('localhost')) {
  throw new Error('.env DATABASE_URL is not remote — refusing');
}

// env.ts runs dotenv with override:true in its module body, so it must be
// imported BEFORE these are set, or it overwrites them with the dev values.
const { getEnv } = await import('../src/env.js');
process.env.DATABASE_URL = prodUrl;
process.env.APP_ENVIRONMENT = 'production';
const env = getEnv();
if (env.APP_ENVIRONMENT !== 'production' || env.DATABASE_URL.includes('127.0.0.1')) {
  throw new Error('env did not resolve to production — refusing');
}
console.log(`target : ${env.DATABASE_URL.replace(/(:\/\/[^:]+):[^@]+@/, '$1:***@')}`);
console.log(`mode   : ${COMMIT ? 'COMMIT' : 'DRY RUN'}\n`);

const { getProject, replaceWorkingManuscript } = await import('../src/db/repositories/projects.repo.js');
const { getProjectStorage } = await import('../src/services/storage/project-storage.js');
const storage = getProjectStorage();

const before = await getProject(PROD_PROJECT);
if (!before) throw new Error('production project not found');

const liveBytes = await storage.readProjectFile(before.manuscriptPath!);
const liveSha = createHash('sha256').update(liveBytes).digest('hex');
const rev4Bytes = readFileSync(REV4);
const rev4Sha = createHash('sha256').update(rev4Bytes).digest('hex');

// Pre-state gates. Every one must hold or nothing happens.
const gates: Array<[string, boolean, string]> = [
  ['working manuscript is Rev 3', before.manuscriptSha256 === REV3_SHA, before.manuscriptSha256!.slice(0, 16)],
  ['stored bytes match the column', liveSha === before.manuscriptSha256, liveSha.slice(0, 16)],
  ['canonical provenance intact', before.canonicalManuscriptSha256 === CANONICAL_SHA, before.canonicalManuscriptSha256!.slice(0, 16)],
  ['Rev 4 candidate differs from live', rev4Sha !== liveSha, rev4Sha.slice(0, 16)],
];
console.log('PRE-STATE');
for (const [l, ok, d] of gates) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l.padEnd(34)} ${d}`);
if (!gates.every(([, ok]) => ok)) {
  console.error('\nREFUSING — production is not in the expected pre-state.');
  process.exit(1);
}

if (!COMMIT) {
  console.log('\nDRY RUN — nothing written. Re-run with --commit.');
  process.exit(0);
}

// Keep the outgoing text before overwriting it. Storage has no version history.
writeFileSync(BACKUP, liveBytes);
console.log(`\nbacked up live Rev 3 -> ${BACKUP}`);

const segments = before.manuscriptPath!.split('/').slice(1); // drop the project id
const written = await storage.writeProjectFile(PROD_PROJECT, segments, rev4Bytes);
console.log(`wrote ${written.sizeBytes} bytes -> ${written.relativePath}`);
if (written.sha256 !== rev4Sha) throw new Error('storage reported a different hash than the candidate');

const updated = await replaceWorkingManuscript(PROD_PROJECT, {
  manuscriptPath: written.relativePath,
  manuscriptSha256: written.sha256,
});
if (!updated) throw new Error('replaceWorkingManuscript returned no row');

// ── read-back, from a fresh fetch ─────────────────────────────────────────
const after = await getProject(PROD_PROJECT);
const readBack = await storage.readProjectFile(after!.manuscriptPath!);
const readBackSha = createHash('sha256').update(readBack).digest('hex');

const checks: Array<[string, boolean, string]> = [
  ['column now Rev 4', after!.manuscriptSha256 === rev4Sha, after!.manuscriptSha256!.slice(0, 16)],
  ['stored bytes are Rev 4', readBackSha === rev4Sha, readBackSha.slice(0, 16)],
  ['byte length as expected', readBack.length === rev4Bytes.length, `${readBack.length}`],
  ['canonical path UNCHANGED', after!.canonicalManuscriptPath === before.canonicalManuscriptPath, 'ok'],
  ['canonical sha UNCHANGED', after!.canonicalManuscriptSha256 === CANONICAL_SHA, after!.canonicalManuscriptSha256!.slice(0, 16)],
];
console.log('\nREAD-BACK');
for (const [l, ok, d] of checks) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l.padEnd(28)} ${d}`);

const ok = checks.every(([, p]) => p);
console.log(`\nworking manuscript sha : ${rev4Sha}`);
console.log(ok ? 'PRODUCTION WRITE VERIFIED' : 'PRODUCTION WRITE FAILED VERIFICATION');
process.exit(ok ? 0 : 1);
