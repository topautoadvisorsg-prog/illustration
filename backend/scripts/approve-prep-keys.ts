/* Approve given pageKeys' active renders for book and print-prep them via the
 * deployed backend (current q88 + folio/badge policy). */
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

const BASE = process.env.WL_BACKEND ?? 'https://wildlandsbackend-production.up.railway.app';
const PW = (process.env.CONSOLE_PASSWORD ?? '').trim();
if (!PW) { console.error('CONSOLE_PASSWORD not in env'); process.exit(2); }
const H = { Authorization: `Bearer ${PW}`, 'Content-Type': 'application/json' };
const P = process.argv[2]!;
const KEYS = (process.argv[3] ?? '').split(',').filter(Boolean);
const db = getDb();
const all = await db.select().from(pages).where(eq(pages.projectId, P));

for (const key of KEYS) {
  const p = (all as any[]).find((x) => x.pageKey === key);
  if (!p) { console.log(`${key}: NOT FOUND`); continue; }
  const r: any = (await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, p.id))).find((x: any) => x.active);
  await db.update(wholePageRenders).set({ status: 'APPROVED', approvedForBook: true }).where(eq(wholePageRenders.id, r.id));
  const res: any = await (await fetch(`${BASE}/api/whole-page-render/${r.id}/print-prep`, { method: 'POST', headers: H, body: '{}' })).json();
  console.log(`${key}: approved + print-prepped → folio=${res.stampedFolio} badges=${res.stampedBadges} preflight=${res.preflight?.passed}`);
}
console.log('DONE.');
process.exit(0);
