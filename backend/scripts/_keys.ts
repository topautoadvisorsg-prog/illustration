/* Print all page keys for a chapter, in book order, space-separated (for _batch). */
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';

import { P } from './_project.js';
const CH = process.argv[2] ?? 'CH03';
const db = getDb();
const rows = (await db.select().from(pages).where(eq(pages.projectId, P)))
  .filter((r) => new RegExp('^' + CH + '_', 'i').test(r.pageKey))
  .sort((a, b) => (a.plannedPageNumber ?? 0) - (b.plannedPageNumber ?? 0));
console.log(rows.map((r) => r.pageKey).join(' '));
process.exit(0);
