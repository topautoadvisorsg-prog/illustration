/* AGGRESSIVE PRUNE (operator-approved 2026-06-22): keep ONLY the active final render
 * per page (+ all non-render files: cover, book PDFs, proofs); delete the files owned
 * by every non-active render (dead + superseded-approved) from BOTH Supabase and R2,
 * and null those rows' file-path columns so the DB holds no dangling references.
 *
 * SAFETY (this deletes production files — read carefully):
 *  - DRY-RUN by default. Pass --execute to actually delete.
 *  - HARD GATE before any delete: every KEEP file (active render's files) must be
 *    present in R2 with a byte size matching Supabase. If even one keeper is missing
 *    or size-mismatched, ABORT with zero deletions — we never delete the Supabase copy
 *    of anything that isn't safely in R2.
 *  - Prune set EXCLUDES any key an active render also references, and EXCLUDES every
 *    non-render object (cover / book PDFs / manifests). Only inactive-render-exclusive
 *    files are ever touched.
 *
 * Usage:  _r2prune.ts            (dry-run report)
 *         _r2prune.ts --execute  (perform the prune)
 */
import { createClient } from '@supabase/supabase-js';
import { S3Client, HeadObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { wholePageRenders } from '../src/db/schema/index.js';
import { getEnv, isPlaceholder } from '../src/env.js';
import { P } from './_project.js';

const BUCKET = 'project-files';
const EXECUTE = process.argv.includes('--execute');
const env = getEnv();
if (isPlaceholder(env.R2_ACCOUNT_ID)) { console.error('ABORT: R2 not configured.'); process.exit(1); }

const supa = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const r2Bucket = env.R2_BUCKET || BUCKET;
const r2 = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
const db = getDb();

const FILE_COLS = ['imagePath', 'specPath', 'promptPath', 'blueprintPath', 'printPngPath', 'printPdfPath'] as const;
const rows = await db.select().from(wholePageRenders).where(eq(wholePageRenders.projectId, P));
const keepFiles = new Set<string>();
const pruneFilesRaw = new Set<string>();
for (const r of rows) {
  const target = r.active ? keepFiles : pruneFilesRaw;
  for (const c of FILE_COLS) { const v = r[c as keyof typeof r] as string | null; if (v) target.add(v); }
}
// Never prune a key an active render also owns.
const pruneFiles = [...pruneFilesRaw].filter((k) => !keepFiles.has(k));

// Supabase size map (also tells us which keys still exist there).
async function listAll(prefix = ''): Promise<Map<string, number>> {
  const map = new Map<string, number>(); const PAGE = 100; let offset = 0;
  for (;;) {
    const { data, error } = await supa.storage.from(BUCKET).list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const e of data) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      const size = (e as { metadata?: { size?: number } }).metadata?.size;
      if (e.id === null || size === undefined) for (const [k, v] of await listAll(full)) map.set(k, v);
      else map.set(full, size);
    }
    if (data.length < PAGE) break; offset += PAGE;
  }
  return map;
}
console.log('[prune] indexing Supabase bucket…');
const supaSizes = await listAll();

async function r2Size(key: string): Promise<number | null> {
  try { return (await r2.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: key }))).ContentLength ?? null; }
  catch { return null; }
}

// HARD GATE: every active-render keeper must already be in R2 with a matching size.
console.log('[prune] verifying', keepFiles.size, 'keeper files are safely in R2…');
let missing = 0, mismatch = 0, checked = 0;
for (const key of keepFiles) {
  const supaSize = supaSizes.get(key);
  if (supaSize === undefined) continue; // not in Supabase (nothing to protect)
  const r2s = await r2Size(key);
  checked++;
  if (r2s === null) { missing++; if (missing <= 10) console.log('   MISSING in R2:', key); }
  else if (r2s !== supaSize) { mismatch++; if (mismatch <= 10) console.log('   SIZE MISMATCH:', key, supaSize, '≠', r2s); }
}
const gateOk = missing === 0 && mismatch === 0;
console.log(`[prune] keeper check: ${checked} checked, ${missing} missing, ${mismatch} mismatch → ${gateOk ? 'GATE PASS' : 'GATE FAIL'}`);

const pruneBytes = pruneFiles.reduce((s, k) => s + (supaSizes.get(k) ?? 0), 0);
console.log('\n[prune] PLAN');
console.log('  keep (active render files):', keepFiles.size);
console.log('  prune (inactive-only files):', pruneFiles.length, `(${(pruneBytes / 1e9).toFixed(2)} GB to free)`);
console.log('  non-render files: untouched.  cover/book PDFs: untouched.');

if (!EXECUTE) { console.log('\nDRY-RUN — nothing deleted. Re-run with --execute to prune.'); process.exit(0); }
if (!gateOk) { console.error('\nABORT: keeper files are not all safely in R2 — refusing to delete anything. Finish/verify the R2 copy first.'); process.exit(1); }

// 1) Delete from R2 (batches of 1000).
console.log('\n[prune] deleting from R2…');
let r2del = 0;
for (let i = 0; i < pruneFiles.length; i += 1000) {
  const batch = pruneFiles.slice(i, i + 1000).map((Key) => ({ Key }));
  await r2.send(new DeleteObjectsCommand({ Bucket: r2Bucket, Delete: { Objects: batch, Quiet: true } }));
  r2del += batch.length;
}
console.log('   R2 delete requested for', r2del, 'keys');

// 2) Delete from Supabase (batches of 100).
console.log('[prune] deleting from Supabase…');
let supdel = 0;
for (let i = 0; i < pruneFiles.length; i += 100) {
  const batch = pruneFiles.slice(i, i + 100);
  const { error } = await supa.storage.from(BUCKET).remove(batch);
  if (error) console.log('   supa remove batch error:', error.message);
  else supdel += batch.length;
}
console.log('   Supabase delete requested for', supdel, 'keys');

// 3) Null the file-path columns on every inactive render row (no dangling refs).
console.log('[prune] nulling file paths on inactive render rows…');
const upd = await db.update(wholePageRenders)
  .set({ imagePath: null, specPath: null, promptPath: null, blueprintPath: null, printPngPath: null, printPdfPath: null })
  .where(and(eq(wholePageRenders.projectId, P), eq(wholePageRenders.active, false)))
  .returning({ id: wholePageRenders.id });
console.log('   nulled', upd.length, 'inactive render rows (active rows untouched)');

console.log(`\n[prune] DONE — freed ~${(pruneBytes / 1e9).toFixed(2)} GB. Run _prunesize.ts or _r2migrate.ts --verify to confirm.`);
process.exit(0);
