/* For each key: active render version, how long ago it rendered, status, layout.
 * Flags any whose ACTIVE render is NOT fresh (>120 min ago = not re-rendered this
 * session). Read-only. Usage: _verify.ts <key...> */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';

import { P } from './_project.js';
const db = getDb();
let stale = 0;
for (const KEY of process.argv.slice(2)) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
  if (!row) { console.log(KEY.padEnd(22), 'NOT FOUND'); continue; }
  const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0];
  if (!r) { console.log(KEY.padEnd(22), 'NO ACTIVE RENDER'); stale++; continue; }
  const mins = Math.round((Date.now() - new Date(r.createdAt as any).getTime()) / 60000);
  const flag = mins > 120 || r.status !== 'RENDERED' ? '  <<< STALE / not re-rendered' : '';
  if (flag) stale++;
  console.log(`${KEY.padEnd(22)} v${String(r.version).padEnd(3)} ${String(mins).padStart(4)}m ago  ${String(r.status).padEnd(9)} ${(row.layoutTemplate || 'role-default').replace('LAYOUT_', '').padEnd(22)}${flag}`);
}
console.log(`\n${stale} stale / not-fresh (above). 0 = every page shows a render from this session → any "unchanged" look is browser/CDN cache, not the data.`);
process.exit(0);
