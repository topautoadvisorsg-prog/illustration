# Stage 7 — Final PDF Compilation

**Status:** Phase 0 — scaffold only. Implementation in Phase 6 of the production build, after Stage 6 layout engine is proven.

**What it does:** Stitches all chapter PDFs into one final book PDF, embeds sRGB color profile, validates page count + bleed dimensions, hands off to operator for KDP upload.

**Input:**
- All chapter PDFs from Stage 6 (`output/chapters/{book_id}_CH{NN}.pdf`)
- Book manifest (for expected page count + chapter order)

**Output:**
- `STORAGE_ROOT/{brand}/output/{book_id}/editions/{book_id}_PREMIUM.pdf`
- DB row in `exports` table with file path + checksums

**Process:**
1. Load chapter PDFs in order CH00 → CH07
2. Merge via `pdf-lib`
3. Embed sRGB IEC61966-2.1 profile via Ghostscript post-process (pdf-lib does not natively embed ICC profiles)
4. Validate final page count == book manifest total
5. Validate every page is exactly 8.625×11.25 inches
6. Compute SHA-256 of final file
7. Mark export `READY`

**How to run it locally:**
```bash
curl -X POST http://localhost:8001/api/projects/{id}/export/premium-pdf \
  -H "Authorization: Bearer $TOKEN"
```

**What can go wrong:**

| Symptom | Cause | Fix |
|---|---|---|
| Page count mismatch | Layout produced fewer/more pages than manifest estimated | Acceptable; manifest count is estimate, layout count is authoritative |
| Ghostscript missing | Server lacks `gs` binary | Install: `apt-get install ghostscript` |
| Wrong page size in stitched PDF | Mixed bleed/no-bleed chapter PDFs | Re-render chapters at 8.625×11.25 strictly |
| KDP rejects upload | Bleed or color profile issue | Run `pdfinfo` and Acrobat preflight to confirm |

**Design notes:**
- pdf-lib does the cheap stitching. Ghostscript does the ICC profile embed.
- We do NOT re-render anything in this stage — only stitch and post-process.
- Final PDF kept on disk; operator uploads manually to KDP (no KDP API).
