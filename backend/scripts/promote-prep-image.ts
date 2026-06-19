/* Promote a staged edited image onto a page's active render (update imagePath,
 * clear stale print artifacts, keep approved-for-book), then print-prep it via
 * the deployed backend. */
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

const BASE = process.env.WL_BACKEND ?? 'https://wildlandsbackend-production.up.railway.app';
const PW = (process.env.CONSOLE_PASSWORD ?? '').trim();
if (!PW) { console.error('CONSOLE_PASSWORD not in env'); process.exit(2); }
const H = { Authorization: `Bearer ${PW}`, 'Content-Type': 'application/json' };
const P = process.argv[2]!, KEY = process.argv[3]!, NEWPATH = process.argv[4]!;
const db = getDb();
const pg = (await db.select().from(pages).where(eq(pages.projectId, P))).find((x: any) => x.pageKey === KEY) as any;
const r: any = (await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, pg.id))).find((x: any) => x.active);
await db.update(wholePageRenders).set({ imagePath: NEWPATH, printPngPath: null, printPdfPath: null, status: 'APPROVED', approvedForBook: true }).where(eq(wholePageRenders.id, r.id));
console.log(`${KEY}: render ${r.id} imagePath → ${NEWPATH}`);
const res: any = await (await fetch(`${BASE}/api/whole-page-render/${r.id}/print-prep`, { method: 'POST', headers: H, body: '{}' })).json();
console.log(`print-prepped → folio=${res.stampedFolio} badges=${res.stampedBadges} preflight=${res.preflight?.passed} printPDF=${res.printPdfPath}`);
process.exit(0);
