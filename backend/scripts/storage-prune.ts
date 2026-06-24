/* storage:prune — R2 storage cleanup with a safe dry-run-first policy.
 *
 * Classifies every R2 object under the project prefix into:
 *   ACTIVE         — referenced by an ACTIVE render row (image/spec/prompt/blueprint/printPng/printPdf)
 *   FINAL_EXPORT   — interior / cover / delivery / proof / export assets (final KDP files)
 *   APPROVED_BACKUP— referenced by a NON-active render kept as rollback (latest --keep-backups per page)
 *   JUNK           — replaced/superseded render files beyond the backup window, or orphans
 *                    (objects referenced by NO render row at all)
 *
 * Policy: NEVER delete ACTIVE or FINAL_EXPORT. Keep --keep-backups (default 1) most-recent
 * non-active versions per page as APPROVED_BACKUP. Delete JUNK only, and only with --confirm.
 *
 *   storage:prune --dry-run            (default; report only, deletes nothing)
 *   storage:prune --confirm            (delete JUNK after the dry-run is reviewed)
 *   [--keep-backups=N]                 (default 1)
 *
 * Usage: node ../node_modules/tsx/dist/cli.mjs scripts/storage-prune.ts [--confirm] [--keep-backups=N]
 */
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { wholePageRenders } from '../src/db/schema/index.js';
import { getEnv } from '../src/env.js';
import { P } from './_project.js';

const CONFIRM = process.argv.includes('--confirm');
const KEEP = Number((process.argv.find((a) => a.startsWith('--keep-backups=')) ?? '=1').split('=')[1] || 1);
const env = getEnv();
const bucket = env.R2_BUCKET || 'project-files';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

// ---- 1. enumerate every R2 object under <projectId>/ (key + size) ----
const objects = new Map<string, number>();
let token: string | undefined;
do {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${P}/`, ContinuationToken: token }));
  for (const o of res.Contents ?? []) if (o.Key) objects.set(o.Key, o.Size ?? 0);
  token = res.IsTruncated ? res.NextContinuationToken : undefined;
} while (token);

// ---- 2. build referenced-key sets from the DB (all render versions) ----
const db = getDb();
const renders = (await db.select().from(wholePageRenders).where(eq(wholePageRenders.projectId, P))) as Record<string, unknown>[];
const PATH_FIELDS = ['imagePath', 'specPath', 'promptPath', 'blueprintPath', 'printPngPath', 'printPdfPath'] as const;
function keysOf(r: Record<string, unknown>): string[] {
  return PATH_FIELDS.map((f) => r[f] as string | null).filter((k): k is string => Boolean(k));
}
const activeKeys = new Set<string>();
const backupKeys = new Set<string>();
const junkFromRenders = new Set<string>();

// group renders by page; active = ACTIVE, non-active sorted by version desc → keep N as backup, rest junk
const byPage = new Map<string, Record<string, unknown>[]>();
for (const r of renders) {
  const pid = r.pageId as string;
  if (!byPage.has(pid)) byPage.set(pid, []);
  byPage.get(pid)!.push(r);
}
for (const [, rs] of byPage) {
  const actives = rs.filter((r) => r.active);
  const inactives = rs.filter((r) => !r.active).sort((a, b) => (b.version as number) - (a.version as number));
  for (const r of actives) for (const k of keysOf(r)) activeKeys.add(k);
  inactives.forEach((r, i) => {
    const set = i < KEEP ? backupKeys : junkFromRenders;
    for (const k of keysOf(r)) set.add(k);
  });
}

// ---- 3. classify every R2 object ----
const FINAL_RE = /(interior|cover|delivery|proof|export|_final)/i;
const cat = { ACTIVE: [] as string[], FINAL_EXPORT: [] as string[], APPROVED_BACKUP: [] as string[], JUNK: [] as string[] };
for (const key of objects.keys()) {
  if (activeKeys.has(key)) cat.ACTIVE.push(key);
  else if (FINAL_RE.test(key)) cat.FINAL_EXPORT.push(key);
  else if (backupKeys.has(key)) cat.APPROVED_BACKUP.push(key);
  else cat.JUNK.push(key); // superseded-render files OR orphans (referenced by no render)
}
const sizeOf = (keys: string[]) => keys.reduce((s, k) => s + (objects.get(k) ?? 0), 0);
const mb = (n: number) => (n / 1048576).toFixed(1) + ' MB';

// ---- 4. report ----
console.log(`\n=== storage:prune ${CONFIRM ? '--confirm (WILL DELETE)' : '--dry-run (no deletions)'} | keep-backups=${KEEP} ===`);
console.log(`R2 bucket: ${bucket} | prefix: ${P}/ | objects: ${objects.size} | total ${mb(sizeOf([...objects.keys()]))}\n`);
for (const k of ['ACTIVE', 'FINAL_EXPORT', 'APPROVED_BACKUP', 'JUNK'] as const) {
  console.log(`  ${k.padEnd(16)} ${String(cat[k].length).padStart(5)} files   ${mb(sizeOf(cat[k])).padStart(12)}`);
}
const orphan = cat.JUNK.filter((k) => !junkFromRenders.has(k));
console.log(`\n  (of JUNK: ${cat.JUNK.length - orphan.length} superseded-render files, ${orphan.length} orphans referenced by no render row)`);

// ---- 5. SAFETY: no JUNK key may be ACTIVE or FINAL_EXPORT ----
const unsafe = cat.JUNK.filter((k) => activeKeys.has(k) || FINAL_RE.test(k));
if (unsafe.length) { console.error(`\nABORT: ${unsafe.length} JUNK keys overlap ACTIVE/FINAL — refusing to delete. ${unsafe.slice(0,5)}`); process.exit(1); }

console.log('\n  sample JUNK to delete:');
for (const k of cat.JUNK.slice(0, 25)) console.log('   -', k, `(${mb(objects.get(k) ?? 0)})`);
if (cat.JUNK.length > 25) console.log(`   … and ${cat.JUNK.length - 25} more`);

if (!CONFIRM) {
  console.log(`\nDRY-RUN: nothing deleted. Would free ${mb(sizeOf(cat.JUNK))} across ${cat.JUNK.length} files.`);
  console.log('Re-run with --confirm to delete JUNK (ACTIVE / FINAL_EXPORT / APPROVED_BACKUP are never touched).');
  process.exit(0);
}

// ---- 6. delete JUNK (batched 1000) ----
let deleted = 0;
const junk = cat.JUNK;
for (let i = 0; i < junk.length; i += 1000) {
  const batch = junk.slice(i, i + 1000);
  await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })) } }));
  deleted += batch.length;
  console.log(`  deleted ${deleted}/${junk.length}`);
}
console.log(`\nDONE — deleted ${deleted} JUNK files, freed ${mb(sizeOf(junk))}. ACTIVE/FINAL/BACKUP untouched.`);
process.exit(0);
