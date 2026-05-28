# services/replicate

**Status:** Phase 0 — scaffold only. Implementation in Spike 2 (D2) and Spike 4 (D7) validates quality before production worker.

Typed wrapper around the Replicate SDK for Real-ESRGAN upscaling.

**What it does:** Submits upscale predictions, polls until complete, downloads result.

**Why Replicate over Topaz:** Topaz API access tier is gated/uncertain; Real-ESRGAN gives equivalent results for illustrated content; pay-per-second pricing model on Replicate.

**Input:** Image path + scale factor + face_enhance flag.
**Output:** Path to upscaled PNG on disk.

**What can go wrong:**
- 401 — bad token
- 429 — RPS limit
- Prediction stuck in `starting` state > 60s — kill + retry
- Output is `null` — Replicate model crashed mid-run; retry

**Conventions:**
- Use streaming download — don't load entire upscaled image into memory.
- Cost meter: every prediction logs duration + USD estimate to `upscale_usage` table.
