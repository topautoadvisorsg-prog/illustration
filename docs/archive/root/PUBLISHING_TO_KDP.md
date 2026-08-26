# Publishing to KDP — How a Wild Lands Volume Is Built

This is the end-to-end process that produces the two **print-ready, KDP-compliant
PDFs** for a Wild Lands volume:

- **Interior PDF** — every page at 300 DPI, sized for KDP.
- **Full-wrap cover PDF** — back + spine + front, spine sized to the page count.

It documents the real, working build used for **Volume I — THE WILDLANDS: NEW
ENGLAND** (275 pages), including the two gotchas that aren't obvious (file size
and assembly memory) and how they're handled.

> **⚠ READ FIRST — Volume I shipped as HARDCOVER, not paperback.** The interior
> below is correct and unchanged, but the **cover** is the hardcover full-wrap
> built by the AI-baked blueprint flow in **§8**, not the paperback cover in §3/§4.
> Current upload files and the locked cover decisions (no barcode, no bio,
> full-bleed art, AI-baked text) are in **§8**. See the "where we left off" status
> at the end of §8.

---

## 1. The pipeline

```
Manuscript → Breakdown → Paginate → Front/Back Matter → Render → Print-Prep → Build Book → KDP
```

| Stage | What it does |
|-------|--------------|
| **Manuscript** | Master text ingested. |
| **Breakdown** | Split into chapters + entries. |
| **Paginate** | Flow the body into pages (`plannedPageNumber`). |
| **Front/Back Matter** | Build title, copyright, contents, intro, glossary, index, about-series. |
| **Render** | The whole-page AI renderer bakes text + art into each page image. |
| **Print-Prep** | Stamp page numbers, compose at 300 DPI, encode JPEG, run preflight, write a single-page print PDF. **This is the DPI step.** |
| **Build Book** | Merge all print PDFs into one interior PDF + render the cover PDF. |

### Approved ≠ print-ready (important)
A page being **approved for book** does **not** mean it has been print-prepped.
Two separate states:

- **Approved** = `active && approvedForBook` (the operator picked this render).
- **Print-ready** = it also has a **print PDF** (`printPdfPath`) and **passed
  preflight**. Only print-ready pages can be assembled.

The console shows both badges (`✓ approved` and `✓ print-ready` / `⚠ needs
print-prep`). **Always re-run print-prep after re-rendering or editing a page** —
re-approval alone leaves the old (or no) print output behind.

---

## 2. Print-Prep specifics (the DPI step)

- **Resolution:** 300 DPI. A 7×10″ page with 0.125″ bleed = **2175 × 3075 px**
  (2175 / 7.25 = 300).
- **Image format in the print PDF:** **JPEG, quality 88, 4:4:4 chroma** (no
  subsampling, so text edges and fine botanical lines stay crisp).
  - *Why not lossless PNG?* PNG made each print PDF ~14 MB → a 275-page interior
    was **~3.9 GB**, which both OOMs the assembler and is far over KDP's **650 MB**
    interior limit. JPEG q88 → ~1.9 MB/page → **~527 MB** interior (under the cap).
  - Set in `backend/src/pipeline/print-prep/print-prep.ts` (`sharp.jpeg({ quality: 88, chromaSubsampling: '4:4:4' })`).

### Folio (page number) policy
Stamped in `print-prep.ts` (`computeFolioLabel`):

| Section | Folio |
|---------|-------|
| Front matter (half-title, title, copyright, contents, introduction) | **none** |
| Body chapters | **Arabic**, = `plannedPageNumber` (matches the TOC and Index) |
| Glossary, Index | **continue** the body sequence (`maxBodyPage + spineOrder`, e.g. 259, 260…) |
| About-the-Series (closing brand page) | **none** |

A title page must never show "2"; the glossary must never restart at "1". Both
are guarded by this policy.

### Badge policy
The hazard/region/source badge taxonomy is a **reserved draft** and is **not
wired** to page metadata. The only values present are the fallbacks `GENERAL` /
`GENERAL_REFERENCE`, which are **suppressed** (`badges-for-page.ts`) so no generic
compass/"G" seals are stamped. Hazard warnings live in the **page text**, where
they are proofed. (When the real taxonomy is wired, real badges will stamp; only
the fallbacks are suppressed.)

---

## 3. Build Book — assemble + cover

### Two gotchas
1. **The assembler loads every print PDF into memory at once.** At ~2 MB/page the
   275-page merge peaks well over 1 GB — **the deployed backend OOMs (returns
   502).** Run the assemble **locally with a large heap**.
2. **Supabase Storage can't take the ~527 MB interior** (the upload fails from a
   local connection). So the build writes the PDFs **straight to local disk** —
   which is fine, because **KDP uploads from your computer anyway.**

### The build command (local, writes to Downloads)
```
cd backend
railway run --service "@wildlands/backend" -- \
  node --max-old-space-size=8192 ../node_modules/tsx/dist/cli.mjs \
  scripts/build-local2.ts <projectId> "C:/Users/<you>/Downloads"
```
This reuses the production spine order (`resolveSpine`) and PDF merge
(`mergeSinglePagePdfs`), then renders the cover (`renderCoverPdf`). Output:
```
THE_WILDLANDS_NEW_ENGLAND_interior.pdf
THE_WILDLANDS_NEW_ENGLAND_cover.pdf
```

> Print-prep itself runs fine on the deployed backend (in-datacenter, fast). Only
> the final **assemble** is run locally. To print-prep all pages quickly, hit the
> deployed `/print-prep` endpoint per render (see `scripts/printprep-http.ts`).

---

## 4. Final spec (Volume I) + validation

| Item | Value |
|------|-------|
| Interior pages | **275** |
| Page size (incl. bleed) | **7.25 × 10.25″** (7×10 trim + 0.125″ bleed) |
| Resolution | **300 DPI** |
| Interior file size | **~527 MB** (KDP cap 650 MB) |
| Cover wrap | **14.8693 × 10.25″** |
| Spine | **0.6193″** = pages × **0.002252″/page (white paper)** |
| TrimBox (per page) | **7.0000 × 10.0000″**, inset 0.125″ — declares KDP's exact trim |

### Bleed & TrimBox
Each page is **7.25 × 10.25″** (0.125″ bleed on all four sides). The build stamps a
**TrimBox of 7 × 10″ centred** on every page (`build-local2.ts` → `mergeWithTrimBox`),
so KDP trims to exactly 7 × 10 regardless of the symmetric bleed. This is geometry
metadata only — artwork, folios, and print-prep output are untouched. (KDP's
minimal stated full-bleed size is 7.125 × 10.25; we provide more bleed plus an
explicit TrimBox, which is press-ready.)

Validate the actual files before upload:
```
node ../node_modules/tsx/dist/cli.mjs scripts/validate-delivery.ts
```
Checks: page count = 275, every page 7.25×10.25, cover 14.8693×10.25, on-disk
sizes. Confirm DPI separately by reading any print PNG (2175×3075 → 300 DPI).

---

## 5. Uploading to KDP (done by the publisher)

1. New paperback → **Trim 7 × 10″**, **Bleed: Yes**, **Paper: White**.
   - ⚠ **Paper must be White.** The spine (0.6193″) assumes white-paper thickness
     (0.002252″/page). Cream paper is thicker → KDP computes a different spine and
     the wrap won't align.
2. **Interior** = `…_interior.pdf`. **Cover** = `…_cover.pdf` (full wrap).
3. Run **KDP Previewer** (KDP's own browser tool) and eyeball the rendered preview,
   especially cover alignment.

KDP Previewer is account-gated and run on KDP's site — it is **not** something the
build performs. The build runs the equivalent local structural checks (size, trim,
bleed, page count, spine formula).

---

## 6. Operator scripts (backend/scripts)

| Script | Purpose |
|--------|---------|
| `prebuild-audit.ts` | 8-point readiness check (print-prep, preflight, approved, cover sync, section map). |
| `printprep-http.ts` | Batch print-prep via the deployed backend (`force` re-preps all; `only=<id,…>` targets). |
| `build-local2.ts` | Assemble interior + render cover to local disk (the real Build Book). |
| `validate-delivery.ts` | Verify the generated PDFs (page count, dimensions, sizes). |
| `badge-inventory.ts` | Report badge usage across the book. |
| `scan-terms.ts` | Terminology audit (regional/British/archaic term scan). |

| `diag-print-sizes.ts` | Per-page print-PDF size report (spot PNG/q-level bloat). |
| `bodymax.ts` / `inspect-audit-sources.ts` | Back-matter folio map / TOC↔chapter check. |
| `dl-one.ts` · `crop-img.ts` · `thumb.ts` | Download a storage file / crop / thumbnail for visual review. |

> These live in `backend/scripts/` and run via `railway run` so they get the
> production database, storage, and API credentials from the environment.
> **One-off, per-book scripts (cover-text swaps, individual page-art edits) are
> archived in `backend/scripts/_scratch/`** to keep the toolkit clean — reusable
> templates if a future book needs the same kind of edit.

---

## 7. Starting a new volume (Volume II+)

A new book runs the **same pipeline**. Once the manuscript is rendered and the
operator has reviewed/approved pages in the console, the build runbook is:

```
1. (optional) scan-terms.ts <manuscript.txt>     # terminology audit → fix in text, re-render affected pages
2. printprep-http.ts <projectId> 4 force          # print-prep all pages: 300-DPI q88 (page numbers + preflight)
3. prebuild-audit.ts <projectId>                  # must print RESULT: PASS (275/275 etc.)
4. diag-print-sizes.ts <projectId>                # confirm all pages ~q88 (no PNG stragglers) → interior < 650MB
5. build-local2.ts <projectId> "<outDir>"         # assemble interior (+TrimBox) + cover → local disk
6. validate-delivery.ts                           # page count, page size, TrimBox 7x10, cover dims, file sizes
7. upload to KDP                                   # 7x10 trim, Bleed: Yes, Paper: White
```

**Per-book settings to change in the scripts for a new volume:**
- The **project ID** is passed as an argument (no edit needed).
- `build-local2.ts` / `validate-delivery.ts` currently **hardcode the output
  filename + cover dimensions for Volume I** (`THE_WILDLANDS_NEW_ENGLAND_*`,
  `14.8693 × 10.25`). Update those for the new title + its page-count spine, or
  parameterize them.
- The TrimBox in `build-local2.ts` assumes a **7×10 trim**; change `mergeWithTrimBox(ordered, 7, 10)` if the new book uses a different trim.

Everything else — folio policy, badge suppression, q88/300-DPI, the local-assemble
+ local-disk workaround — carries over unchanged.

---

## 8. Hardcover cover (Volume I — the actual shipped cover)

Volume I is published as a **HARDCOVER (Case Laminate)**. The interior is identical
to the spec above (275 pages, 7×10 trim, 300 DPI, ISBN **9798181958814** on the
copyright page). Only the **cover** differs from §3/§4 — it is a hardcover full
wrap, and the text is **painted into the art by the AI (baked), NOT composited/
stamped in code.**

### KDP hardcover geometry (from KDP's cover calculator — NEVER change)
| Item | Value |
|------|-------|
| Full wrap | **16.409 × 11.417 in** |
| Spine | **0.834 in** (275 pages, premium color) |
| Front/back panel | 7.197 in each |
| Wrap / hinge / safe inset | 0.591 / 0.394 / ~0.5 in |
| Page count the spine assumes | **275** (changing page count changes the spine → must rebuild cover) |

### Locked decisions (the operator was emphatic — do not reintroduce)
- **AI-baked text only.** Deterministic/code-stamped text was rejected ("looks
  stamped, doesn't match the art"). The AI paints the engraved serif text into the
  plate. Margin control comes from the blueprint + prompt, not from stamping.
- **NO barcode. Anywhere.** Not drawn on the cover, not mentioned in the prompt,
  not reserved as a zone. Amazon stamps the barcode itself over the art.
- **NO author bio on the back cover** (redundant + crowded the space). Back cover =
  **lead paragraph + "INSIDE THIS VOLUME" list only.** The bio is also **not** in
  the interior (the about-series bio fold was a dry-run, never committed).
- **Illustration is FULL-BLEED, edge to edge,** bleeding off all four sides. The
  red safe zone constrains **TEXT ONLY** — never the artwork.
- **Front margins:** ~0.5 in clear illustration above the title AND below the
  series line (symmetric top/bottom). Back cover margins were approved as-is.

### The flow (single source of truth) — FINAL / APPROVED
The cover prompt is the operator-authored **`MASTER_COVER_PROMPT`**, assembled by **`buildMasterPrompt(backCover)`**. This replaced the older `buildCoverWrapPrompt` + `injectProductionRules` path — do not revert to it.

| File | Purpose |
|------|---------|
| `backend/scripts/lib/cover-blueprint.ts` | **Source of truth.** `MASTER_COVER_PROMPT` (operator's verbatim cover prompt) + `buildMasterPrompt(backCover)` (appends the exact back-cover copy; neutralizes every "barcode" trigger so the model never paints a fake ISBN; appends the no-barcode, 1-inch-margin, title-top-margin, and horizontal-center overrides). `buildBlueprintSvg` (red text zones, full-bleed illustration, hinges, NO barcode). `stripAuthorBio`. (`BACKGROUND_SCENE_DIRECTION`, `PRODUCTION_LAYOUT_RULES`, `injectProductionRules` remain but are unused by the current cover flow.) |
| `backend/scripts/show-blueprint.ts <projectId>` | **Free** preview — writes `hardcover_blueprint.png/.svg` + `hardcover_cover_PROMPT.txt` (the master prompt) to Downloads. No AI spend. Review/tune before generating. |
| `backend/scripts/hardcover-blueprint.ts <projectId>` | **Paid** generation — feeds the blueprint + master prompt to `generateImageFromBlueprint` (gpt-image), composes the wrap PDF at 16.409×11.417, writes `THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf` + `hardcover_cover_review.png` to Downloads, and pushes the art to the console preview path (`cover/cover-wrap-art.png`). |

**The barcode in the KDP previewer is Amazon's own** (correct ISBN, placed in the lower-left we keep clean) — our file contains no barcode. That is correct, not a defect.

Run via `railway run --service "@wildlands/backend" -- node ../node_modules/tsx/dist/cli.mjs scripts/<script>.ts <projectId>` (project ID `66c1c69c-2c81-409e-a4b5-bff3f3bb04ba`).

### Showing the rendered cover to the operator
The cover is a **raster painting** — the inline visual widget only renders vector
diagrams (the blueprint), NOT the painting. To let the operator see the actual
cover: have them **open `C:/Users/jovan/Downloads/hardcover_cover_review.png`**
directly, or **hard-refresh the console (Ctrl+Shift+R)** — the console caches the
old image and busts cache only on reload. Do **not** burn time trying to base64-embed
the painting into the widget.

### Upload files (current)
| File (in Downloads) | What |
|---------------------|------|
| `THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf` | Hardcover full wrap — **the cover to upload** (16.409×11.417, 1 page, ~5 MB). |
| `THE_WILDLANDS_NEW_ENGLAND_interior OG.pdf` | Interior — **unchanged** (491 MB, 275 pp, ISBN on copyright). Re-upload only if KDP lost it. |

KDP setup: **Hardcover → Case Laminate**, interior trim **7 × 10**, premium color,
Bleed: Yes. ISBN: "I own the copyright" / use the assigned ISBN 9798181958814.

### Where we left off (2026-06-17) — FINAL, APPROVED IN KDP PREVIEWER
Cover **finalized and approved by the operator in the KDP previewer** ("this is it").
Final layout: prominent bull moose front-and-center; secondary wildlife (bear, fox,
loon, eagle, canoeist) clearly visible; title centered and brought DOWN with a clear
sky band above it; author + series centered in the lower-middle; back copy = lead
paragraph + INSIDE THIS VOLUME; full-bleed art; NO barcode/ISBN/ornaments/bio in the
file. Amazon's own barcode renders in the previewer's clean lower-left. Cover PDF
validates clean (1 page, 16.409×11.417, 300 DPI, 4 MB). Interior unchanged (275 pp,
7×10 TrimBox, 300 DPI, ISBN 9798181958814 on copyright). Files in Downloads:
`THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf` (upload) + `..._interior OG.pdf`.
Next: operator clicks **Approve** in KDP. This master-prompt flow is the locked
template for future volumes.
