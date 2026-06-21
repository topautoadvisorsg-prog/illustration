/* Proves the read/write-through cache eliminates repeat backing-store transfers
 * (= zero egress on repeat reads). No spend, no Supabase. Usage: _cachetest.ts */
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CachedStorageService } from '../src/services/storage/cached-storage.js';
import type { ProjectStorage } from '../src/services/storage/project-storage.js';
import type { StoredFile } from '../src/services/storage/local-storage.js';

// In-memory backing store that COUNTS how many times it is actually hit.
class CountingInner implements ProjectStorage {
  reads = 0;
  writes = 0;
  private store = new Map<string, Buffer>();
  async writeProjectFile(projectId: string, parts: string[], data: Buffer | string): Promise<StoredFile> {
    this.writes++;
    const key = [projectId, ...parts].join('/');
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    this.store.set(key, buf);
    return { relativePath: key, absolutePath: `mem://${key}`, sha256: '', sizeBytes: buf.byteLength };
  }
  async readProjectFile(relativePath: string): Promise<Buffer> {
    this.reads++;
    const b = this.store.get(relativePath);
    if (!b) throw new Error('not found');
    return b;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const proj = `__cachetest_${Date.now()}__`;
const payload = `hello-cache-${Date.now()}`;

const inner = new CountingInner();
const storage = new CachedStorageService(inner);

const written = await storage.writeProjectFile(proj, ['probe', 'x.txt'], payload);
const r1 = (await storage.readProjectFile(written.relativePath)).toString();
const r2 = (await storage.readProjectFile(written.relativePath)).toString();
const r3 = (await storage.readProjectFile(written.relativePath)).toString();

console.log(`backing-store writes: ${inner.writes}  (expect 1)`);
console.log(`backing-store READS : ${inner.reads}   (expect 0 — every read served from cache = ZERO egress)`);
console.log(`content correct     : ${r1 === payload && r2 === payload && r3 === payload}`);
const pass = inner.writes === 1 && inner.reads === 0 && r1 === payload && r3 === payload;
console.log(pass ? '\nCACHE PASS — 1 write, 3 reads, 0 backing-store transfers.' : '\nCACHE FAIL');

await rm(path.resolve(__dirname, '../.render-cache', proj), { recursive: true, force: true }).catch(() => undefined);
process.exit(pass ? 0 : 1);
