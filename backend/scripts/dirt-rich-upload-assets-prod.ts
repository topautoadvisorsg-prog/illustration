/**
 * Upload the nine proven DIRT RICH illustration assets to a project's storage,
 * then prove production holds exactly those bytes.
 *
 * ─── WHY UPLOAD IS NOT THE HARD PART ──────────────────────────────────────
 * Putting nine files in a bucket is trivial. Knowing that what landed there is
 * what you meant to send is not: a truncated upload, a retried multipart, or the
 * wrong source directory all produce an object that exists, has a plausible
 * size, and renders a subtly wrong book. So nothing here trusts a successful PUT
 * — every object is READ BACK from the bucket and hashed, and the run fails
 * unless all nine match the manifest byte for byte.
 *
 * The manifest hashes are the assets the approved 126-page interior was built
 * with. They are checkpoints, not preferences.
 *
 * ─── WHAT IT WILL NOT DO ──────────────────────────────────────────────────
 * Touches only `<project>/illustrations/`. It never writes a manuscript, never
 * updates the database, and asserts at the end that the canonical source object
 * is still present and unchanged — an asset upload has no business altering the
 * one artifact the book's provenance rests on.
 *
 *   WL_ALLOW_PROD_STORAGE=1 yarn tsx scripts/dirt-rich-upload-assets-prod.ts \
 *     --project <uuid> --source "<dir>" --confirm-production
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getEnv } from '../src/env.js';

const argv = process.argv.slice(2);
const flag = (n: string): boolean => argv.includes(`--${n}`);
const value = (n: string): string | undefined => {
  const inline = argv.find((a) => a.startsWith(`--${n}=`));
  if (inline) return inline.slice(n.length + 3);
  const i = argv.indexOf(`--${n}`);
  const next = i >= 0 ? argv[i + 1] : undefined;
  return next && !next.startsWith('--') ? next : undefined;
};

/** The nine assets, with the exact bytes the approved interior was built from. */
const MANIFEST: Record<string, string> = {
  'p13-soil-profile.png': '225782897bd75cc0ddb08584fb067fb1b559c9eca8eb63fefcc04167b3511a7f',
  'p21-raised-bed.png': '305053c0e8e2a8344a84da2ea4f62609e44896f1ddf1ba316221225ad0c87eed',
  'figure-5-1-cost-per-dozen-v2.png': '44a8212406dd9537a5d708ae639592074ebbba55188161c59dcbd401418399b0',
  'p47-coop-dusk.png': 'af9ba6e93a83ca48b1b1a61a2b4a6cd24af58594bbaa2ce88fb96d2132d7d963',
  'p57-zucchini.png': 'd64f218ec4ef6e1ad661adeae4bce6a3937ff3b3f2713effd5bf9c071ea5c2f0',
  'p83-january-garden.png': '287ea5c543439877666ffda1b03924bb589621b38716f956dea94d20130b6754',
  'figure-10-1-hours-per-week-v2.png': '532da3ec7e10b0dcc7cfa6647f9c67d8af109bdf466eca0871543d9fdd92ec21',
  'p99-quarter-acre.png': 'f863e8091093fdf79687e5833885741d96c3e5ff02369a4915e06cd9f4f86729',
  'figure-E-1-site-plan.svg': '40e4bab171ea446cf4a13956d72dda4a1e1e48738b8fabbdb21df65f953d591f',
};
/** The canonical source must survive this untouched. */
const CANONICAL_SHA = 'bc27f4d50bb22be1eb4d0f4d83fa4041d97983cbbabc91077e496ee2205b358c';

const projectId = value('project') ?? '';
const source = value('source') ?? '';
const confirmed = flag('confirm-production');

if (process.env.WL_ALLOW_PROD_STORAGE !== '1') {
  console.error('Refusing to run: set WL_ALLOW_PROD_STORAGE=1 to reach production object storage.');
  process.exit(2);
}
if (!/^[0-9a-f-]{36}$/.test(projectId)) {
  console.error('Pass --project <uuid>.');
  process.exit(2);
}
if (!source || !existsSync(source)) {
  console.error(`Pass --source "<directory holding the nine assets>" (got: ${source || '(none)'})`);
  process.exit(2);
}
if (!confirmed) {
  console.error('Refusing to write to production storage without --confirm-production.');
  process.exit(2);
}

const env = getEnv();
const bucket = env.R2_BUCKET || 'wildlands';
const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const mimeFor = (n: string): string => (n.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
const prefix = `${projectId}/illustrations/`;
const failures: string[] = [];

console.log(`bucket  : ${bucket}`);
console.log(`prefix  : ${prefix}`);
console.log(`source  : ${source}\n`);

// ── 1. verify the SOURCE before anything leaves this machine ─────────────
console.log('SOURCE VERIFICATION');
const payloads = new Map<string, Buffer>();
for (const [name, want] of Object.entries(MANIFEST)) {
  const file = path.join(source, name);
  if (!existsSync(file)) { failures.push(`source missing: ${name}`); console.log(`  FAIL  ${name} — not in the source directory`); continue; }
  const bytes = readFileSync(file);
  const got = sha(bytes);
  if (got !== want) { failures.push(`source hash: ${name}`); console.log(`  FAIL  ${name} — ${got.slice(0, 16)}… != manifest`); continue; }
  payloads.set(name, bytes);
  console.log(`  OK    ${name.padEnd(32)} ${got.slice(0, 16)}…  ${bytes.length} bytes`);
}
if (failures.length) {
  console.error('\nSource does not match the manifest. Nothing uploaded.');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

// ── 2. upload ────────────────────────────────────────────────────────────
console.log('\nUPLOAD');
for (const [name, bytes] of payloads) {
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: `${prefix}${name}`, Body: bytes, ContentType: mimeFor(name),
  }));
  console.log(`  sent  ${name}`);
}

// ── 3. read every object back and hash it ────────────────────────────────
console.log('\nREAD-BACK VERIFICATION (independent of the upload)');
for (const [name, want] of Object.entries(MANIFEST)) {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `${prefix}${name}` }));
    const bytes = Buffer.from(await res.Body!.transformToByteArray());
    const got = sha(bytes);
    if (got !== want) { failures.push(`read-back hash: ${name}`); console.log(`  FAIL  ${name} — ${got.slice(0, 16)}…`); continue; }
    console.log(`  OK    ${name.padEnd(32)} ${got.slice(0, 16)}…  ${bytes.length} bytes`);
  } catch (e) {
    failures.push(`read-back failed: ${name}`);
    console.log(`  FAIL  ${name} — ${(e as Error).message.slice(0, 80)}`);
  }
}

// ── 4. exactly nine, nothing unexpected ──────────────────────────────────
console.log('\nPREFIX CONTENTS');
const listed: string[] = [];
let token: string | undefined;
do {
  const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
  for (const o of page.Contents ?? []) if (o.Key) listed.push(o.Key.slice(prefix.length));
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);

const expected = new Set(Object.keys(MANIFEST));
const unexpected = listed.filter((n) => !expected.has(n));
const missing = [...expected].filter((n) => !listed.includes(n));
console.log(`  ${Object.keys(MANIFEST).length} expected / ${listed.length} present / ${missing.length} missing / ${unexpected.length} unexpected`);
if (missing.length) { failures.push(`missing: ${missing.join(', ')}`); console.log(`  FAIL  missing: ${missing.join(', ')}`); }
if (unexpected.length) { failures.push(`unexpected: ${unexpected.join(', ')}`); console.log(`  FAIL  unexpected: ${unexpected.join(', ')}`); }

// ── 5. the canonical source must be untouched ────────────────────────────
console.log('\nCANONICAL SOURCE UNTOUCHED');
const canonicalKey = `${projectId}/manuscripts/source/DIRT-RICH-ABBY-FENWICK_FINAL.md`;
try {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: canonicalKey }));
  const bytes = Buffer.from(await res.Body!.transformToByteArray());
  const got = sha(bytes);
  const ok = got === CANONICAL_SHA;
  if (!ok) failures.push('canonical source changed');
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${got.slice(0, 16)}…  ${bytes.length} bytes`);
} catch (e) {
  failures.push('canonical source unreadable');
  console.log(`  FAIL  ${(e as Error).message.slice(0, 80)}`);
}

console.log('');
if (failures.length) {
  console.error('PHASE A FAILED — do not advance to the working manuscript.');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('PHASE A CLEAN — nine assets verified in production by read-back hash.');
