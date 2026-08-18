import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getEnv } from '../../env.js';

export interface StoredFile {
  relativePath: string;
  absolutePath: string;
  sha256: string;
  sizeBytes: number;
}

export class LocalStorageService {
  private readonly root: string;

  constructor(root = getEnv().STORAGE_ROOT) {
    this.root = path.resolve(root);
  }

  /**
   * A STORAGE KEY IS NOT AN OS PATH.
   *
   * `relativePath` is persisted in the database and later handed to the console,
   * which puts it in a URL to fetch the asset for review. `path.join` emits `\`
   * on Windows, so every asset written on a Windows dev box got a key like
   * `<id>\cover\cover-wrap-art-v1.png`. The file-serving route rejects that as
   * malformed (HTTP 400), the `<img>` fails, and the console's error handler
   * quietly clears the cover — so a generated cover was simply invisible, with
   * no error anywhere. Measured: backslash key 400, same asset with forward
   * slashes 200 and 1.9 MB.
   *
   * It never showed in production because R2 and Supabase both key with forward
   * slashes; local disk was the only backend that did not. Keys are therefore
   * normalised to POSIX separators here, so every storage backend returns the
   * same shape and the key survives a round trip through a URL.
   */
  private static toKey(...parts: string[]): string {
    return parts.join('/').replace(/\\/g, '/');
  }

  async writeProjectFile(projectId: string, parts: string[], data: Buffer | string): Promise<StoredFile> {
    const safeParts = parts.map((part) => part.replace(/[^a-zA-Z0-9._-]/g, '_'));
    const relativePath = LocalStorageService.toKey(projectId, ...safeParts);
    const absolutePath = path.join(this.root, projectId, ...safeParts);
    await mkdir(path.dirname(absolutePath), { recursive: true });

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    await writeFile(absolutePath, buffer);
    return {
      relativePath,
      absolutePath,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      sizeBytes: buffer.byteLength,
    };
  }

  /**
   * Accepts either separator. Rows written before the normalisation above still
   * hold backslash keys, and a read that rejected them would turn an old cover
   * into a missing file rather than a displayable one.
   */
  async readProjectFile(relativePath: string): Promise<Buffer> {
    const segments = relativePath.split(/[\\/]+/).filter(Boolean);
    return readFile(path.join(this.root, ...segments));
  }

  async listProjectFiles(projectId: string, folder: string): Promise<string[]> {
    try {
      return (await readdir(path.join(this.root, projectId, folder))).sort();
    } catch {
      return [];
    }
  }
}
