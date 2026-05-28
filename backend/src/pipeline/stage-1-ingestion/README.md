# Stage 1 — Manuscript Ingestion

**Status:** Phase 0 — scaffold only. Implementation lands in Phase 1.5 after the Spike 2 vertical slice proves the end-to-end flow.

**What it does:** Accepts the manuscript `.md` upload, validates structure, normalizes encoding, stores the canonical copy on disk, and records the project in the DB.

**Input:**
- `project_id` (created by `POST /api/projects`)
- Raw `.md` file bytes (multipart upload)

**Output:**
- Canonical manuscript stored at `STORAGE_ROOT/{brand}/manuscripts/{book_id}_MASTER.md`
- DB row in `projects` updated with `manuscript_path`, `status = 'DRAFT'`
- Returns: `{ project_id, manuscript_path, chapter_headings_detected: string[], estimated_page_count: number }`

**How to run it locally:**
```bash
# Phase 1.5 — once implemented
curl -X POST http://localhost:8001/api/projects/{id}/manuscript \
  -H "Authorization: Bearer $TOKEN" \
  -F "manuscript=@./TW_NEW_ENGLAND_MASTER.md"
```

**What can go wrong:**

| Symptom | Cause | Fix |
|---|---|---|
| 400 `INVALID_MARKDOWN` | File is not UTF-8 / has BOM / has CRLF mismatch | Run through normalizer (NFC, LF endings, no BOM) |
| 400 `NO_CHAPTERS_DETECTED` | Manuscript doesn't follow heading conventions | Confirm `# Chapter N — Name` heading style |
| 413 Payload Too Large | Manuscript > 25MB | Raise multipart limit in `server.ts` or split |
| `ENOSPC` writing to disk | Storage root full | Free disk; in v2 swap to S3 |

**Design notes:**
- Validation is structural only — no semantic parsing yet. That happens in Stage 1.5.
- We never modify the manuscript. The on-disk copy is the canonical source.
- A SHA-256 hash of the manuscript is recorded so we can detect re-uploads and short-circuit re-processing.
