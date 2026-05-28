# Spike 2 — Vertical Slice

**Goal:** Take one entry (Chanterelle) through every pipeline stage end-to-end to validate the toolchain works. **No production code lives here** — this is a controlled prototype.

**Days:** D2 (steps A–E, no layout) + D3 (step F, layout/PDF integrated with Spike 1 frontrunner)

---

## Steps

| # | Step | Stage equivalent | Real API needed? | Output |
|---|---|---|---|---|
| A | Load hand-authored page manifest | 1.5 | No | parsed `PageManifest` in memory |
| B | Assemble image prompt deterministically | 2 | No | full prompt string ready for gpt-image-1 |
| C | Call OpenAI gpt-image-1 | 3 | **Yes** — `OPENAI_API_KEY` (org-verified) | `generated/{page_id}.png` |
| D | Call Replicate Real-ESRGAN to upscale to 300 DPI | 5 | **Yes** — `REPLICATE_API_TOKEN` | `upscaled/{page_id}_300dpi.png` |
| E | Sharp DPI gate at print dimensions (8.5×11) | 5 | No | PASS / FAIL report |
| F | Layout single page → print-ready PDF | 6 | No | `chanterelle-page.pdf` (D3 — after Spike 1) |

---

## How To Run

```bash
# Run all steps that don't need real keys (A, B, E with placeholder PNG):
yarn workspace @wildlands/backend tsx ../spikes/vertical-slice/run.ts --skip-apis

# Run full pipeline (requires real OPENAI_API_KEY + REPLICATE_API_TOKEN):
yarn workspace @wildlands/backend tsx ../spikes/vertical-slice/run.ts

# Run a specific step in isolation:
yarn workspace @wildlands/backend tsx ../spikes/vertical-slice/run.ts --step=B
```

Output written to `/spikes/output/vertical-slice/` (gitignored).

---

## What Success Looks Like

End of D2:
- ✅ Steps A, B run cleanly without keys
- ✅ Step E correctly fails on placeholder PNG with too-low DPI
- ✅ With real keys: Step C produces a believable Chanterelle PNG that matches the Master Style Block aesthetic
- ✅ With real keys: Step D upscales to ≥300 DPI at 8.5×11

End of D3:
- ✅ Step F produces a single-page PDF that opens in Acrobat
- ✅ PDF page size = 8.625×11.25 in (bleed-inclusive)
- ✅ Image embedded at 300+ DPI
- ✅ Body text + entry title + scientific name overlaid correctly
- ✅ Total file size reasonable (<10MB for one page)

---

## What Can Go Wrong (Spike-Specific)

| Symptom | Cause | Fix |
|---|---|---|
| `.env` not loaded | Run from wrong dir | Always invoke from repo root via `yarn workspace ...` |
| Step C blocked by `org_not_verified` | OpenAI account not verified for image gen | Complete org verification at platform.openai.com |
| Step C generates text-in-image | Negative rules not making it into prompt | Verify Step B output — `NEGATIVE RULES` block must be present |
| Step D returns null prediction | Replicate model cold-start or crash | Re-run; tune polling timeout |
| Step E fails because Replicate output too small | Upscale scale factor too low | Bump to 4× and retry |
| Master Style Block too long | Prompt exceeds 4000 chars | Trim style block; log warning if subject + annotations push over limit |
