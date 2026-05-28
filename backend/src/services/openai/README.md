# services/openai

**Status:** Phase 0 — scaffold only. Implementation in Spike 2 (D2) and lifted into production worker in Phase 3.

Typed wrapper around the OpenAI SDK for **gpt-image-1** only.

**What it does:** Image generation. Nothing else. (Text models go via Claude.)

**What can go wrong:**
- 403 `model_not_found` — org not verified for `gpt-image-1`
- 400 `prompt_too_long` — > 4000 chars; Stage 2 should have caught
- 429 — rate limit
- Empty response — retry with backoff

**Conventions:**
- Prompt assembly happens in Stage 2 — this service is dumb transport.
- Returns base64 PNG; decoded to disk by the caller (Stage 3 worker).
- Cost meter: every call writes USD spend to `image_gen_usage` table.
