/**
 * HISTORICAL - DO NOT USE FOR NEW BOOKS.
 *
 * One-off export of the rev26 freeze record to the KDP package.
 *
 * Kept, not deleted: it is the record of a write to a production book.
 *
 * Export the rev26 freeze record to the KDP package, next to rev24 and rev25.
 *
 *   tsx scripts/qa/nottm-export-rev26-provenance.ts
 *
 * Read-only against the database. The freeze itself lives in the project row;
 * this writes the same record to disk so the delivery folder can be read
 * without a database, which is the only reason `_provenance/` exists.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PROJECT_ID = '3b7ed37a-8a07-4bfd-a0c3-14ae5dc4a6ff';
const OUT = 'C:/Users/jovan/Downloads/NO_ONE_TOLD_ME_THAT_KDP/_provenance/rev26.provenance.json';

const PROD_URL = readFileSync(path.join(REPO_ROOT, '.env'), 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='))!
  .slice('DATABASE_URL='.length)
  .trim()
  .replace(/^["']|["']$/g, '');
await import('../../src/env.js');
process.env.DATABASE_URL = PROD_URL;

const { getProject } = await import('../../src/db/repositories/projects.repo.js');
const project = (await getProject(PROJECT_ID)) as { config: { proofArtifacts?: { id: string; provenance?: unknown }[] } } | undefined;
const artifact = project?.config.proofArtifacts?.find((a) => a.id === 'book-proof-rev26');
if (!artifact?.provenance) {
  console.log('\n  book-proof-rev26 has no provenance in the project row. Nothing written.\n');
  process.exit(1);
}
writeFileSync(OUT, `${JSON.stringify(artifact.provenance, null, 2)}\n`, 'utf8');
console.log(`\n  wrote ${OUT}\n`);
process.exit(0);
