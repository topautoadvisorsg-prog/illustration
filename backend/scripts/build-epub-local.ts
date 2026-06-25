/* Build the Kindle EPUB to LOCAL disk for KDP upload. Read-only against book
 * data (no re-render, no spend, no writes to pages/renders/print files).
 *   node ../node_modules/tsx/dist/cli.mjs scripts/build-epub-local.ts [outDir]
 * PROJECT_ID comes from _project.ts (env). Default outDir = Downloads.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildKindleEpub } from '../src/pipeline/stage-8-epub/build-epub.js';
import { P } from './_project.js';

const OUT = process.argv[2] ?? 'C:/Users/jovan/Downloads';

const result = await buildKindleEpub(P);
const outPath = join(OUT, result.fileName);
writeFileSync(outPath, result.buffer);

console.log('\n=== KINDLE EPUB BUILT ===');
console.log('file:', outPath, `(${(result.buffer.length / 1048576).toFixed(2)} MB)`);
console.log('title:', result.meta.title, '| author:', result.meta.authors.join(', '), '| lang:', result.meta.language);
console.log('cover embedded:', result.coverEmbedded, '| entry source:', result.entrySource);
console.log('chapters:', result.model.stats.chapters, '| body chapters:', result.model.stats.bodyChapters, '| entries:', result.model.stats.entries, '| words:', result.model.stats.words);
console.log('skipped page kinds:', result.model.stats.skipped.join(', ') || '(none)');
console.log('\nNext: validate with EPUBCheck + Kindle Previewer before upload.');
process.exit(0);
