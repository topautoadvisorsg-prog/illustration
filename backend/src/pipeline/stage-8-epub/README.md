# Stage 8 — Ebook Export (EPUB)

**Status:** v1 IMPLEMENTED (text-first reflowable). See `SPEC_EPUB_EXPORT.md`.
Code: `assemble-epub.ts` (pure model builder, unit-tested), `build-epub.ts` (I/O
orchestrator), API `src/api/epub.routes.ts`, local runner `scripts/build-epub-local.ts`.
READ-ONLY against book data — no re-render, no image spend, print pipeline untouched.

**What it does:** Generates a Kindle-compatible reflowable EPUB directly from the
existing structured book data (real page reading text + chapter/entry titles +
metadata + cover). **Not** from the PDF or the baked full-page renders — both bake
text into pixels and produce broken reflow / unreadable text.

**v1 scope:** real selectable text, TOC, metadata, front matter (title/copyright/
intro), 8 body chapters with entries (heading + scientific name + body), glossary,
about-the-series, cover image with alt text. Skips: half-title, title-page art,
the print contents page (EPUB auto-TOC replaces it), and the page-number index
(meaningless in reflow). Entry illustrations are omitted until clean illustration-
only art exists (the only images today are baked full-page renders). The model
leaves a hook for per-entry art when available.

**Run locally:** `node ../node_modules/tsx/dist/cli.mjs scripts/build-epub-local.ts`
(PROJECT_ID from env) → writes `THE_WILDLANDS_KINDLE.epub` to Downloads.
**API:** `POST /api/projects/:id/export/kindle-epub` (bytes) ·
`GET …/export/kindle-epub/preview` (build report JSON).

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
