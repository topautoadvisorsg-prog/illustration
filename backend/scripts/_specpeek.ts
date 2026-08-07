/* Peek at a recovered spec JSON to map fields for row reconstruction. Read-only. */
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getEnv } from '../src/env.js';
import { P } from './_project.js';

const env = getEnv();
const r2 = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
const out = await r2.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET || 'project-files', Prefix: `${P}/experimental/whole-page/CH02_P001-` }));
const jsonKey = (out.Contents ?? []).map(o=>o.Key!).find(k=>k.endsWith('.json'))!;
console.log('spec file:', jsonKey);
const buf = await getProjectStorage().readProjectFile(jsonKey);
const spec = JSON.parse(buf.toString('utf8'));
console.log('TOP-LEVEL KEYS:', Object.keys(spec).join(', '));
console.log('standardVersion:', spec.standardVersion);
console.log('layout/template:', spec.layoutTemplate ?? spec.layout ?? spec.composition?.layoutTemplate);
console.log('dims:', spec.widthPx, spec.heightPx, '| sizePx:', JSON.stringify(spec.sizePx ?? spec.canvas ?? {}));
console.log('model:', spec.model);
process.exit(0);
