/* Throwaway: read render versions ascending (warms client), save the newest to a fixed path. */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { getProjectRenderSummary } from '../src/db/repositories/whole-page-render.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

const PROJECT = process.argv[2]!;
const KEYS = process.argv.slice(3);
const OUT = process.env.TEMP ?? '/tmp';
const storage = getProjectStorage();
const summary = (await getProjectRenderSummary(PROJECT)).rows as Array<Record<string, any>>;
const pages = await listPaginatedPagesForProject(PROJECT);

async function readRetry(p: string, n = 5): Promise<Buffer | null> {
  for (let i = 0; i < n; i++) {
    try { return await storage.readProjectFile(p); } catch { await new Promise((r) => setTimeout(r, 700)); }
  }
  return null;
}

for (const KEY of KEYS) {
  const p = pages.find((x) => x.pageKey === KEY);
  if (!p) { console.log(`${KEY}: NOT FOUND`); continue; }
  const rows = summary.filter((r) => r.pageId === p.id && r.imagePath).sort((a, b) => a.version - b.version);
  let lastBuf: Buffer | null = null, lastVer = 0, lastActive = false;
  for (const r of rows) {
    const buf = await readRetry(r.imagePath);
    if (buf) { lastBuf = buf; lastVer = r.version; lastActive = r.active; }
  }
  if (!lastBuf) { console.log(`${KEY}: FAILED to read any version`); continue; }
  const outPath = path.join(OUT, KEY + '_NEW.png');
  await writeFile(outPath, lastBuf);
  console.log(`${KEY}: newest v${lastVer} active=${lastActive} -> ${outPath} (${lastBuf.length} bytes)`);
}
process.exit(0);
