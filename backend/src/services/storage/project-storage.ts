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
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getEnv, isPlaceholder } from '../../env.js';
import { LocalStorageService, type StoredFile } from './local-storage.js';
import { CachedStorageService } from './cached-storage.js';

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
 * Persistent storage backed by a private Cloudflare R2 bucket (S3-compatible).
 * Zero egress fees — replaces Supabase Storage for image/file serving. Same key
 * scheme (`<projectId>/<segment>/...`) and same StoredFile shape as the Supabase
 * service, so it is a drop-in behind the ProjectStorage interface: the DB paths,
 * the serving routes, and the frontend are all unchanged.
 */
export class R2StorageService implements ProjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const env = getEnv();
    this.bucket = env.R2_BUCKET || BUCKET;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async writeProjectFile(projectId: string, parts: string[], data: Buffer | string): Promise<StoredFile> {
    const safeParts = parts.map((part) => part.replace(/[^a-zA-Z0-9._-]/g, '_'));
    const key = [projectId, ...safeParts].join('/');
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentTypeFor(key),
      }),
    );
    return {
      relativePath: key,
      absolutePath: `r2://${this.bucket}/${key}`,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      sizeBytes: buffer.byteLength,
    };
  }

  async readProjectFile(relativePath: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: relativePath }),
    );
    if (!res.Body) throw new Error(`R2 download failed for ${relativePath}: no body`);
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }
}

/**
 * R2-primary with Supabase read-fallback. Writes always go to R2 (the new primary).
 * Reads try R2 first; if the object isn't there yet (partial migration) or R2 errs,
 * it transparently falls back to Supabase. This makes the cutover safe BEFORE the
 * bulk copy finishes: R2 serves whatever has been copied, Supabase silently covers
 * the rest, and the background copy fills R2 the rest of the way. Exactly the
 * "use R2, keep Supabase as the safety net" model. Remove the secondary once the
 * copy is verified complete to go pure-R2 (zero egress).
 */
export class FallbackStorageService implements ProjectStorage {
  constructor(private readonly primary: ProjectStorage, private readonly secondary: ProjectStorage) {}

  async writeProjectFile(projectId: string, parts: string[], data: Buffer | string): Promise<StoredFile> {
    // R2-ONLY write (primary). We deliberately do NOT dual-write to Supabase:
    // print-prep artifacts are large (17 MB+ per page) and writing every file twice
    // (Supabase being the slow side) roughly doubled build/upload time and bloated
    // storage. The console reads R2; to surface one specific review image in the
    // Supabase-backed console, push just that file with scripts/_syncimg.ts.
    return this.primary.writeProjectFile(projectId, parts, data);
  }

  async readProjectFile(relativePath: string): Promise<Buffer> {
    try {
      return await this.primary.readProjectFile(relativePath);
    } catch {
      // Not in R2 yet (or R2 read error) — serve it from Supabase so nothing 404s
      // mid-migration. The bulk copy is responsible for eventually populating R2.
      return this.secondary.readProjectFile(relativePath);
    }
  }
}

/**
 * The active project storage: R2 when configured (preferred — zero egress), else
 * Supabase when configured (durable fallback during cutover), else local disk
 * (tests/dev). Callers use this instead of `new LocalStorageService()` so files
 * persist across redeploys.
 */
export function isR2StorageConfigured(): boolean {
  const env = getEnv();
  return (
    !isPlaceholder(env.R2_ACCOUNT_ID) &&
    !isPlaceholder(env.R2_ACCESS_KEY_ID) &&
    !isPlaceholder(env.R2_SECRET_ACCESS_KEY)
  );
}

export function isSupabaseStorageConfigured(): boolean {
  const env = getEnv();
  return !isPlaceholder(env.SUPABASE_URL) && !isPlaceholder(env.SUPABASE_SERVICE_ROLE_KEY);
}

/** 'r2'/'supabase' = durable; 'local-ephemeral' = wiped on every Railway redeploy. */
export function activeStorageKind(): 'r2' | 'supabase' | 'local-ephemeral' {
  if (isR2StorageConfigured()) return 'r2';
  return isSupabaseStorageConfigured() ? 'supabase' : 'local-ephemeral';
}

export function getProjectStorage(): ProjectStorage {
  const env = getEnv();
  let inner: ProjectStorage;
  if (isR2StorageConfigured()) {
    const r2 = new R2StorageService();
    // When Supabase is ALSO configured, wrap with read-fallback so a partial R2
    // migration is safe: R2 serves what it has, Supabase covers any miss.
    inner = isSupabaseStorageConfigured() ? new FallbackStorageService(r2, new SupabaseStorageService()) : r2;
  } else if (isSupabaseStorageConfigured()) {
    inner = new SupabaseStorageService();
  } else if (env.NODE_ENV === 'production') {
    // Local disk is EPHEMERAL on Railway — anything written is lost on the next
    // redeploy/restart, which silently destroyed the image library before. Never
    // fall back to it in production: fail loudly so the misconfiguration is caught
    // immediately instead of being discovered later as a vanished library.
    throw new Error(
      'PERSISTENT STORAGE NOT CONFIGURED: neither the R2 (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY) nor ' +
        'the Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) storage credentials are set in production. Refusing to ' +
        'use ephemeral local disk because generated images and rendered PDFs would be lost on the next redeploy. Set the ' +
        'R2 (preferred) or Supabase Storage env vars on the backend service.',
    );
  } else {
    inner = new LocalStorageService();
  }
  // Wrap with a read/write-through LOCAL cache so each IMMUTABLE render is
  // transferred at most once — this kills the repeat-download egress that tripped
  // Supabase's egress quota (1.48 GB stored served as 63 GB of egress). The wrapper
  // is transparent + best-effort, so every consumer (render pipeline, review
  // scripts, the deployed backend) benefits with no other change. See cached-storage.ts.
  return new CachedStorageService(inner);
}
