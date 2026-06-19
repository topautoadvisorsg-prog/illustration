/* Throwaway: show PAGE manifest override (subject) for given page keys. */
import { listPaginatedPagesForProject, getEntryMetaByKeys } from '../src/db/repositories/pagination.repo.js';
const PROJECT = process.argv[2]!;
const KEYS = process.argv.slice(3);
const pages = await listPaginatedPagesForProject(PROJECT);
const meta = await getEntryMetaByKeys(PROJECT, KEYS);
for (const key of KEYS) {
  const m = meta.get(key) as Record<string, any> | undefined;
  console.log(`\n===== ${key} =====`);
  if (!m) { console.log('(no manifest override)'); continue; }
  console.log('entryTitle:', m.entryTitle ?? '(none)');
  console.log('cleanSubject:', m.cleanSubject ?? '(none)');
  console.log('imageSubject:', m.imageSubject ?? '(none)');
}
process.exit(0);
