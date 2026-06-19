/* List every ENTRY opener (pageRole=opener, INTERIOR) whose body carries a
 * scientific-name binomial — the exact R1-affected set. Optionally exclude keys. */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { extractBinomial } from '../src/pipeline/subject-badges/extract-badges.js';

const PROJECT = process.argv[2]!;
const EXCLUDE = new Set(process.argv.slice(3));
const pages = await listPaginatedPagesForProject(PROJECT);

const hits: string[] = [];
for (const p of pages as Array<Record<string, any>>) {
  if (p.pageRole !== 'opener') continue;
  if (p.section && p.section !== 'BODY') continue; // skip front/back matter
  // Same gate as build-page-spec: only a real `*Genus species* |` HEADER byline,
  // not a binomial mentioned in prose.
  const firstLine = (p.readingFieldText ?? '').split('\n')[0]?.trim() ?? '';
  if (!/^\*[^*\n]+\*[^|\n]*\|/.test(firstLine)) continue;
  const bin = extractBinomial(p.readingFieldText ?? '');
  if (!bin) continue;
  if (EXCLUDE.has(p.pageKey)) continue;
  hits.push(`${p.pageKey}\t${bin}`);
}
hits.sort();
for (const h of hits) console.log(h);
console.log(`\nTOTAL: ${hits.length} opener(s) with a binomial (excluding ${EXCLUDE.size})`);
// Also emit a space-joined key list for piping into render-batch.
console.log('\nKEYS:');
console.log(hits.map((h) => h.split('\t')[0]).join(' '));
process.exit(0);
