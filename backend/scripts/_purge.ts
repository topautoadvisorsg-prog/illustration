/* PURGE the book's render images from Supabase — ONLY after a verified local
 * archive (frees storage so a finished book stops gathering Supabase bills).
 *
 * HARD SAFETY (never deletes an un-backed-up file):
 *   - requires _export.ts's manifest.json in the archive dir,
 *   - requires ZERO missing/failed pages in that manifest,
 *   - re-reads every archived file and verifies its sha256 matches the manifest,
 *   - deletes ONLY the exact imagePaths recorded in the manifest,
 *   - DRY-RUN by default; deletes only with --confirm.
 *
 * Leaves inactive render versions / specs / blueprints / cover in place (small);
 * this frees the heavy active page images. Usage: _purge.ts [archiveDir] [--confirm]
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import WebSocketImpl from 'ws';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../src/env.js';

const g = globalThis as { WebSocket?: unknown };
if (typeof g.WebSocket === 'undefined') g.WebSocket = WebSocketImpl;

const BUCKET = 'project-files';
const BOOK = 'THE_WILDLANDS_NEW_ENGLAND';
const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const ARCHIVE = args.find((a) => !a.startsWith('--')) ?? 'C:/Users/jovan/Downloads/wildlands-archive';
const dir = path.join(ARCHIVE, BOOK);

const manifestRaw = await readFile(path.join(dir, 'manifest.json'), 'utf8').catch(() => null);
if (!manifestRaw) {
  console.error(`ABORT: no manifest.json in ${dir}. Run _export.ts first.`);
  process.exit(1);
}
const manifest = JSON.parse(manifestRaw) as {
  missing: number;
  files: Array<{ status: string; file?: string; sha256?: string; bytes?: number; imagePath?: string }>;
};

if (manifest.missing > 0) {
  console.error(`ABORT: archive has ${manifest.missing} missing/failed pages — fix/re-render before purging.`);
  process.exit(1);
}

const ok = manifest.files.filter((f) => f.status === 'OK');
let bad = 0;
for (const f of ok) {
  const local = await readFile(path.join(dir, f.file!)).catch(() => null);
  if (!local) {
    console.error('MISSING LOCAL FILE:', f.file);
    bad++;
    continue;
  }
  if (createHash('sha256').update(local).digest('hex') !== f.sha256) {
    console.error('SHA MISMATCH :', f.file);
    bad++;
  }
}
if (bad > 0) {
  console.error(`ABORT: ${bad} archived files failed verification. Re-run _export.ts before purging.`);
  process.exit(1);
}
const targets = ok.map((f) => f.imagePath!).filter(Boolean);
const freedMB = (ok.reduce((s, f) => s + (f.bytes ?? 0), 0) / 1024 / 1024).toFixed(1);
console.log(`Archive verified: ${ok.length} files present, all sha256 match.`);
console.log(`Would delete ${targets.length} images from Supabase (~${freedMB} MB freed).`);

if (!CONFIRM) {
  console.log('\nDRY RUN — nothing deleted. Re-run with --confirm to delete from Supabase.');
  process.exit(0);
}

const env = getEnv();
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let deleted = 0;
for (let i = 0; i < targets.length; i += 100) {
  const chunk = targets.slice(i, i + 100);
  const { error } = await client.storage.from(BUCKET).remove(chunk);
  if (error) {
    console.error('DELETE error:', error.message);
    process.exit(1);
  }
  deleted += chunk.length;
  console.log(`deleted ${deleted}/${targets.length}`);
}
console.log(`\nPURGED ${deleted} images. Your local archive at ${dir} is now the system of record.`);
process.exit(0);
