# Pipeline Spec (Distilled)

> Single source of truth for pipeline behavior. Detailed prose lives in the
> original blueprint; this is the operational contract the code implements.

## Stages

| # | Name | Reads | Writes | Async? | Human gate? |
|---|---|---|---|---|---|
| 1 | Manuscript Ingestion | `.md` upload | manuscript file + DB row | sync | no |
| 1.5 | Manifest Generation | manuscript + project config | book/chapter/page manifests | sync (one-shot per project) | no |
| 2 | Scene & Page Planner | page manifest + brand config + layout reference library | image prompt + layout decision | sync per page | no |
| 3 | Image Generation | image prompt | generated PNG | async (BullMQ) | no |
| 4 | Image Review | generated PNG | approval state | sync (API only) | **YES** |
| 5 | Upscale + DPI Gate | approved PNG | upscaled PNG at ≥300 DPI | async (BullMQ) | no |
| 6 | Layout (preview + per chapter) | references/placeholders or upscaled PNGs + manifests + config | text-fit previews + chapter PDF | async (BullMQ) | no (review at Phase 3 UI) |
| 7 | PDF Compilation | chapter PDFs | final book PDF + ICC | async | **YES** (export confirmation) |
| 8 | EPUB Export | page manifests + upscaled PNGs | EPUB file | async (parallel w/ 6+7) | **YES** (export confirmation) |

## Invariants

1. **Manifest immutability:** Once Stage 1.5 finalizes manifests, they are read-only for the lifetime of the project. Revisions create new manifest versions.
2. **Manuscript single-read:** Full manuscript is loaded once in Stage 1.5. Never re-loaded by Stages 2–8.
3. **Image version history:** Every regeneration creates a new version row. Previous versions never overwritten.
4. **DPI gate:** No image enters Stage 6 without `dpi_w ≥ 300 ∧ dpi_h ≥ 300`.
5. **Chapter-by-chapter rendering:** Stage 6 renders one chapter at a time; memory freed between chapters.
6. **Bleed-inclusive page size:** Stage 6 page dimensions = trim + bleed (8.625×11.25 for 8.5×11).
7. **EPUB ≠ PDF conversion:** EPUB is built from manifests directly, never from PDF.
8. **Cover typography:** Always overlaid by layout engine. No AI-generated text on covers, ever.
9. **Layout references are not generated art:** They guide template choice and preview shape. Final page text is rendered by Stage 6, never baked into images.
10. **Text-fit before image spend:** Stage 6 must prove the selected layout can hold the page text before Stage 3 spends image-generation credits for the final subject.
11. **Idempotency:** Re-running any stage with the same input produces the same output (same hashes).
12. **Failure capture:** Every worker failure logged to Sentry + DLQ before retry exhaustion.

## V1 Out-of-Scope (explicit)

- Mid-Tier, Economic, Large Print editions
- Kids edition
- Brands 2 (Wild Back Country) and 3 (The Wild Region)
- AWS S3 storage
- Multi-user authentication
- Real-time progress updates
- KDP API upload
- Dashboard UI (Phase 3)
