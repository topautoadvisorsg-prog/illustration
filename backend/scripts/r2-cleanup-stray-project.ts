/**
 * Remove the objects an ACCIDENTAL dev intake wrote into production R2.
 *
 * Background: before dev/prod storage isolation existed, a local dev backend
 * with production credentials in its environment resolved `getProjectStorage()`
 * to R2. A local intake therefore wrote one project's files into the production
 * bucket while its database row stayed in local `wildlands_dev`.
 *
 * ─── WHY THIS IS NOT A PRUNE TOOL ─────────────────────────────────────────
 * It deletes ONLY keys under one explicitly named project prefix, only after
 * listing them, and only when every safety assertion below holds. There is no
 * prefix-wide sweep, no "clean up orphans", no globbing. A cleanup tool that can
 * be pointed at anything eventually is.
 *
 * Safety:
 *   - requires BOTH `--project=<uuid>` and `--confirm-delete` to delete anything;
 *     with no flag it LISTS and exits, which is the default and the normal use
 *   - requires `WL_ALLOW_PROD_STORAGE=1`, because the isolation guard now stops
 *     a dev process reaching production storage by accident. Reaching it has to
 *     be a deliberate, visible act
 *   - refuses if any listed key falls outside the project prefix
 *   - refuses if the object count exceeds MAX_OBJECTS (a real project has more;
 *     an accidental intake has a handful)
 *   - never touches the database, and never touches another project
 *
 *   yarn tsx scripts/r2-cleanup-stray-project.ts --project=<uuid>
 *   yarn tsx scripts/r2-cleanup-stray-project.ts --project=<uuid> --confirm-delete
 */
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { getEnv } from '../src/env.js';

/** An accidental intake writes a manuscript and little else. */
const MAX_OBJECTS = 10;

const args = process.argv.slice(2);
const projectId = args.find((a) => a.startsWith('--project='))?.split('=')[1] ?? '';
const confirmDelete = args.includes('--confirm-delete');

if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
  console.error('Refusing to run: pass --project=<uuid>. This tool never operates on a bare prefix.');
  process.exit(2);
}
if (process.env.WL_ALLOW_PROD_STORAGE !== '1') {
  console.error(
    'Refusing to run: set WL_ALLOW_PROD_STORAGE=1 to reach production storage deliberately.\n' +
      'Dev/prod isolation blocks this path by default, and that default is the point.',
  );
  process.exit(2);
}

const env = getEnv();
const bucket = env.R2_BUCKET || 'wildlands';
const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const prefix = `${projectId}/`;
console.log(`bucket : ${bucket}`);
console.log(`prefix : ${prefix}`);
console.log(`mode   : ${confirmDelete ? 'DELETE (confirmed)' : 'LIST ONLY'}\n`);

// ── list ────────────────────────────────────────────────────────────────────
const listed: { key: string; size: number; modified: string }[] = [];
let token: string | undefined;
do {
  const res = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
  );
  for (const o of res.Contents ?? []) {
    if (!o.Key) continue;
    listed.push({
      key: o.Key,
      size: o.Size ?? 0,
      modified: o.LastModified ? o.LastModified.toISOString() : 'unknown',
    });
  }
  token = res.IsTruncated ? res.NextContinuationToken : undefined;
} while (token);

if (listed.length === 0) {
  console.log('No objects under this prefix. Nothing to do.');
  process.exit(0);
}

console.log(`${listed.length} object(s) found:`);
for (const o of listed) console.log(`  ${o.key}\n      ${o.size} bytes   modified ${o.modified}`);

// ── verify ──────────────────────────────────────────────────────────────────
const outside = listed.filter((o) => !o.key.startsWith(prefix));
if (outside.length) {
  console.error(`\nREFUSING: ${outside.length} listed key(s) fall outside the project prefix.`);
  process.exit(1);
}
if (listed.length > MAX_OBJECTS) {
  console.error(
    `\nREFUSING: ${listed.length} objects exceeds the ${MAX_OBJECTS}-object ceiling for an accidental intake. ` +
      `This looks like a real project. Inspect it by hand rather than raising the limit.`,
  );
  process.exit(1);
}
console.log(`\nverified: all ${listed.length} key(s) are under ${prefix}, within the ${MAX_OBJECTS}-object ceiling.`);

if (!confirmDelete) {
  console.log('\nLIST ONLY — nothing deleted. Re-run with --confirm-delete to remove exactly these keys.');
  process.exit(0);
}

// ── delete ──────────────────────────────────────────────────────────────────
console.log('\ndeleting:');
const deleted: string[] = [];
for (const o of listed) {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.key }));
  deleted.push(o.key);
  console.log(`  DELETED  ${o.key}`);
}

// ── confirm removal ─────────────────────────────────────────────────────────
const after = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
const remaining = (after.Contents ?? []).length;
console.log(`\ndeleted ${deleted.length} object(s); ${remaining} remaining under ${prefix}`);
process.exit(remaining === 0 ? 0 : 1);
