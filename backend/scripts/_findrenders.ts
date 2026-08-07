/* Find rendered image files still in R2 for this project, grouped by pageKey.
 * Recovery aid after a re-paginate deleted DB rows. Read-only. Usage: _findrenders.ts [KEYFILTER] */
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getEnv } from '../src/env.js';
import { P } from './_project.js';

const FILTER = process.argv[2] ?? '';
const env = getEnv();
const r2 = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
const Bucket = env.R2_BUCKET || 'project-files';

let token: string | undefined;
const keys: { key: string; size: number; mod?: Date }[] = [];
do {
  const out = await r2.send(new ListObjectsV2Command({ Bucket, Prefix: P, ContinuationToken: token, MaxKeys: 1000 }));
  for (const o of out.Contents ?? []) keys.push({ key: o.Key!, size: o.Size ?? 0, mod: o.LastModified });
  token = out.IsTruncated ? out.NextContinuationToken : undefined;
} while (token);

console.log(`project ${P}: ${keys.length} objects in R2`);
// Focus on render image/pdf files that mention a CH page key
const CH = /(CH\d+_P\d+[a-z0-9_]*)/i;
const renders = keys.filter((k) => CH.test(k.key) && /\.(png|pdf)$/i.test(k.key));
const byPage = new Map<string, { key: string; size: number; mod?: Date }[]>();
for (const r of renders) {
  const m = r.key.match(CH)!;
  const pk = m[1].toUpperCase();
  if (FILTER && !pk.startsWith(FILTER.toUpperCase())) continue;
  if (!byPage.has(pk)) byPage.set(pk, []);
  byPage.get(pk)!.push(r);
}
console.log(`\nrender files by CH page key${FILTER ? ` (filter ${FILTER})` : ''}:`);
for (const pk of [...byPage.keys()].sort()) {
  const files = byPage.get(pk)!.sort((a, b) => (b.mod?.getTime() ?? 0) - (a.mod?.getTime() ?? 0));
  const newest = files[0];
  console.log(`  ${pk}: ${files.length} file(s), newest ${newest.mod?.toISOString().slice(0,16)} (${(newest.size/1024).toFixed(0)}KB)`);
  for (const f of files.slice(0, 4)) console.log(`       ${f.key}`);
}
process.exit(0);
