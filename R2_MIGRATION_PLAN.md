# Storage Migration Plan — Supabase Storage → Cloudflare R2

**Status:** Phase 1 APPLIED (adapter built, app unaffected) — Phases 2–4 blocked ONLY on the operator's Cloudflare account + keys.
**Author:** Claudio (CTO)  **Date:** 2026-06-22
**Scope:** Object/file storage ONLY (generated page images, print PDFs, spec/prompt/blueprint files). **The Postgres database is NOT part of this migration.**

### Progress
- ✅ **Phase 1 — adapter built & wired** (`tsc` clean, dormant until R2 keys are set; live app unchanged):
  - `@aws-sdk/client-s3` added to `backend`.
  - `R2StorageService` added in `backend/src/services/storage/project-storage.ts` (S3-compatible, same key scheme + `StoredFile` shape).
  - `getProjectStorage()` now prefers R2 → Supabase → local; `isR2StorageConfigured()` + `activeStorageKind()` updated.
  - `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` added to `env.ts` (optional) and `.env.example`.
  - One-command cutover tool written: `backend/scripts/_r2migrate.ts` (copy, idempotent/resumable) + `--verify` (reconcile count/size).
- ⏳ **Phases 2–4** — run once the operator supplies Cloudflare Account ID + R2 API keys (see §6).

### Operating constraints — APPROVED 2026-06-22 (do not violate)
- **Supabase remains the LIVE source.** Production stays on Supabase until the book ships or explicit approval.
- **R2 is ADDITIVE ONLY** right now — copy into it, never delete from Supabase yet.
- **DB stays on Supabase.** No database migration.
- **No frontend / API rewrite.** Single storage-interface swap only.
- **No destructive cleanup (no prune) until the R2 copy is fully verified** (count + byte integrity).
- **No production push / no Railway var changes yet.** All R2 code stays on the unmerged session branch.
- Current task priority is **finishing the book safely**; the migration runs in the background.

### Remaining checklist (in order)
1. ⏳ Finish keepers copy into R2 (`_r2migrate.ts --keepers-only`, idempotent/resumable).
2. ☐ Verify: `_r2migrate.ts --keepers-only --verify` → 0 missing, 0 size-mismatch.
3. ☐ Confirm fallback live: `_storagecheck.ts` (R2 primary, Supabase fallback).
4. ☐ (Hold) prune Supabase — ONLY after step 2 is clean AND on approval.
5. ☐ (Hold) production cutover — ONLY after the book ships or explicit approval.

---

## 1. Why we're doing this

Supabase Storage bills for **egress** (bytes served). Image renders are loaded/viewed repeatedly, and we already hit the wall: **1.48 GB stored was served as 63 GB of egress**, which tripped Supabase's quota and froze the project. We bolted on a local cache to survive it (`cached-storage.ts`), but that's a patch, not a fix.

**Cloudflare R2 has ZERO egress fees.** You pay only for storage (~$0.015/GB‑month) and operations. At our ~1.5 GB this sits inside R2's free tier (10 GB storage, 1M writes, 10M reads per month). Serving images stops costing money, and no provider can throttle us on egress again.

**Future note (operator):** for paying customers later we may run Supabase again for other reasons; this migration does not burn that bridge. Supabase stays intact as a backup through cutover and can be kept or dropped afterward.

---

## 2. What is and is NOT changing

| Component | Today | After migration |
|---|---|---|
| Generated images / PDFs / files | Supabase Storage bucket `project-files` (private) | **Cloudflare R2 bucket `project-files`** |
| Postgres database (pages, renders, manifests) | Supabase Postgres (pooler) | **UNCHANGED — stays on Supabase** |
| Frontend image loading | Backend streams bytes from storage | **UNCHANGED — same backend endpoint** |
| Stored file keys (`<projectId>/.../file.png`) | — | **UNCHANGED — same keys in R2** |
| DB `imagePath` / `specPath` / etc. | relative keys | **UNCHANGED — no rewrite needed** |

**Why it's clean:** all storage access goes through ONE interface — `ProjectStorage` (`writeProjectFile` / `readProjectFile`) in `backend/src/services/storage/project-storage.ts`. The frontend never talks to Supabase directly; it hits a backend endpoint (`whole-page.routes.ts`) that reads via that interface and streams the bytes. So we swap exactly one class and change nothing else.

---

## 3. Architecture of the change

### 3.1 New adapter (the only real code)
Add `R2StorageService implements ProjectStorage` alongside `SupabaseStorageService`. R2 is S3‑compatible, so it uses `@aws-sdk/client-s3`:
- **Endpoint:** `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`
- **Region:** `auto`
- `writeProjectFile` → `PutObjectCommand` (same key scheme, same `contentType` map already in `project-storage.ts`)
- `readProjectFile` → `GetObjectCommand` → Buffer
- Returns the same `StoredFile` shape (relativePath, absolutePath, sha256, sizeBytes)

Keep the existing `CachedStorageService` wrapper — still useful (avoids re-fetching immutable renders for review tooling, even though R2 egress is free).

### 3.2 Selection logic
`getProjectStorage()` picks the backend by config. New rule:
1. If R2 env vars present → **R2** (production).
2. else if Supabase env vars present → Supabase (current behavior, fallback during cutover).
3. else local disk (dev/tests).

This lets R2 and Supabase coexist so we can roll back instantly by unsetting the R2 vars.

### 3.3 New env vars (backend)
```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=project-files
```
Added to `backend/src/env.ts` as optional (so absence ≠ crash). Set in repo‑root `.env` for local scripts and in Railway → backend service → Variables for production.

### 3.4 Dependency
`yarn add @aws-sdk/client-s3` in `backend/`. (~no transitive bloat of concern; standard AWS modular SDK.)

---

## 4. Migration steps (in order)

**Phase 0 — Cloudflare account setup (operator, see §6 checklist).** Register, create bucket, create API token.

**Phase 1 — Build the adapter (Claudio).**
- Add `@aws-sdk/client-s3`, write `R2StorageService`, extend env schema + `getProjectStorage()`.
- `npx tsc --noEmit` clean. Adapter is dormant until R2 env vars are set — **zero impact on the live app.**

**Phase 2 — Bulk copy existing files Supabase → R2 (one-time).**
- Supabase Storage exposes an S3‑compatible endpoint, so the cleanest copy is S3→S3 via **rclone** (one config, one `rclone copy`, preserves keys). Fallback: a Node script that lists every object, reads via the existing Supabase adapter, writes via the R2 adapter.
- ~1.5 GB / a few hundred files — minutes, not hours.

**Phase 3 — Verify (no cutover yet).**
- Object count matches (Supabase vs R2).
- Checksum spot‑check: every render row already stored a `sha256`; sample N files from R2 and confirm the hash matches the DB. (Full sweep if partner wants belt‑and‑suspenders.)

**Phase 4 — Cutover.**
- Set the R2 env vars on Railway (+ local `.env`), redeploy.
- App now reads/writes R2. Supabase storage is untouched (intact backup).
- Smoke test: open the book in the app, confirm images load; run one fresh render and confirm it writes to R2 and displays.

**Phase 5 — Decommission (later, optional).**
- After a confidence window with R2 serving cleanly, optionally delete the Supabase `project-files` bucket to stop paying storage there. **Nothing is deleted in this migration** — this is a deliberate later step on the operator's say‑so.

---

## 5. Optional Phase 2 optimization (defer)
R2 supports a **public bucket + custom domain**. We could later serve images straight from R2 to the browser, bypassing the backend proxy entirely — eliminating even Railway egress and offloading bandwidth to Cloudflare's CDN. Not needed now; the backend‑proxy model migrates as‑is. Flagged for later.

---

## 6. What the operator must do on Cloudflare (hand to operator)

You're not registered yet, so:

1. **Register:** go to **https://dash.cloudflare.com/sign-up**, create an account, verify email.
2. **Enable R2:** in the dashboard left nav click **R2**. It will ask you to **add a payment method** (a card) even though our usage is in the free tier — R2 requires one on file. No charge at our volume.
3. **Create the bucket:** R2 → **Create bucket** → name it exactly **`project-files`** → location **Automatic** → Create. Leave it **private**.
4. **Create an API token:** R2 → **Manage R2 API Tokens** → **Create API token** → permission **Object Read & Write** → scope to the `project-files` bucket → Create. Cloudflare shows you **once**:
   - **Access Key ID**
   - **Secret Access Key**
   Copy both immediately.
5. **Get your Account ID:** on the R2 overview page (or any dashboard page URL), copy the **Account ID** — it forms the endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
6. **Send Claudio these 4 values:** Account ID, Access Key ID, Secret Access Key, bucket name (`project-files`). I put them in `.env` + Railway and run Phases 1–4.

> Security: paste the secret to me only when you're ready to migrate; it's a write key to your storage. We'll set it as an env var, never commit it.

---

## 7. Rollback — Supabase-only mode (one move, no data loss)

The migration is built to be undone instantly at any stage, because nothing is ever
removed from Supabase until an explicit, verified prune.

**To roll back to pure Supabase:**
1. **Remove (or blank) the three R2 secrets** wherever they're set:
   - Local: delete the `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` lines from the repo-root `.env` (or set them empty). `R2_BUCKET` can stay; it's inert without the keys.
   - Railway (only if prod was ever cut over): same three vars → delete in the backend service Variables, redeploy.
2. That's it. `isR2StorageConfigured()` now returns false, so `getProjectStorage()` selects `SupabaseStorageService` directly — **no R2 in the path at all.** No code change, no code redeploy, no merge to revert.

**Why it's safe:**
- Selection is purely env-driven: R2 keys present → R2 (+Supabase fallback); R2 keys absent → Supabase only.
- The migration is **additive** — it only ever *writes* to R2 and *reads* from Supabase. Supabase keeps every file. **No file is deleted from Supabase until the prune step, which is gated behind full verification + explicit approval.**
- Until prune runs, R2 and Supabase both hold the keeper set, so either can serve alone.

**Verification commands (read-only, safe anytime):**
- `_r2count.ts` — object count + GB currently in R2.
- `_r2migrate.ts --keepers-only --verify` — reconcile R2 vs Supabase (missing / size-mismatch).
- `_storagecheck.ts` — prove which backend is active and that a write/read round-trips.
