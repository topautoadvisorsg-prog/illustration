/**
 * Read/write-through LOCAL cache wrapping any ProjectStorage.
 *
 * The egress killer (2026-06-20): renders are IMMUTABLE (each version is a fixed
 * file that never changes), yet the review tooling re-downloaded the same images
 * from Supabase every time — 1.48 GB of storage served as 63 GB of egress, which
 * tripped Supabase's egress quota and froze the project.
 *
 * Fix: transfer each immutable file AT MOST ONCE.
 *   - writeProjectFile (render upload): also drop the bytes in a local cache, so a
 *     later read of a freshly-rendered page costs ZERO egress.
 *   - readProjectFile (review/serve): serve from the local cache when present;
 *     only hit the backing store on a miss, then cache it. Immutable files never
 *     go stale, so the cache is always valid.
 *
 * The cache is best-effort: any cache I/O error is swallowed and the real backing
 * store is used, so caching can never break or corrupt a render.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StoredFile } from './local-storage.js';
import type { ProjectStorage } from './project-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Default: backend/.render-cache (gitignored). Override with RENDER_CACHE_DIR.
const CACHE_ROOT = process.env.RENDER_CACHE_DIR ?? path.resolve(__dirname, '../../../.render-cache');

/** Mirror the storage key under the cache dir, sanitized to safe path segments. */
function cachePathFor(relativePath: string): string {
  const safe = relativePath
    .split('/')
    .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, '_'))
    .join(path.sep);
  return path.join(CACHE_ROOT, safe);
}

export class CachedStorageService implements ProjectStorage {
  constructor(private readonly inner: ProjectStorage) {}

  async writeProjectFile(projectId: string, parts: string[], data: Buffer | string): Promise<StoredFile> {
    // The real (durable) write happens first and is authoritative.
    const result = await this.inner.writeProjectFile(projectId, parts, data);
    // Write-through: a freshly-written file is cached so review needs no egress.
    try {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      const cp = cachePathFor(result.relativePath);
      await mkdir(path.dirname(cp), { recursive: true });
      await writeFile(cp, buf);
    } catch {
      /* cache is best-effort — never fail the real write */
    }
    return result;
  }

  async readProjectFile(relativePath: string): Promise<Buffer> {
    const cp = cachePathFor(relativePath);
    try {
      return await readFile(cp); // cache HIT → zero egress
    } catch {
      /* miss → fall through to the backing store */
    }
    const buf = await this.inner.readProjectFile(relativePath);
    try {
      await mkdir(path.dirname(cp), { recursive: true });
      await writeFile(cp, buf);
    } catch {
      /* best-effort */
    }
    return buf;
  }
}
