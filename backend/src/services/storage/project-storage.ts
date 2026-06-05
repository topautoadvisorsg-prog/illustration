/**
 * Project file storage — persistent (Supabase Storage) in production, local disk
 * for tests/dev. Railway's container disk is ephemeral: anything written locally
 * is wiped on every redeploy/restart, which silently destroyed generated images
 * and rendered PDFs. Supabase Storage (already configured) keeps them durable.
 *
 * Both implementations share the same interface, and stored paths are identical
 * ("<projectId>/<segment>/<segment>"), so callers don't care which is active.
 */

import { createHash } from 'node:crypto';
import WebSocketImpl from 'ws';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv, isPlaceholder } from '../../env.js';
import { LocalStorageService, type StoredFile } from './local-storage.js';

// supabase-js v2 builds a Realtime client that requires a WebSocket. Node 20 (the
// backend runtime) has no global WebSocket, so createClient throws even though we
// only use Storage. Polyfill it once. (Node 22+ would have this natively.)
const g = globalThis as { WebSocket?: unknown };
if (typeof g.WebSocket === 'undefined') {
  g.WebSocket = WebSocketImpl;
}

export type { StoredFile } from './local-storage.js';
export { LocalStorageService } from './local-storage.js';

export interface ProjectStorage {
  writeProjectFile(projectId: string, parts: string[], data: Buffer | string): Promise<StoredFile>;
  readProjectFile(relativePath: string): Promise<Buffer>;
}

const BUCKET = 'project-files';

function contentTypeFor(key: string): string {
  if (key.endsWith('.pdf')) return 'application/pdf';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.md') || key.endsWith('.markdown')) return 'text/markdown';
  if (key.endsWith('.txt')) return 'text/plain';
  if (key.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

/** Persistent storage backed by a private Supabase Storage bucket. */
export class SupabaseStorageService implements ProjectStorage {
  private readonly client: SupabaseClient;
  private bucketReady: Promise<void> | null = null;

  constructor() {
    const env = getEnv();
    this.client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private ensureBucket(): Promise<void> {
    if (!this.bucketReady) {
      // Idempotent: createBucket errors if it already exists — that's fine.
      this.bucketReady = this.client.storage
        .createBucket(BUCKET, { public: false })
        .then(() => undefined)
        .catch(() => undefined);
    }
    return this.bucketReady;
  }

  async writeProjectFile(projectId: string, parts: string[], data: Buffer | string): Promise<StoredFile> {
    await this.ensureBucket();
    const safeParts = parts.map((part) => part.replace(/[^a-zA-Z0-9._-]/g, '_'));
    const key = [projectId, ...safeParts].join('/');
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(key, buffer, { contentType: contentTypeFor(key), upsert: true });
    if (error) throw new Error(`Supabase Storage upload failed for ${key}: ${error.message}`);
    return {
      relativePath: key,
      absolutePath: `supabase://${BUCKET}/${key}`,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      sizeBytes: buffer.byteLength,
    };
  }

  async readProjectFile(relativePath: string): Promise<Buffer> {
    await this.ensureBucket();
    const { data, error } = await this.client.storage.from(BUCKET).download(relativePath);
    if (error || !data) {
      throw new Error(`Supabase Storage download failed for ${relativePath}: ${error?.message ?? 'no data'}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }
}

/**
 * The active project storage: Supabase when configured (production), else local
 * disk (tests/dev). Callers use this instead of `new LocalStorageService()` so
 * files persist across redeploys.
 */
export function isSupabaseStorageConfigured(): boolean {
  const env = getEnv();
  return !isPlaceholder(env.SUPABASE_URL) && !isPlaceholder(env.SUPABASE_SERVICE_ROLE_KEY);
}

/** 'supabase' = durable; 'local-ephemeral' = wiped on every Railway redeploy. */
export function activeStorageKind(): 'supabase' | 'local-ephemeral' {
  return isSupabaseStorageConfigured() ? 'supabase' : 'local-ephemeral';
}

export function getProjectStorage(): ProjectStorage {
  const env = getEnv();
  if (isSupabaseStorageConfigured()) {
    return new SupabaseStorageService();
  }
  // Local disk is EPHEMERAL on Railway — anything written is lost on the next
  // redeploy/restart, which silently destroyed the image library before. Never
  // fall back to it in production: fail loudly so the misconfiguration is caught
  // immediately instead of being discovered later as a vanished library.
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'PERSISTENT STORAGE NOT CONFIGURED: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing or placeholders in ' +
        'production. Refusing to use ephemeral local disk because generated images and rendered PDFs would be lost on ' +
        'the next redeploy. Set the Supabase Storage env vars on the backend service.',
    );
  }
  return new LocalStorageService();
}
