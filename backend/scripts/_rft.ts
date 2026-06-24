/* Dump a page's readingFieldText (the body markdown the render bakes in). Read-only.
 * Usage: _rft.ts <pageKey> */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { P } from './_project.js';
const KEY = process.argv[2]!;
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
if (!row) { console.log('no page', KEY); process.exit(1); }
console.log(`=== ${KEY} (folio ${row.plannedPageNumber}) readingFieldText ===`);
console.log(JSON.stringify(row.readingFieldText));
console.log('\n--- rendered ---\n' + row.readingFieldText);
process.exit(0);
