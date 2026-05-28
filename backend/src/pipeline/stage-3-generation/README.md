# Stage 3 — Image Generation

**Status:** Phase 0 — scaffold only. Spike 2 calls gpt-image-1 directly (no BullMQ); BullMQ worker integration in Phase 3.

**What it does:** Consumes the BullMQ `image-generation` queue, calls OpenAI gpt-image-1 with the assembled prompt, stores the raw PNG, records a new version row.

**Input:**
- Page manifest with locked `image_prompt`
- Worker config (concurrency, timeout, retry policy)

**Output:**
- `STORAGE_ROOT/{brand}/assets/{book_id}/generated/{page_id}_v{N}.png`
- DB row in `images` table: `{ page_id, version, prompt_hash, path, status: 'GENERATED' }`
- BullMQ job moved to completed; page status set to `REVIEW`

**How to run it locally:**
```bash
# Start the worker in another terminal
yarn workspace @wildlands/backend run worker:image-generation

# Then enqueue via API
curl -X POST http://localhost:8001/api/pages/{page_id}/generate-image \
  -H "Authorization: Bearer $TOKEN"
```

**OpenAI gpt-image-1 config:**
- Model: `gpt-image-1`
- Size: `1792x1024` or `1024x1792` (vertical for portrait pages) — confirm in Spike 2
- Quality: `high`
- Format: PNG, base64 returned and decoded server-side

**What can go wrong:**

| Symptom | Cause | Fix |
|---|---|---|
| 403 `model_not_found` | Org not verified for gpt-image-1 | Complete OpenAI org verification |
| 400 `prompt_too_long` | Prompt > 4000 chars | Stage 2 should have caught this — investigate |
| 429 rate limit | Concurrency too high | Lower BullMQ concurrency; check OpenAI tier RPM |
| Silent timeout > 60s | API stalled | Worker timeout 90s; sentry alert on retry exhaustion |
| Image is text-rendered ("This is a [subject]") | Prompt instructed model to render text | Master Style Block has "NO TEXT" rule — review prompt assembly |

**Design notes:**
- Every generation gets a new version number. Never overwrite.
- `prompt_hash` (SHA-256 of full prompt) is stored — re-running same prompt is deduped at the worker level if `idempotency_key` matches.
- Failed jobs go to dead-letter queue after 3 retries with exp backoff (5s, 30s, 120s). Sentry alert fires on DLQ entry.
