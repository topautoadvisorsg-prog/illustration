/* Throwaway: list every page key for a section prefix with role + entry title. */
import { listPaginatedPagesForProject, getEntryMetaByKeys } from '../src/db/repositories/pagination.repo.js';

const PROJECT = process.argv[2]!;
const PREFIX = process.argv[3] ?? 'CH03';
const pages = (await listPaginatedPagesForProject(PROJECT)).filter((p) => p.pageKey.startsWith(PREFIX));
const openerKeys = pages.filter((p) => p.pageRole === 'opener').map((p) => p.pageKey);
const meta = await getEntryMetaByKeys(PROJECT, openerKeys);
for (const p of pages.sort((a, b) => a.pageKey.localeCompare(b.pageKey))) {
  const t = p.pageRole === 'opener' ? meta.get(p.pageKey)?.entryTitle ?? '' : '';
  console.log(`${p.pageKey.padEnd(16)} ${String(p.pageRole).padEnd(12)} ${t}`);
}
process.exit(0);
