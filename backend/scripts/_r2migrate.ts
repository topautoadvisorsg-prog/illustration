/* Phase 2/3 of the R2 migration (see R2_MIGRATION_PLAN.md): bulk-copy every object
 * from the Supabase Storage bucket → the Cloudflare R2 bucket, preserving keys 1:1,
 * then report a count/size reconciliation. Idempotent — an object already in R2 with
 * a matching byte size is SKIPPED, so the script is safe to re-run and to resume.
 *
 * Requires BOTH sets of credentials present at once in .env: the Supabase ones
 * (source) and the R2 ones (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY,
 * dest). It does NOT use getProjectStorage() — it talks to each store directly so
 * source and dest are explicit. NOTHING is deleted from Supabase.
 *
 * Usage:
 *   _r2migrate.ts            copy (skip already-present), then reconcile
 *   _r2migrate.ts --verify   no copy — just report what's in R2 vs Supabase
 */
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { wholePageRenders } from '../src/db/schema/index.js';
import { getEnv, isPlaceholder } from '../src/env.js';
import { P } from './_project.js';

const BUCKET = 'project-files';
const VERIFY_ONLY = process.argv.includes('--verify');
// --keepers-only: skip files owned EXCLUSIVELY by inactive renders (the prune set),
// so we copy only the active finals + every non-render object (cover, book PDFs…).
const KEEPERS_ONLY = process.argv.includes('--keepers-only');
const env = getEnv();

if (isPlaceholder(env.R2_ACCOUNT_ID) || isPlaceholder(env.R2_ACCESS_KEY_ID) || isPlaceholder(env.R2_SECRET_ACCESS_KEY)) {
  console.error('ABORT: R2 credentials not set in .env (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).');
  process.exit(1);
}
if (isPlaceholder(env.SUPABASE_URL) || isPlaceholder(env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.error('ABORT: Supabase credentials (source) not set in .env.');
  process.exit(1);
}

const supa = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const r2Bucket = env.R2_BUCKET || BUCKET;
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

function contentTypeFor(key: string): string {
  if (key.endsWith('.pdf')) return 'application/pdf';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.md') || key.endsWith('.markdown')) return 'text/markdown';
  if (key.endsWith('.txt')) return 'text/plain';
  if (key.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

/** Recursively enumerate every object key under the Supabase bucket. */
async function listAllKeys(prefix = ''): Promise<{ key: string; size: number }[]> {
  const out: { key: string; size: number }[] = [];
  const PAGE = 100;
  let offset = 0;
  for (;;) {
    const { data, error } = await supa.storage.from(BUCKET).list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`Supabase list failed at "${prefix}": ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A "folder" has no id/metadata — recurse into it; a real object has metadata.size.
      const size = (entry as { metadata?: { size?: number } }).metadata?.size;
      if (entry.id === null || size === undefined) {
        out.push(...(await listAllKeys(full)));
      } else {
        out.push({ key: full, size });
      }
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

async function r2Size(key: string): Promise<number | null> {
  try {
    const head = await r2.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null; // not present
  }
}

async function downloadFromSupabase(key: string): Promise<Buffer> {
  const { data, error } = await supa.storage.from(BUCKET).download(key);
  if (error || !data) throw new Error(`download failed ${key}: ${error?.message ?? 'no data'}`);
  return Buffer.from(await data.arrayBuffer());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Retry a flaky network op a few times with backoff — home-connection blips on the
 *  big print PNGs were killing whole copy runs. */
async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (i < tries) await sleep(1000 * i); }
  }
  throw last instanceof Error ? last : new Error(`${label}: ${String(last)}`);
}

// A stray socket error must not kill the whole copy — log and keep going; the final
// --verify pass is the real completeness gate.
process.on('unhandledRejection', (e) => console.log('  (unhandledRejection ignored):', (e as Error)?.message ?? e));

// When KEEPERS_ONLY, build the prune set (files owned ONLY by inactive renders) so we
// can skip them — copying just the active finals + all non-render objects (8.34 GB).
let skipKeys = new Set<string>();
if (KEEPERS_ONLY) {
  const FILE_COLS = ['imagePath', 'specPath', 'promptPath', 'blueprintPath', 'printPngPath', 'printPdfPath'] as const;
  const rows = await getDb().select().from(wholePageRenders).where(eq(wholePageRenders.projectId, P));
  const keep = new Set<string>(), pruneRaw = new Set<string>();
  for (const r of rows) {
    const t = r.active ? keep : pruneRaw;
    for (const c of FILE_COLS) { const v = r[c as keyof typeof r] as string | null; if (v) t.add(v); }
  }
  for (const k of pruneRaw) if (!keep.has(k)) skipKeys.add(k);
}

console.log(`[r2migrate] mode=${VERIFY_ONLY ? 'VERIFY' : 'COPY'}${KEEPERS_ONLY ? ' KEEPERS-ONLY' : ''}  source=supabase/${BUCKET}  dest=r2/${r2Bucket}`);
let keys = await listAllKeys();
if (KEEPERS_ONLY) {
  const before = keys.length;
  keys = keys.filter((k) => !skipKeys.has(k.key));
  console.log(`[r2migrate] keepers-only: skipping ${before - keys.length} inactive-render files`);
}
const totalBytes = keys.reduce((s, k) => s + k.size, 0);
console.log(`[r2migrate] objects to process: ${keys.length}  (${(totalBytes / 1e6).toFixed(1)} MB)`);

let copied = 0, skipped = 0, missing = 0, mismatch = 0, failed = 0;
let i = 0;
for (const { key, size } of keys) {
  i++;
  const present = await r2Size(key);
  if (present !== null && present === size) { skipped++; continue; }
  if (present !== null && present !== size) mismatch++;
  if (VERIFY_ONLY) {
    if (present === null) { missing++; console.log(`  MISSING in R2: ${key}`); }
    else if (present !== size) console.log(`  SIZE MISMATCH ${key}: supa=${size} r2=${present}`);
    continue;
  }
  try {
    const buf = await withRetry(`download ${key}`, () => downloadFromSupabase(key));
    await withRetry(`upload ${key}`, () => r2.send(new PutObjectCommand({ Bucket: r2Bucket, Key: key, Body: buf, ContentType: contentTypeFor(key) })));
    copied++;
    if (i % 25 === 0 || copied % 25 === 0) console.log(`  …${i}/${keys.length} (copied ${copied}, skipped ${skipped})`);
  } catch (e) {
    failed++;
    console.log(`  FAILED ${key}: ${(e as Error).message}`);
  }
}

console.log('\n[r2migrate] DONE');
console.log(`  source objects : ${keys.length}`);
if (VERIFY_ONLY) {
  console.log(`  present in R2   : ${skipped}`);
  console.log(`  missing in R2   : ${missing}`);
  console.log(`  size mismatch   : ${mismatch}`);
  console.log(missing === 0 && mismatch === 0 ? '  ✅ R2 fully matches Supabase.' : '  ⚠️  R2 not yet complete — run a COPY pass.');
} else {
  console.log(`  copied this run : ${copied}`);
  console.log(`  already present : ${skipped}`);
  console.log(`  failed          : ${failed}`);
  console.log(failed === 0 ? '  ✅ copy complete — now run: _r2migrate.ts --verify' : '  ⚠️  some objects failed — re-run to resume (idempotent).');
}
process.exit(0);
