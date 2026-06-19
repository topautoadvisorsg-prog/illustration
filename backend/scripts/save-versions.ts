/* Throwaway: read all render versions ascending (warms the client) and save each. */
import { writeFile } from 'node:fs/promises';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { getProjectRenderSummary } from '../src/db/repositories/whole-page-render.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
const PROJECT = process.argv[2]!;
const KEY = process.argv[3]!;
const OUT = process.env.TEMP ?? '/tmp';
const storage = getProjectStorage();
const pages = await listPaginatedPagesForProject(PROJECT);
const p = pages.find((x) => x.pageKey === KEY)!;
const rows = ((await getProjectRenderSummary(PROJECT)).rows as Array<Record<string, any>>)
  .filter((r) => r.pageId === p.id && r.imagePath).sort((a,b)=>a.version-b.version);
for (const r of rows) {
  try {
    const buf = await storage.readProjectFile(r.imagePath);
    const path = `${OUT}\${KEY}_v${r.version}.png`;
    await writeFile(path, buf);
    console.log(`v${r.version} -> ${path} (${buf.length} bytes, active=${r.active})`);
  } catch (e) { console.log(`v${r.version} FAIL ${(e as Error).message?.slice(0,60)}`); }
}
process.exit(0);
