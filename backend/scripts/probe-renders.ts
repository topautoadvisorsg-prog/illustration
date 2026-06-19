/* Throwaway: list each render version's imagePath and try reading it. */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { getProjectRenderSummary } from '../src/db/repositories/whole-page-render.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
const PROJECT = process.argv[2]!;
const KEY = process.argv[3]!;
const storage = getProjectStorage();
const pages = await listPaginatedPagesForProject(PROJECT);
const p = pages.find((x) => x.pageKey === KEY)!;
const rows = (await getProjectRenderSummary(PROJECT)).rows as Array<Record<string, any>>;
const mine = rows.filter((r) => r.pageId === p.id).sort((a,b)=>a.version-b.version);
for (const r of mine) {
  process.stdout.write(`v${r.version} active=${r.active} path=${r.imagePath} ... `);
  try { const buf = await storage.readProjectFile(r.imagePath); console.log(`OK ${buf.length} bytes`); }
  catch (e) { console.log(`READ FAIL: ${(e as Error).message?.slice(0,80)}`); }
}
process.exit(0);
