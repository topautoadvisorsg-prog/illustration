/* Prove which storage backend is active and that a write/read round-trips through it.
 * Writes a tiny probe via getProjectStorage(), HEADs it directly in R2 to confirm it
 * landed there, reads it back, then reports. Read+write (one tiny probe file).
 * Usage: _storagecheck.ts */
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getProjectStorage, activeStorageKind, isR2StorageConfigured, isSupabaseStorageConfigured } from '../src/services/storage/project-storage.js';
import { getEnv } from '../src/env.js';
import { P } from './_project.js';

console.log('activeStorageKind     :', activeStorageKind());
console.log('R2 configured         :', isR2StorageConfigured());
console.log('Supabase configured   :', isSupabaseStorageConfigured());
console.log('fallback active       :', isR2StorageConfigured() && isSupabaseStorageConfigured());

const storage = getProjectStorage();
const stamp = `probe-${Date.now()}.txt`;
const payload = `r2 storage check ${new Date().toISOString()}`;
const stored = await storage.writeProjectFile(P, ['_diagnostics', stamp], payload);
console.log('\nwrote via getProjectStorage →', stored.relativePath);

const env = getEnv();
const r2 = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
try {
  const head = await r2.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET || 'project-files', Key: stored.relativePath }));
  console.log('confirmed in R2       : YES (', head.ContentLength, 'bytes )');
} catch {
  console.log('confirmed in R2       : NO — write did NOT land in R2');
}
const back = (await storage.readProjectFile(stored.relativePath)).toString('utf8');
console.log('read back matches     :', back === payload ? 'YES' : 'NO');
console.log('\n→ Local pipeline is writing/reading through', activeStorageKind().toUpperCase());
process.exit(0);
