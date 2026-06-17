/* Diagnose interior bloat: list each active+approved render's print PDF size from
 * Supabase metadata (no download), report distribution + the largest pages. */
import { createClient } from '@supabase/supabase-js';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

const P = process.argv[2]!;
const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// list print-ready folder (paginate)
const sizeByName = new Map<string, number>();
for (let off = 0; ; off += 100) {
  const { data, error } = await client.storage.from('project-files').list(`${P}/print-ready`, { limit: 100, offset: off });
  if (error) { console.error('list error', error.message); break; }
  if (!data || data.length === 0) break;
  for (const f of data as any[]) sizeByName.set(f.name, f.metadata?.size ?? 0);
  if (data.length < 100) break;
}
console.log('files in print-ready:', sizeByName.size);

const db = getDb();
const allPages = await db.select().from(pages).where(eq(pages.projectId, P));
const keyById = new Map(allPages.map((p: any) => [p.id, p.pageKey]));
const renders = await db.select().from(wholePageRenders).where(eq(wholePageRenders.projectId, P));
const active = (renders as any[]).filter((r) => r.active && r.approvedForBook && r.printPdfPath);

const rows = active.map((r) => {
  const name = (r.printPdfPath as string).split('/').pop()!;
  return { key: keyById.get(r.pageId), mb: (sizeByName.get(name) ?? 0) / 1048576 };
}).sort((a, b) => b.mb - a.mb);

const total = rows.reduce((s, r) => s + r.mb, 0);
const big = rows.filter((r) => r.mb > 5).length;
const mid = rows.filter((r) => r.mb > 2.5 && r.mb <= 5).length;
const small = rows.filter((r) => r.mb <= 2.5).length;
console.log(`active print PDFs: ${rows.length} | total ${total.toFixed(0)} MB | avg ${(total / rows.length).toFixed(2)} MB`);
console.log(`buckets: >5MB(PNG-ish)=${big}  2.5-5MB(q92-ish)=${mid}  <=2.5MB(q88-ish)=${small}`);
console.log('top 15 largest:');
for (const r of rows.slice(0, 15)) console.log(`  ${String(r.mb.toFixed(2)).padStart(6)} MB  ${r.key}`);
process.exit(0);
