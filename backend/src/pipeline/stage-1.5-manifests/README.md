# Stage 1.5 — Manifest Generation ⭐

**Status:** Phase 0 — scaffold only. First production code lands in Phase 1.5; Spike 2 prototypes a hand-authored manifest to skip Claude for the vertical slice.

**What it does:** Reads the full manuscript exactly once via Claude (Sonnet 4.5) and produces three levels of manifests:

1. **Book manifest** — full scope, chapter list, total pages, total images
2. **Chapter manifests** — one per chapter, lists all page IDs
3. **Page manifests** — one per page, contains everything needed for image generation and layout

**After this stage, the full manuscript is never loaded again.** All downstream stages read only the relevant page manifest. This is the single most important architectural decision in the pipeline — it cuts token usage by ~90% across Stages 2–8.

**Input:**
- `project_id`
- Canonical manuscript path (from Stage 1)
- Project config JSON (typography, brand, layout rules)

**Output:**
- `STORAGE_ROOT/{brand}/page-plan/{book_id}/book_manifest.json`
- `STORAGE_ROOT/{brand}/page-plan/{book_id}/chapters/CH{NN}_manifest.json` (one per chapter)
- `STORAGE_ROOT/{brand}/page-plan/{book_id}/pages/{book_id}_P{NNN}.json` (one per page)
- DB rows in `manifests` table linking all three levels
- Returns: `{ total_pages, total_chapters, total_entries, total_images_needed }`

**How to run it locally:**
```bash
# Phase 1.5
curl -X POST http://localhost:8001/api/projects/{id}/manifests \
  -H "Authorization: Bearer $TOKEN"
```

**Claude config (locked):**
- Model: `claude-sonnet-4-5-20250929`
- Temperature: `0`
- Mode: tool-calling with strict JSON schema (no freeform JSON in prose)
- Max retries: 3, exponential backoff
- Schemas live in `@wildlands/shared/manifests/*`

**What can go wrong:**

| Symptom | Cause | Fix |
|---|---|---|
| Claude returns malformed JSON | Tool-call schema mismatch | Re-prompt with strict schema; cap at 3 retries then dead-letter |
| Wrong chapter count | Manuscript headings non-standard | Manual override via API: `?force_chapters=N` |
| Hits Claude rate limit | Concurrent project ingestion | Serialize manifest jobs in BullMQ (concurrency=1) |
| Token budget exceeded on huge manuscripts | Manuscript > Claude context window | Chunk by chapter, but ONE call per chapter only — never re-load full text |

**Design notes:**
- One call per chapter is acceptable, but the full manuscript is never re-loaded after Stage 1.5 completes.
- Page numbers are *estimated* from word count + layout heuristic. Final page numbers come out of Stage 6 (layout engine).
- Joi → Zod: validation done with Zod schemas from `@wildlands/shared`.
- Drift between manifest and final layout is expected; manifests are the planning artifact, not the final page count.
