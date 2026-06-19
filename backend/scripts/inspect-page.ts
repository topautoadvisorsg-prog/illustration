/* Throwaway: dump full row fields for given page keys to diagnose layout/overflow. */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
const PROJECT = process.argv[2]!;
const KEYS = process.argv.slice(3);
const pages = await listPaginatedPagesForProject(PROJECT);
for (const key of KEYS) {
  const p = pages.find((x) => x.pageKey === key) as Record<string, any> | undefined;
  if (!p) { console.log(`\n== ${key} NOT FOUND ==`); continue; }
  const txt = p.readingFieldText ?? '';
  console.log(`\n===== ${key} =====`);
  console.log('pageRole:', p.pageRole, '| entryKey:', p.entryKey, '| layoutTemplate:', p.layoutTemplate);
  console.log('chapterNumber:', p.chapterNumber, '| plannedPageNumber:', p.plannedPageNumber);
  console.log('readingFieldText length:', txt.length, 'chars');
  console.log('other keys:', Object.keys(p).join(', '));
}
process.exit(0);
