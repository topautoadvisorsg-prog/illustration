import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestManuscript } from '../pipeline/stage-1-ingestion/ingest-manuscript.js';
import { LocalStorageService } from '../services/storage/local-storage.js';

describe('ingestManuscript', () => {
  it('stores markdown manuscripts with a stable sha256', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wildlands-storage-'));
    try {
      const result = await ingestManuscript(
        {
          projectId: '11111111-1111-4111-8111-111111111111',
          filename: 'chapter-1.md',
          markdown: '# Chanterelle\n\nGolden field notes.',
        },
        new LocalStorageService(root),
      );

      expect(result.manuscript.relativePath).toContain('manuscripts');
      expect(result.manuscript.sha256).toHaveLength(64);
      expect(result.manuscript.sizeBytes).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects non-markdown manuscripts', async () => {
    await expect(
      ingestManuscript({
        projectId: '11111111-1111-4111-8111-111111111111',
        filename: 'chapter-1.txt',
        markdown: 'wrong extension',
      }),
    ).rejects.toThrow('Manuscript must be a .md file');
  });
});
