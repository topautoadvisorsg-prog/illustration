import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { stripReadingFieldMetadata } from '../src/pipeline/subject-badges/extract-badges.js';
const PROJECT = process.argv[2]!;
const KEYS = process.argv.slice(3);
const pages = await listPaginatedPagesForProject(PROJECT);
for (const key of KEYS) {
  const p = pages.find((x) => x.pageKey === key) as any;
  const out = stripReadingFieldMetadata(p.readingFieldText ?? '');
  console.log(`\n===== ${key} =====`);
  console.log('FIRST 160 CHARS AFTER STRIP:');
  console.log(out.slice(0, 160));
}
process.exit(0);
