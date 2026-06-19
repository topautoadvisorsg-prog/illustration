/* Throwaway: list all projects with id + name. */
import { listProjects } from '../src/db/repositories/projects.repo.js';
const rows = await listProjects();
for (const p of rows as Array<Record<string, any>>) {
  console.log(`${p.id}\t${p.name ?? p.title ?? '-'}\t${p.status ?? ''}`);
}
process.exit(0);
