# services/storage

**Status:** Phase 0 — scaffold only. `LocalStorageService` implementation in Phase 1; `StorageService` interface used by Spike 2 directly.

`StorageService` interface — the storage abstraction.

**Why this exists:** V1 uses local disk. V2 swaps to S3. By going through an interface from Day 1, the swap is a 50-line change.

**Interface (Phase 1):**
```ts
interface StorageService {
  saveAsset(key: string, data: Buffer): Promise<string>; // returns canonical path/URL
  getAsset(key: string): Promise<Buffer>;
  getAssetUrl(key: string): Promise<string>;             // local: file://, s3: https signed URL
  deleteAsset(key: string): Promise<void>;
  listAssets(prefix: string): Promise<string[]>;
  exists(key: string): Promise<boolean>;
}
```

**Implementations:**
- `LocalStorageService` — V1, writes under `STORAGE_ROOT`
- `S3StorageService` — V2 (stub only in v1)

**Directory layout (V1 — `STORAGE_ROOT`):**
```
{brand}/manuscripts/{book_id}_MASTER.md
{brand}/config/{book_id}_config.json
{brand}/page-plan/{book_id}/book_manifest.json
{brand}/page-plan/{book_id}/chapters/CH{NN}_manifest.json
{brand}/page-plan/{book_id}/pages/{book_id}_P{NNN}.json
{brand}/assets/{book_id}/generated/{page_id}_v{N}.png
{brand}/assets/{book_id}/upscaled/{page_id}_v{N}_300dpi.png
{brand}/output/{book_id}/chapters/{book_id}_CH{NN}.pdf
{brand}/output/{book_id}/editions/{book_id}_PREMIUM.pdf
{brand}/output/{book_id}/editions/{book_id}_KINDLE.epub
```

**What can go wrong:**
- `ENOSPC` — disk full
- `EACCES` — `STORAGE_ROOT` not writable; check perms
- Path traversal — all `key` arguments are normalized + validated; absolute paths rejected
