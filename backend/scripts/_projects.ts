/* List all projects in the DB and flag the active PROJECT_ID. Read-only. */
import { getDb } from '../src/db/client.js';
import { projects } from '../src/db/schema/index.js';
import { P } from './_project.js';
const db = getDb();
const all = await db.select().from(projects);
console.log('active PROJECT_ID (.env):', P, '\n');
for (const p of all) {
  const name = (p as any).name ?? (p as any).title ?? (p as any).slug ?? '(no name)';
  console.log((p.id === P ? '>> ' : '   ') + p.id + '  ' + name);
}
process.exit(0);
