/* Read-only: measure how many GB each prune tier would free. Splits every object in
 * the Supabase bucket into buckets by cross-referencing the DB render file paths:
 *   - KEEP-ACTIVE      files owned by an active=true render (the final per page)
 *   - APPROVED-EXTRA   files of approved-but-not-active renders (superseded approvals)
 *   - DEAD             files of renders that are neither active nor approved
 *   - NON-RENDER       bucket objects NOT referenced by any render row (cover, book
 *                      PDFs, manifests, proofs… NEVER auto-deleted)
 * NO writes, NO deletes. Usage: _prunesize.ts */
import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { wholePageRenders } from '../src/db/schema/index.js';
import { getEnv } from '../src/env.js';
import { P } from './_project.js';

const BUCKET = 'project-files';
const env = getEnv();
const supa = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const db = getDb();

const FILE_COLS = ['imagePath', 'specPath', 'promptPath', 'blueprintPath', 'printPngPath', 'printPdfPath'] as const;
const rows = await db.select().from(wholePageRenders).where(eq(wholePageRenders.projectId, P));
const activeKeys = new Set<string>(), approvedExtraKeys = new Set<string>(), deadKeys = new Set<string>();
for (const r of rows) {
  const target = r.active ? activeKeys : r.approvedForBook ? approvedExtraKeys : deadKeys;
  for (const c of FILE_COLS) { const v = r[c as keyof typeof r] as string | null; if (v) target.add(v); }
}

async function listAll(prefix = ''): Promise<{ key: string; size: number }[]> {
  const out: { key: string; size: number }[] = []; const PAGE = 100; let offset = 0;
  for (;;) {
    const { data, error } = await supa.storage.from(BUCKET).list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const e of data) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      const size = (e as { metadata?: { size?: number } }).metadata?.size;
      if (e.id === null || size === undefined) out.push(...(await listAll(full)));
      else out.push({ key: full, size });
    }
    if (data.length < PAGE) break; offset += PAGE;
  }
  return out;
}

const GB = (b: number) => (b / 1e9).toFixed(2) + ' GB';
const all = await listAll();
let actN = 0, actB = 0, appN = 0, appB = 0, deadN = 0, deadB = 0, otherN = 0, otherB = 0;
for (const { key, size } of all) {
  if (activeKeys.has(key)) { actN++; actB += size; }
  else if (approvedExtraKeys.has(key)) { appN++; appB += size; }
  else if (deadKeys.has(key)) { deadN++; deadB += size; }
  else { otherN++; otherB += size; }
}
console.log('=== BUCKET SIZE BREAKDOWN (', all.length, 'objects,', GB(all.reduce((s, o) => s + o.size, 0)), ') ===');
console.log('KEEP-ACTIVE   (final per page) :', actN, 'files', GB(actB));
console.log('APPROVED-EXTRA(superseded)     :', appN, 'files', GB(appB));
console.log('DEAD          (never chosen)   :', deadN, 'files', GB(deadB));
console.log('NON-RENDER    (cover/PDFs/etc) :', otherN, 'files', GB(otherB), ' <- never auto-delete');
console.log('---');
console.log('Conservative prune (DEAD only)        frees:', GB(deadB), `(${deadN} files)`);
console.log('Aggressive prune  (DEAD + APPROVED-EXTRA) frees:', GB(deadB + appB), `(${deadN + appN} files)`);
console.log('Final R2 footprint if aggressive       :', GB(actB + otherB), `(${actN + otherN} files kept)`);
process.exit(0);
