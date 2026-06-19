/* Throwaway: reproduce the Preview (no-spend preview-package) for given page keys
 * and print success or the FULL error + stack, to find why Preview shows nothing. */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { buildPreviewPackageForPage } from '../src/services/render-proof/build-package.js';

const PROJECT = process.argv[2]!;
const KEYS = process.argv.slice(3);
const pages = await listPaginatedPagesForProject(PROJECT);
for (const key of KEYS) {
  const p = pages.find((x) => x.pageKey === key);
  if (!p) { console.log(`${key} NOT FOUND`); continue; }
  try {
    const pkg = await buildPreviewPackageForPage(p.id);
    console.log(`${key} OK -> entryTitle=${(pkg as any).authority?.entryTitle} layout=${(pkg as any).authority?.layoutFamilyLabel}`);
  } catch (e) {
    console.log(`${key} FAILED: ${(e as Error).message}`);
    console.log((e as Error).stack?.split('\n').slice(0, 6).join('\n'));
  }
}
process.exit(0);
