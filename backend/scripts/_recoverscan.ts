/* List EVERY R2 object (all extensions) for the 8 rendered pages so we know
 * exactly what survived (image / blueprint / spec / prompt). Read-only. */
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getEnv } from '../src/env.js';
import { P } from './_project.js';

const KEYS = ['CH01_P001','CH02_P001','CH02_P024','CH02_P024_c1','CH02_P028','CH03_P009','CH03_P009_c1','CH03_P013'];
const env = getEnv();
const r2 = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
const Bucket = env.R2_BUCKET || 'project-files';
let token: string | undefined; const all: {k:string;s:number;m?:Date}[] = [];
do {
  const out = await r2.send(new ListObjectsV2Command({ Bucket, Prefix: `${P}/experimental/whole-page/`, ContinuationToken: token, MaxKeys: 1000 }));
  for (const o of out.Contents ?? []) all.push({ k: o.Key!, s: o.Size ?? 0, m: o.LastModified });
  token = out.IsTruncated ? out.NextContinuationToken : undefined;
} while (token);

for (const key of KEYS) {
  const re = new RegExp(`/${key}-[0-9a-f-]+`, 'i');
  const files = all.filter((f) => re.test(f.k)).sort((a,b)=>(b.m?.getTime()??0)-(a.m?.getTime()??0));
  const exts = new Set(files.map((f)=>f.k.replace(/^.*\.([a-z]+)$/i,'$1').toLowerCase()));
  console.log(`${key}: ${files.length} files  ext={${[...exts].join(',')}}`);
}
process.exit(0);
