# Stage 8 — Ebook Export (EPUB)

**Status:** Phase 0 — scaffold only. Spike 5 (D9) validates EPUB quality end-to-end before production worker is built.

**What it does:** Generates a Kindle-compatible EPUB directly from page manifests and manuscript text. **Not** from the PDF — PDF-to-EPUB conversion produces broken reflow.

**Input:**
- All page manifests
- Approved/active upscaled images
- Project config (title, author, ISBN, series metadata)

**Output:**
- `STORAGE_ROOT/{brand}/output/{book_id}/editions/{book_id}_KINDLE.epub`
- DB row in `exports` table

**EPUB structure:**
- One XHTML file per chapter
- Cover image (TBD — covers handled in Phase 6)
- TOC auto-generated from chapter manifests
- Images embedded at **max 1600px wide** (Kindle practical cap)
- Metadata: title, author, ISBN, series, language, publisher

**How to run it locally:**
```bash
curl -X POST http://localhost:8001/api/projects/{id}/export/kindle-epub \
  -H "Authorization: Bearer $TOKEN"
```

**Library:** `epub-gen-memory` (better than original `epub-gen`, native Node, no Puppeteer dependency).

**What can go wrong:**

| Symptom | Cause | Fix |
|---|---|---|
| EPUBCheck warnings | Invalid HTML / missing alt text | Always set `alt` on `<img>`; validate XHTML before pack |
| Kindle Previewer crashes | Image > 1600px or > 5MB | Resize via Sharp to 1600px max before embed |
| TOC empty | Chapter manifests have no `name` | Validate chapter manifests at Stage 1.5 |
| Reflow broken | Hard-coded heights/widths in inline CSS | Use relative units only (em, %) |

**Validation tools (manual):**
- **EPUBCheck** (`epubcheck file.epub`) — must pass with zero ERRORs
- **Kindle Previewer** — visual check on Kindle Fire, basic e-ink, iPad
- Spike 5 (D9) validates this whole flow before production code is written.

**Design notes:**
- DPI is meaningless in EPUB — only pixel dimensions matter. The spec's "150 DPI minimum" is reinterpreted as **1000–1600px wide minimum**.
- EPUB and PDF outputs are produced from the same source manifests → guaranteed content parity.
- Color images embedded for full-color Kindle devices; basic e-ink shows grayscale fallback automatically.
