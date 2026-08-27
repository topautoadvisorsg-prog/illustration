/**
 * DIRT RICH Rev 4 — READ-ONLY production probe.
 *
 * Confirms what production actually holds before anything is written. No write
 * of any kind happens in this file.
 *
 * ─── HOW PRODUCTION IS REACHED ────────────────────────────────────────────
 * `.env` carries the production DATABASE_URL; `.env.development.local` then
 * overrides it to the local dev database and sets APP_ENVIRONMENT=development.
 * dotenv runs at module import and does not overwrite variables already set, so
 * by the time this file's body executes, process.env points at DEV.
 *
 * `getEnv()` caches on FIRST CALL. So the process re-declares itself here —
 * after dotenv has run, before anything has read the cache. `.env.development.local`
 * is neither edited nor removed; nothing on disk changes. This is the same
 * approach Rev 3 used and it is deliberately confined to a single script.
 *
 *   yarn tsx scripts/dirt-rich-rev4-prod-read.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PROD_PROJECT = 'a4e2bbda-645f-4583-9123-7d24ab515c9c';
const REV3_SHA = 'e2a5f7832fed47e9e787a6b140f7283484bed6c56a7b7ee9b5048ed4be9e6dd4';
const CANONICAL_SHA = 'bc27f4d50bb22be1eb4d0f4d83fa4041d97983cbbabc91077e496ee2205b358c';

// ORDER MATTERS. env.ts calls dotenv with `override: true` in its MODULE BODY,
// so it overwrites process.env the moment it is imported. The connection must be
// selected AFTER that import, which is why the entry point is called here rather
// than at the top of the file.
const { openOperationalDatabase } = await import('../src/db/operational-access.js');
const { getEnv } = await import('../src/env.js');
openOperationalDatabase({ environment: 'production', intent: 'read' });
process.env.APP_ENVIRONMENT = 'production';
const env = getEnv();
const host = env.DATABASE_URL.replace(/(:\/\/[^:]+):[^@]+@/, '$1:***@');
console.log(`APP_ENVIRONMENT : ${env.APP_ENVIRONMENT}`);
console.log(`DATABASE_URL    : ${host}`);
if (env.APP_ENVIRONMENT !== 'production' || env.DATABASE_URL.includes('127.0.0.1')) {
  throw new Error('env did not resolve to production — refusing to continue');
}

const { getProject } = await import('../src/db/repositories/projects.repo.js');
const project = await getProject(PROD_PROJECT);
if (!project) throw new Error('production project not found');

console.log(`\nproject   : ${project.title} (${project.id})`);
console.log(`status    : ${project.status}`);
console.log(`\nworking   : ${project.manuscriptPath}`);
console.log(`  sha     : ${project.manuscriptSha256}`);
console.log(`  is Rev3 : ${project.manuscriptSha256 === REV3_SHA}`);
console.log(`\ncanonical : ${project.canonicalManuscriptPath}`);
console.log(`  sha     : ${project.canonicalManuscriptSha256}`);
console.log(`  intact  : ${project.canonicalManuscriptSha256 === CANONICAL_SHA}`);

// Fetch the live working manuscript and hash it independently of the column.
const { getProjectStorage } = await import('../src/services/storage/project-storage.js');
const live = await getProjectStorage().readProjectFile(project.manuscriptPath!);
const liveSha = createHash('sha256').update(live).digest('hex');
console.log(`\nstored file bytes : ${live.length}`);
console.log(`stored file sha   : ${liveSha}`);
console.log(`matches column    : ${liveSha === project.manuscriptSha256}`);

const candidate = readFileSync('C:/Users/jovan/Downloads/dirt rich book/REV4-CANDIDATE-working-manuscript.md');
const candSha = createHash('sha256').update(candidate).digest('hex');
console.log(`\nRev4 candidate sha: ${candSha}`);
console.log(`candidate bytes   : ${candidate.length} (${candidate.length - live.length} vs live)`);

const ready =
  project.manuscriptSha256 === REV3_SHA &&
  project.canonicalManuscriptSha256 === CANONICAL_SHA &&
  liveSha === project.manuscriptSha256;
console.log(`\n${ready ? 'READY TO WRITE' : 'NOT READY — production is not in the expected Rev 3 state'}`);
console.log('NOTHING WAS WRITTEN.');
process.exit(ready ? 0 : 1);
