/**
 * A STORAGE KEY MUST SURVIVE A ROUND TRIP THROUGH A URL.
 *
 * Keys returned by `writeProjectFile` are persisted on the project row and later
 * handed to the console, which puts them in a query string to fetch the asset
 * for review. So a key is a URL component, not an OS path.
 *
 * ─── THE FAILURE THIS LOCKS DOWN ──────────────────────────────────────────
 * `LocalStorageService` used `path.join`, which emits `\` on Windows. Every
 * asset written on a Windows dev box was keyed `<id>\cover\cover-wrap-art-v1.png`.
 * The file route rejects that as malformed (400), the `<img>` fails, and the
 * console's onError handler clears the cover — so a generated cover was
 * INVISIBLE with no error shown anywhere. Measured against the running server:
 * backslash key 400; the same asset with forward slashes 200 and 1.9 MB.
 *
 * It was invisible in production too, in the other sense: R2 and Supabase both
 * key with forward slashes, so only local disk was affected and only on Windows.
 * That is exactly the kind of platform-vs-dev divergence that costs hours.
 *
 * These tests are deliberately about the CONTRACT every backend shares, not
 * about covers and not about any one book.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalStorageService } from '../services/storage/local-storage.js';

let root: string;
let store: LocalStorageService;
const PROJECT = '11111111-2222-4333-8444-555555555555';

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'wl-storage-key-'));
  store = new LocalStorageService(root);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('storage keys are portable', () => {
  it('never contains a backslash, whatever the host OS', async () => {
    const f = await store.writeProjectFile(PROJECT, ['cover', 'cover-wrap-art-v1.png'], Buffer.from('x'));
    expect(f.relativePath).not.toContain('\\');
    expect(f.relativePath).toBe(`${PROJECT}/cover/cover-wrap-art-v1.png`);
  });

  it('survives encodeURIComponent and decodes back to itself', async () => {
    // The console does exactly this. A key that changes shape here is a key that
    // fetches a 400.
    const f = await store.writeProjectFile(PROJECT, ['manuscripts', 'BOOK.md'], 'text');
    expect(decodeURIComponent(encodeURIComponent(f.relativePath))).toBe(f.relativePath);
    expect(encodeURIComponent(f.relativePath)).not.toContain('%5C'); // %5C is a backslash
  });

  it('splits into clean segments, none empty', async () => {
    const f = await store.writeProjectFile(PROJECT, ['illustrations', 'p13.png'], Buffer.from('y'));
    const segments = f.relativePath.split('/');
    expect(segments).toEqual([PROJECT, 'illustrations', 'p13.png']);
    expect(segments.every((s) => s.length > 0)).toBe(true);
  });

  it('reads back what it wrote, by its own key', async () => {
    const f = await store.writeProjectFile(PROJECT, ['exports', 'a.txt'], 'round trip');
    expect((await store.readProjectFile(f.relativePath)).toString('utf8')).toBe('round trip');
  });

  it('still reads LEGACY backslash keys, so old rows are not orphaned', async () => {
    // Rows written before the fix hold `<id>\cover\...`. Rejecting them would
    // turn every previously generated cover into a missing file.
    const f = await store.writeProjectFile(PROJECT, ['cover', 'legacy.png'], Buffer.from('legacy'));
    const legacyKey = f.relativePath.replace(/\//g, '\\');
    expect((await store.readProjectFile(legacyKey)).toString('utf8')).toBe('legacy');
  });

  it('applies to every asset kind, not just covers', async () => {
    // The bug hit manuscripts as well; the guarantee is about the storage layer.
    for (const parts of [
      ['cover', 'wrap.png'],
      ['manuscripts', 'source', 'BOOK.md'],
      ['illustrations', 'figure.svg'],
      ['exports', 'interior.pdf'],
    ]) {
      const f = await store.writeProjectFile(PROJECT, parts, Buffer.from('z'));
      expect(f.relativePath, `key for ${parts.join('/')}`).not.toMatch(/\\/);
    }
  });
});
