/* Find the pageKey(s) for a given planned page number. Read-only. Usage: _findpage.ts <n> */
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { P } from './_project.js';
const n = Number(process.argv[2]);
const db = getDb();
const m = (await db.select().from(pages).where(eq(pages.projectId, P))).filter((p) => p.plannedPageNumber === n);
console.log(m.map((p) => p.pageKey).join(',') || '(none)');
process.exit(0);
