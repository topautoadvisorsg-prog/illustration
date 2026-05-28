# Stage 5 — Upscale (Replicate Real-ESRGAN)

**Status:** Phase 0 — scaffold only. Spike 2 calls Replicate directly; Spike 4 (D7) validates DPI quality across 5 images before production worker is built.

**What it does:** Takes approved images and upscales them to ≥300 DPI at print dimensions using Replicate's Real-ESRGAN model. Validates output via Sharp.js DPI gate.

**Input:**
- Approved image from Stage 4 (`generated/{page_id}_v{N}.png`)
- Target print dimensions from project config (8.5×11 inches for v1)

**Output:**
- `STORAGE_ROOT/{brand}/assets/{book_id}/upscaled/{page_id}_v{N}_300dpi.png`
- DB row updated: `dpi_w`, `dpi_h`, `upscaled_path`, `status = 'PRINT_READY'`
- Page status moves to `UPSCALED`

**Replicate config:**
- Model: `nightmareai/real-esrgan` (latest stable)
- Scale factor: 4× (gpt-image-1 native ~1792×1024 → ~7168×4096 oversize, then crop/resize via Sharp)
- Face enhance: OFF (we generate illustrations, not photos)

**DPI gate (Sharp.js):**
```ts
effectiveDPI_w = pixels_w / print_width_inches
effectiveDPI_h = pixels_h / print_height_inches
if effectiveDPI_w < 300 || effectiveDPI_h < 300 → FAIL → re-upscale at higher factor
```

**How to run it locally:**
```bash
yarn workspace @wildlands/backend run worker:upscale
```

**What can go wrong:**

| Symptom | Cause | Fix |
|---|---|---|
| Replicate 429 | Hit account RPS limit | Lower BullMQ concurrency; check Replicate tier |
| Output blurry despite 4× scale | gpt-image-1 source too small | Generate at 1792×1024 minimum |
| DPI gate fails twice | Print dimensions wrong in config | Verify `print_specs.page_size_trim` in project config |
| Sharp errors on PNG | Corrupted download from Replicate | Re-fetch; verify download stream integrity |

**Design notes:**
- One automatic retry at higher scale factor. After second failure, page status → `FAILED_DPI` and Sentry alert fires.
- We use Replicate over Topaz because Topaz's API access tier is gated/uncertain; Real-ESRGAN gives equivalent results for illustrated/painted content.
- Spike 4 validates this end-to-end with 5 real gpt-image-1 outputs before this code goes to production.
