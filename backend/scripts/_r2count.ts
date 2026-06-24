/* Read-only: count objects + total bytes currently in the R2 bucket. Usage: _r2count.ts */
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getEnv } from '../src/env.js';
const env = getEnv();
const bucket = env.R2_BUCKET || 'project-files';
const r2 = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
let token: string | undefined, n = 0, bytes = 0;
do {
  const res = await r2.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }));
  for (const o of res.Contents ?? []) { n++; bytes += o.Size ?? 0; }
  token = res.IsTruncated ? res.NextContinuationToken : undefined;
} while (token);
console.log(`R2 bucket "${bucket}": ${n} objects, ${(bytes / 1e9).toFixed(2)} GB`);
process.exit(0);
