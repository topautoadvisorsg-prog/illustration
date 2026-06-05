# Runbook

> What to do when X breaks. Living document — append entries as new failure modes are discovered.

---

## ⚠ PRODUCTION REQUIREMENT: durable storage (read first)

**Images and assets MUST use durable Supabase Storage in production.** Local
ephemeral storage is acceptable **only** for local development and must **never**
be used in production — Railway's container disk is wiped on every redeploy, so
anything written locally (generated images, rendered PDFs) is silently lost.

Enforced in code:
- `getProjectStorage()` (`backend/src/services/storage/project-storage.ts`) uses
  Supabase when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set. In
  `NODE_ENV=production` it **throws** rather than silently falling back to local
  disk.
- Boot log states the active backend every deploy ("durable (Supabase)" vs
  "EPHEMERAL local disk").
- **`GET /health`** reports `storage`, `storageDurable`, `db`, and `projectCount`.

**Confirm durability after any deploy with one call:**
```
GET https://<backend>/health
=> { "storage": "supabase", "storageDurable": true, "db": "connected", ... }
```
If `storageDurable` is `true` and `storage` is `supabase`, the library is safe
across redeploys. If it shows `local-ephemeral`, set the missing Supabase env
vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) on the backend service.

---

## "All smoke tests SKIPPED"

**Cause:** `.env` still has `your_*_here` placeholders.
**Fix:** Replace placeholder values with real API keys. Re-run `yarn smoke`.

## "Env validation failed" at boot

**Cause:** A required env var is entirely missing from `.env`.
**Fix:** Diff `.env.example` vs `.env`; add missing keys. The error message lists exact paths.

## Backend won't start: `Cannot find module '@wildlands/shared'`

**Cause:** Yarn workspace not linked.
**Fix:** Run `yarn install` from repo root, not from `/backend`.

## Pino logs are unreadable JSON in dev

**Cause:** `pino-pretty` transport didn't load.
**Fix:** Ensure `NODE_ENV=development` in `.env`. Check `pino-pretty` is installed.

## BullMQ worker can't connect to Redis

**Cause:** Likely using Upstash **REST** URL instead of **TCP** URL.
**Fix:** Use the `rediss://` URL from Upstash dashboard's "TCP/Native" section, not the REST URL.

## OpenAI returns 403 for `gpt-image-1`

**Cause:** Organization not verified for image generation.
**Fix:** Complete org verification at platform.openai.com → Settings → Organization.

## Replicate prediction stuck in `starting` for > 60s

**Cause:** Cold start on Replicate side or model unavailable.
**Fix:** Worker should kill + retry. If persistent, switch model version in `REPLICATE_UPSCALE_MODEL`.

## Sharp install fails on `yarn install`

**Cause:** Missing platform prebuilds.
**Fix:** `yarn add sharp --ignore-scripts=false`. On ARM Macs, `brew install vips` first.

## Supabase admin call returns 401

**Cause:** Used `SUPABASE_ANON_KEY` where `SUPABASE_SERVICE_ROLE_KEY` is required.
**Fix:** Server-side ops require the service role key. Anon key is browser-only.

## PDF won't open in Acrobat — "format error"

**Cause:** Truncated write, missing trailer, or invalid xref.
**Fix:** Run `pdfinfo` and `qpdf --check` to identify; re-run the producing stage.

## KDP rejects PDF upload

**Common causes:**
- Wrong page size (must be 8.625×11.25 for 8.5×11 bleed)
- Missing color profile (must embed sRGB IEC61966-2.1)
- Image below 300 DPI somewhere in the book

**Fix:** Run preflight via Acrobat or `gs` checker before upload.
