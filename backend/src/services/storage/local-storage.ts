import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

  async writeProjectFile(projectId: string, parts: string[], data: Buffer | string): Promise<StoredFile> {
    const safeParts = parts.map((part) => part.replace(/[^a-zA-Z0-9._-]/g, '_'));
    const relativePath = path.join(projectId, ...safeParts);
    const absolutePath = path.join(this.root, relativePath);
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

  async readProjectFile(relativePath: string): Promise<Buffer> {
    return readFile(path.join(this.root, relativePath));
  }
}
