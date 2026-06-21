/* Force a page's layoutTemplate (per-page allocation override). Read+write.
 * Usage: _setlayout.ts <LAYOUT_ID> <pageKey> [pageKey ...] */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';

import { P } from './_project.js';
const TPL = process.argv[2]!;
const KEYS = process.argv.slice(3);
const db = getDb();
for (const KEY of KEYS) {
  const r = await db
    .update(pages)
    .set({ layoutTemplate: TPL })
    .where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY)))
    .returning({ k: pages.pageKey, l: pages.layoutTemplate });
  console.log('set', r[0]?.k, '→', r[0]?.l);
}
process.exit(0);
