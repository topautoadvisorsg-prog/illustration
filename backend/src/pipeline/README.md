# Pipeline

The 8-stage automated book-production pipeline. This is the product.

```
Stage 1     Manuscript Ingestion        manuscript.md uploaded & validated
Stage 1.5   Manifest Generation         book / chapter / page manifests written
Stage 2     Scene & Page Planner        per-page layout + image prompt assembly
Stage 3     Image Generation            gpt-image-1 illustration generation
Stage 4     Image Preview & Review      human approves or regenerates each image
Stage 5     Upscale                     Replicate Real-ESRGAN → 300 DPI
Stage 6     Layout Engine               per-chapter PDF rendering
Stage 7     Final PDF Compilation       chapter PDFs stitched + color profile embedded
Stage 8     Ebook Export                EPUB generated from page manifests
```

Each stage:
- Lives in `stage-N-name/`
- Has its own README answering the 5 standard questions
- Reads ONLY the data it needs (page manifests, not full manuscripts)
- Is idempotent — re-running produces the same artifact
- Logs every action with `stage`, `book_id`, `page_id`, `correlation_id`

---

## Stage Dependencies

```
1 → 1.5 → 2 → 3 → 4 (human gate) → 5 → 6 → 7
                                        ↘ 8 (parallel)
```

A page cannot move to Stage 5 without human approval at Stage 4.
A chapter cannot start Stage 6 until all its pages have completed Stage 5.
Stage 7 cannot start until all chapter PDFs from Stage 6 exist.
Stage 8 reads page manifests directly and can run in parallel with Stage 6/7.

---

## Status — Phase 0

All stage folders contain README stubs only. Implementation begins in Phase 1.5
after the vertical-slice spike (Spike 2) proves the end-to-end flow.
